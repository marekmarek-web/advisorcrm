#!/usr/bin/env node
/**
 * Static audit — pro každou funkci v apps/web/src najde volání `.from(<tbl>)`
 * nad tenant-scoped tabulkou a ověří, že stejná funkce obsahuje některý
 * z těchto guard vzorů:
 *   - volání withAuthContext / withTenantContext / withTenantContextFromAuth / withClientAuthContext
 *   - eq(<tbl>.tenantId, …) / eq(<tbl>.tenant_id, …) v `where(...)`
 *   - proxy argument `tx` z withAuthContext, který nese implicitní GUC kontext
 *
 * Výstup: seznam funkcí s chybějícím guard. Exit code 1 pokud jsou nálezy.
 *
 * Spuštění:
 *   node tools/tenant-audit/audit-tenant-queries.mjs
 *
 * Žádné runtime závislosti — jen TypeScript compiler API.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const REPO_ROOT = resolve(new URL(".", import.meta.url).pathname, "..", "..");

// Known false positives — viz allow-list.json. Nové nálezy, které v allow-listu nejsou,
// způsobí CI fail. Tím vynucujeme explicitní rozhodnutí o každém novém tenant-scope
// volání, které neobsahuje standardní guard (wrapper nebo eq(X.tenantId, ...)).
let ALLOW_LIST = [];
try {
  const raw = readFileSync(
    resolve(new URL(".", import.meta.url).pathname, "allow-list.json"),
    "utf8"
  );
  ALLOW_LIST = JSON.parse(raw).entries ?? [];
} catch {
  ALLOW_LIST = [];
}

function isAllowed(finding) {
  return ALLOW_LIST.some(
    (e) => e.file === finding.file && e.fn === finding.fn && e.table === finding.table
  );
}
const SRC_ROOTS = [
  resolve(REPO_ROOT, "apps/web/src/app/actions"),
  resolve(REPO_ROOT, "apps/web/src/app/api"),
  resolve(REPO_ROOT, "apps/web/src/lib"),
];

// Drizzle schema → Postgres table (camelCase → snake_case).
// Seznam tenant-scoped tabulek zjištěných z information_schema.columns WHERE column_name='tenant_id'.
const TENANT_TABLES_SQL = new Set([
  "activity_log", "advisor_business_plans", "advisor_business_plan_targets",
  "advisor_material_request_documents", "advisor_material_request_messages", "advisor_material_requests",
  "advisor_notifications", "advisor_preferences", "advisor_proposals", "advisor_vision_goals",
  "ai_generations", "aml_checklists", "analysis_import_jobs", "assistant_conversations",
  "audit_log", "bj_coefficients", "board_items", "board_views", "calculator_runs",
  "career_position_coefficients", "client_ai_context", "client_contacts", "client_invitations",
  "client_payment_setups", "client_request_files", "client_requests", "communication_drafts",
  "companies", "company_person_links", "consents", "contact_coverage", "contacts",
  "contract_review_corrections", "contract_upload_reviews", "contracts",
  "dead_letter_items", "document_extractions", "document_processing_jobs", "documents",
  "email_campaign_recipients", "email_campaigns", "events", "execution_actions", "exports",
  "fa_plan_items", "fa_sync_log", "financial_analyses", "financial_shared_facts",
  "fund_add_requests", "households", "incident_logs", "insurer_termination_registry", "invoices",
  "meeting_notes", "memberships", "messages", "mindmap_maps", "note_templates", "notification_log",
  "opportunities", "opportunity_stages", "organizations", "partners", "payment_accounts",
  "portal_feedback", "portal_notifications", "processing_purposes", "relationships", "reminders",
  "roles", "staff_invitations", "subscription_usage_monthly", "subscriptions", "tasks",
  "team_events", "team_goals", "team_tasks", "tenant_settings",
  "termination_dispatch_log", "termination_generated_documents", "termination_reason_catalog",
  "termination_request_events", "termination_requests", "termination_required_attachments",
  "timeline_items", "user_google_calendar_integrations", "user_google_drive_integrations",
  "user_google_gmail_integrations",
]);

// Mapování snake_case ↔ camelCase Drizzle identifikátorů. Většinou je jen drobný rozdíl.
// Pro přesnost ověříme i ručně udržovaný seznam.
const CAMEL = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const TENANT_TABLE_IDENTS = new Set();
for (const t of TENANT_TABLES_SQL) {
  TENANT_TABLE_IDENTS.add(t);        // snake
  TENANT_TABLE_IDENTS.add(CAMEL(t)); // camel
}
// Alias/override (některé Drizzle identifikátory se nejmenují stejně jako tabulka).
[
  ["contracts_table", "contracts"], // občasný alias `contractsTable`
  ["household_members", "households"], // household_members je tenant-scoped přes households
].forEach(([ident, _fallback]) => TENANT_TABLE_IDENTS.add(CAMEL(ident)));

// Navíc: householdMembers nemá vlastní tenant_id, ale váže se přes householdId → households.tenantId.
// Bere se jako tenant-implicit přes join. Nezahrnujeme sem.

const GUARD_TOKENS = [
  "withAuthContext",
  "withTenantContext",
  "withTenantContextFromAuth",
  "withClientAuthContext",
  "withUserContext",
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full) && !/\.test\.|__tests__/.test(full)) out.push(full);
  }
  return out;
}

/**
 * Najdi enclosing function-like node pro daný node.
 */
function enclosingFunction(node) {
  let cur = node.parent;
  while (cur) {
    if (
      ts.isFunctionDeclaration(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isArrowFunction(cur) ||
      ts.isMethodDeclaration(cur)
    ) {
      return cur;
    }
    cur = cur.parent;
  }
  return null;
}

/**
 * Projdi VŠECHNY enclosing funkce od nejvnitřnější po nejvnější.
 * Tenant guard můžeme najít v kterékoli z nich (typicky outer funkce
 * volá requireAuthInAction a vnitřní arrow je jen callback withTenantContextFromAuth).
 */
function enclosingFunctionChain(node) {
  const chain = [];
  let cur = node.parent;
  while (cur) {
    if (
      ts.isFunctionDeclaration(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isArrowFunction(cur) ||
      ts.isMethodDeclaration(cur)
    ) {
      chain.push(cur);
    }
    cur = cur.parent;
  }
  return chain;
}

function functionName(fn) {
  if (!fn) return "<top-level>";
  if (ts.isFunctionDeclaration(fn) && fn.name) return fn.name.text;
  if (ts.isMethodDeclaration(fn) && fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  // Arrow/FunctionExpression → zkus nadřazený VariableDeclaration
  let p = fn.parent;
  while (p) {
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text;
    p = p.parent;
  }
  return "<anonymous>";
}

function bodyText(fn, source) {
  if (!fn || !fn.body) return "";
  return source.text.substring(fn.body.pos, fn.body.end);
}

function hasGuardInBody(text) {
  return GUARD_TOKENS.some((g) => text.includes(g + "("));
}

/**
 * Ověří, že v těle funkce je buď guard wrapper,
 * nebo explicitní `eq(<table>.tenantId, ...)` (přímo v .where(...)).
 */
function hasTenantWhere(text, tableIdent) {
  // Velmi striktní regex — musí být `<tableIdent>.tenantId` nebo `<tableIdent>.tenant_id`.
  const re = new RegExp(`\\b${tableIdent}\\.(tenantId|tenant_id)\\b`);
  return re.test(text);
}

/**
 * Každé volání `.from(<ident>)` kde <ident> je tenant-scoped identifikátor
 * reportujeme spolu s obklopující funkcí a výsledkem guard kontroly.
 */
function auditFile(filePath) {
  const text = readFileSync(filePath, "utf8");
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.ES2022, true);
  const findings = [];

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.name) &&
      node.expression.name.text === "from" &&
      node.arguments.length >= 1 &&
      ts.isIdentifier(node.arguments[0])
    ) {
      const tableIdent = node.arguments[0].text;
      if (TENANT_TABLE_IDENTS.has(tableIdent)) {
        const chain = enclosingFunctionChain(node);
        const outerFn = chain[chain.length - 1] ?? null;
        const name = functionName(outerFn);
        // Sloučené tělo všech enclosing funkcí (vnitřní + vnější). Stačí, když
        // guard nebo tenant WHERE je na libovolné úrovni výš.
        const body = chain.map((fn) => bodyText(fn, source)).join("\n");
        const guard = hasGuardInBody(body);
        const whereCheck = hasTenantWhere(body, tableIdent);
        const lineInfo = source.getLineAndCharacterOfPosition(node.getStart(source));
        findings.push({
          file: relative(REPO_ROOT, filePath),
          line: lineInfo.line + 1,
          fn: name,
          table: tableIdent,
          guard,
          whereCheck,
          ok: guard || whereCheck,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return findings;
}

const allFindings = [];
for (const root of SRC_ROOTS) {
  try {
    statSync(root);
  } catch {
    continue;
  }
  for (const f of walk(root)) {
    const findings = auditFile(f);
    allFindings.push(...findings);
  }
}

const gaps = allFindings.filter((f) => !f.ok);
const newGaps = gaps.filter((f) => !isAllowed(f));
const knownGaps = gaps.filter((f) => isAllowed(f));

const byFile = new Map();
for (const g of newGaps) {
  if (!byFile.has(g.file)) byFile.set(g.file, []);
  byFile.get(g.file).push(g);
}

console.log(`Audit: ${allFindings.length} tenant-scoped .from() volání ve zdrojácích.`);
console.log(`Bez tenant guard: ${gaps.length}  (v allow-listu: ${knownGaps.length}, nové: ${newGaps.length})`);
console.log("");

if (newGaps.length === 0) {
  if (knownGaps.length === 0) {
    console.log("Vše pokryté. 🟢");
  } else {
    console.log("Nové nálezy: 0. Allow-list platí — rozhodnutí o bezpečnosti zaznamenáno v tools/tenant-audit/allow-list.json.");
  }
  process.exit(0);
}

console.log("Nové tenant-scope porušení (není v allow-listu):");
for (const [file, items] of [...byFile.entries()].sort()) {
  console.log(`\n${file}  (${items.length})`);
  for (const it of items) {
    console.log(`  :${it.line}  fn=${it.fn}  table=${it.table}  guard=${it.guard}  where=${it.whereCheck}`);
  }
}
console.log("\nFix: obal funkci do withAuthContext / withTenantContextFromAuth, nebo přidej explicit eq(<table>.tenantId, auth.tenantId) do WHERE.");
console.log("Pokud jde o legitimní výjimku (FK pattern, globální katalog, bootstrap), dopiš záznam do tools/tenant-audit/allow-list.json včetně reason.");

process.exit(1);
