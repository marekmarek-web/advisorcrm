import "server-only";

import {
  emailAutomationRules,
  emailAutomationRuns,
  emailCampaigns,
  emailCampaignRecipients,
  emailSendQueue,
  emailTemplates,
  contacts,
  eq,
  and,
  sql,
} from "db";
import { dbService, withServiceTenantContext } from "@/lib/db/service-db";
import { mintTrackingToken } from "@/lib/email/queue-enqueue";
import {
  hasValidConsent,
  isConsentEnforcementEnabled,
  PURPOSE_MARKETING_EMAILS,
} from "@/lib/compliance/consent-check";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";

/**
 * F4 — denní worker automatizací. Prochází všechna `email_automation_rules`
 * s `is_active = true` a pro každou sestaví set příjemců na základě triggeru
 * a `schedule_offset_days`. Pro každého matchnutého kontaktu vytvoří kampaň
 * (z šablony) a zařadí jej do `email_send_queue`.
 *
 * Mezitenantní bezpečnost: pracujeme přes `withServiceTenantContext`, takže
 * RLS kontroly probíhají pod identitou service role se správně nastaveným
 * `app.tenant_id`.
 */

export type AutomationRunResult = {
  ruleId: string;
  ruleName: string;
  triggerType: string;
  matched: number;
  queued: number;
  skipped: number;
  failed: number;
};

export async function runDueAutomations(): Promise<{
  rulesProcessed: number;
  totalQueued: number;
  totalSkipped: number;
  totalFailed: number;
  perRule: AutomationRunResult[];
}> {
  // Načti všechna aktivní pravidla napříč tenanty.
  const rows = (await dbService.execute(sql`
    SELECT r.id, r.tenant_id AS "tenantId", r.name, r.trigger_type AS "triggerType",
           r.trigger_config AS "triggerConfig", r.template_id AS "templateId",
           r.schedule_offset_days AS "scheduleOffsetDays", r.send_hour AS "sendHour"
    FROM email_automation_rules r
    WHERE r.is_active = true
  `)) as unknown as Array<{
    id: string;
    tenantId: string;
    name: string;
    triggerType: string;
    triggerConfig: Record<string, unknown> | null;
    templateId: string | null;
    scheduleOffsetDays: number;
    sendHour: number;
  }>;

  const perRule: AutomationRunResult[] = [];
  let totalQueued = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const row of rows) {
    try {
      if (!isFeatureEnabled("email_campaigns_v2_automations", row.tenantId)) {
        perRule.push({
          ruleId: row.id,
          ruleName: row.name,
          triggerType: row.triggerType,
          matched: 0,
          queued: 0,
          skipped: 0,
          failed: 0,
        });
        continue;
      }
      const result = await runSingleRule(row);
      perRule.push(result);
      totalQueued += result.queued;
      totalSkipped += result.skipped;
      totalFailed += result.failed;

      await dbService.execute(sql`
        UPDATE email_automation_rules
        SET last_run_at = now(), last_matched_count = ${result.matched}, updated_at = now()
        WHERE id = ${row.id}::uuid
      `);
    } catch (e) {
      console.error("[automation-worker] rule failed", row.id, e);
      perRule.push({
        ruleId: row.id,
        ruleName: row.name,
        triggerType: row.triggerType,
        matched: 0,
        queued: 0,
        skipped: 0,
        failed: 1,
      });
      totalFailed += 1;
    }
  }

  return {
    rulesProcessed: rows.length,
    totalQueued,
    totalSkipped,
    totalFailed,
    perRule,
  };
}

type Candidate = {
  contactId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

async function runSingleRule(rule: {
  id: string;
  tenantId: string;
  name: string;
  triggerType: string;
  triggerConfig: Record<string, unknown> | null;
  templateId: string | null;
  scheduleOffsetDays: number;
  sendHour: number;
}): Promise<AutomationRunResult> {
  const result: AutomationRunResult = {
    ruleId: rule.id,
    ruleName: rule.name,
    triggerType: rule.triggerType,
    matched: 0,
    queued: 0,
    skipped: 0,
    failed: 0,
  };

  if (!rule.templateId) {
    result.failed = 1;
    return result;
  }

  // Vyhledej šablonu (globální i tenant-specific).
  const [template] = await withServiceTenantContext({ tenantId: rule.tenantId }, (tx) =>
    tx
      .select({
        id: emailTemplates.id,
        name: emailTemplates.name,
        subject: emailTemplates.subject,
        preheader: emailTemplates.preheader,
        bodyHtml: emailTemplates.bodyHtml,
      })
      .from(emailTemplates)
      .where(eq(emailTemplates.id, rule.templateId!))
      .limit(1),
  );
  if (!template) {
    result.failed = 1;
    return result;
  }

  const candidates = await resolveCandidates(rule);
  result.matched = candidates.length;
  if (candidates.length === 0) return result;

  // Idempotence: kontakty, které už mají run pro toto pravidlo v posledních X dnech,
  // přeskočíme. Pro opakovatelné triggery (birthday) stačí 300 dnů okno.
  const dedupeWindowDays = isAnnualTrigger(rule.triggerType) ? 300 : 90;
  const dedupedRows = (await dbService.execute(sql`
    SELECT contact_id FROM email_automation_runs
    WHERE tenant_id = ${rule.tenantId}::uuid
      AND rule_id = ${rule.id}::uuid
      AND run_at >= now() - (${dedupeWindowDays}::int || ' days')::interval
  `)) as unknown as Array<{ contact_id: string }>;
  const alreadyRun = new Set(dedupedRows.map((r) => r.contact_id));

  const scheduledFor = computeScheduledFor(rule.scheduleOffsetDays, rule.sendHour);

  for (const cand of candidates) {
    if (alreadyRun.has(cand.contactId)) {
      result.skipped += 1;
      await recordRun(rule, cand.contactId, null, "skipped", "already_run_recently");
      continue;
    }
    try {
      const campaignId = await createAutomationCampaign(rule, template, cand, scheduledFor);
      if (campaignId) {
        result.queued += 1;
        await recordRun(rule, cand.contactId, campaignId, "queued", null);
      } else {
        result.skipped += 1;
        await recordRun(
          rule,
          cand.contactId,
          null,
          "skipped",
          "no_email_unsubscribed_or_no_consent",
        );
      }
    } catch (e) {
      console.error("[automation-worker] failed to queue", rule.id, cand.contactId, e);
      result.failed += 1;
      await recordRun(rule, cand.contactId, null, "failed", String(e).slice(0, 200));
    }
  }

  return result;
}

function isAnnualTrigger(triggerType: string): boolean {
  return (
    triggerType === "birthday" ||
    triggerType === "contract_anniversary" ||
    triggerType === "year_in_review" ||
    triggerType === "referral_ask_after_anniversary"
  );
}

function computeScheduledFor(offsetDays: number, sendHour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(Math.max(0, Math.min(23, sendHour)), 0, 0, 0);
  // pokud hodina už uběhla dnes a offset=0, pošli hned
  if (offsetDays === 0 && d.getTime() < Date.now()) {
    return new Date();
  }
  return d;
}

async function resolveCandidates(rule: {
  tenantId: string;
  triggerType: string;
  triggerConfig: Record<string, unknown> | null;
  scheduleOffsetDays: number;
}): Promise<Candidate[]> {
  const tenantFilter = sql`tenant_id = ${rule.tenantId}::uuid`;
  const offset = rule.scheduleOffsetDays || 0;

  // Základní filtr: platný email, nemá doNotEmail, nemá notification_unsubscribed_at
  const base = sql`email IS NOT NULL AND email <> ''
                   AND (do_not_email IS NULL OR do_not_email = false)
                   AND notification_unsubscribed_at IS NULL`;

  let query: ReturnType<typeof sql> | null = null;
  switch (rule.triggerType) {
    case "birthday": {
      // Match contacts whose birthday (month/day) is exactly N days from today.
      // B1.4: respektuj `birth_greeting_opt_out` — klient si může vyžádat, že
      // o přání k narozeninám nestojí.
      query = sql`
        SELECT id AS "contactId", email, first_name AS "firstName", last_name AS "lastName"
        FROM contacts
        WHERE ${tenantFilter}
          AND ${base}
          AND (birth_greeting_opt_out IS NULL OR birth_greeting_opt_out = false)
          AND birth_date IS NOT NULL
          AND to_char(birth_date, 'MM-DD') = to_char((now() + (${offset}::int || ' days')::interval), 'MM-DD')
      `;
      break;
    }
    case "inactive_client": {
      const daysInactive = Number((rule.triggerConfig as { days?: number } | null)?.days ?? 180);
      // Jako proxy pro "poslední interakci" používáme updated_at kontaktu.
      // Lze nahradit čistším tracking sloupcem v budoucí migraci.
      query = sql`
        SELECT c.id AS "contactId", c.email, c.first_name AS "firstName", c.last_name AS "lastName"
        FROM contacts c
        WHERE c.tenant_id = ${rule.tenantId}::uuid
          AND c.email IS NOT NULL AND c.email <> ''
          AND (c.do_not_email IS NULL OR c.do_not_email = false)
          AND c.notification_unsubscribed_at IS NULL
          AND c.updated_at < now() - (${daysInactive}::int || ' days')::interval
      `;
      break;
    }
    case "year_in_review": {
      const [m, d] = String(
        (rule.triggerConfig as { month_day?: string } | null)?.month_day ?? "12-15",
      ).split("-");
      query = sql`
        SELECT id AS "contactId", email, first_name AS "firstName", last_name AS "lastName"
        FROM contacts
        WHERE ${tenantFilter}
          AND ${base}
          AND to_char(now(), 'MM-DD') = ${`${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`}
      `;
      break;
    }
    case "contract_anniversary": {
      // B2.1: smlouvy s anniversary_date odpovídající dnes + offset (MM-DD match,
      // roční opakování). DISTINCT ON zajišťuje 1 kontakt × 1 kampaň (ne 1 smlouva).
      query = sql`
        SELECT DISTINCT ON (c.id)
               c.id AS "contactId", c.email,
               c.first_name AS "firstName", c.last_name AS "lastName"
        FROM contacts c
        JOIN contracts ct ON ct.client_id = c.id AND ct.tenant_id = c.tenant_id
        WHERE c.${sql.raw("tenant_id")} = ${rule.tenantId}::uuid
          AND ${base}
          AND ct.archived_at IS NULL
          AND ct.anniversary_date IS NOT NULL
          AND to_char(ct.anniversary_date, 'MM-DD') = to_char((now() + (${offset}::int || ' days')::interval), 'MM-DD')
      `;
      break;
    }
    case "service_due": {
      // B2.1: contacts.next_service_due = today + offset (servisní pipeline).
      query = sql`
        SELECT id AS "contactId", email, first_name AS "firstName", last_name AS "lastName"
        FROM contacts
        WHERE ${tenantFilter}
          AND ${base}
          AND next_service_due IS NOT NULL
          AND next_service_due::date = (now() + (${offset}::int || ' days')::interval)::date
      `;
      break;
    }
    case "proposal_accepted": {
      // B2.1: advisor_proposals.status='accepted' a responded_at::date = today + offset.
      query = sql`
        SELECT DISTINCT ON (c.id)
               c.id AS "contactId", c.email,
               c.first_name AS "firstName", c.last_name AS "lastName"
        FROM contacts c
        JOIN advisor_proposals p ON p.contact_id = c.id AND p.tenant_id = c.tenant_id
        WHERE c.${sql.raw("tenant_id")} = ${rule.tenantId}::uuid
          AND ${base}
          AND p.status = 'accepted'
          AND p.responded_at IS NOT NULL
          AND p.responded_at::date = (now() + (${offset}::int || ' days')::interval)::date
      `;
      break;
    }
    case "contract_activated": {
      // B2.1: aktivní smlouvy s (advisor_confirmed_at, jinak created_at)::date = dnes + offset.
      query = sql`
        SELECT DISTINCT ON (c.id)
               c.id AS "contactId", c.email,
               c.first_name AS "firstName", c.last_name AS "lastName"
        FROM contacts c
        JOIN contracts ct ON ct.client_id = c.id AND ct.tenant_id = c.tenant_id
        WHERE c.${sql.raw("tenant_id")} = ${rule.tenantId}::uuid
          AND ${base}
          AND ct.archived_at IS NULL
          AND ct.portfolio_status = 'active'
          AND COALESCE(ct.advisor_confirmed_at, ct.created_at)::date
              = (now() + (${offset}::int || ' days')::interval)::date
      `;
      break;
    }
    case "analysis_completed": {
      // B2.1: financial_analyses.sale_status IN ('sold_partial','sold_full')
      //       AND sold_at::date = today + offset (pozn.: schéma používá 'sold_*',
      //       ne legacy 'won').
      query = sql`
        SELECT DISTINCT ON (c.id)
               c.id AS "contactId", c.email,
               c.first_name AS "firstName", c.last_name AS "lastName"
        FROM contacts c
        JOIN financial_analyses fa ON fa.contact_id = c.id AND fa.tenant_id = c.tenant_id
        WHERE c.${sql.raw("tenant_id")} = ${rule.tenantId}::uuid
          AND ${base}
          AND fa.sale_status IN ('sold_partial', 'sold_full')
          AND fa.sold_at IS NOT NULL
          AND fa.sold_at::date = (now() + (${offset}::int || ' days')::interval)::date
      `;
      break;
    }
    case "referral_ask_after_proposal": {
      // B3.3: po 14 dnech od accepted proposal s úsporou > 0 → příležitost
      //       požádat o doporučení. Offset z triggerConfig.days (default 14).
      const days = Number(
        (rule.triggerConfig as { days?: number } | null)?.days ?? 14,
      );
      query = sql`
        SELECT DISTINCT ON (c.id)
               c.id AS "contactId", c.email,
               c.first_name AS "firstName", c.last_name AS "lastName"
        FROM contacts c
        JOIN advisor_proposals p ON p.contact_id = c.id AND p.tenant_id = c.tenant_id
        WHERE c.${sql.raw("tenant_id")} = ${rule.tenantId}::uuid
          AND ${base}
          AND p.status = 'accepted'
          AND COALESCE(p.savings_annual, 0) > 0
          AND p.responded_at IS NOT NULL
          AND p.responded_at::date = (now() - (${days}::int || ' days')::interval)::date
      `;
      break;
    }
    case "referral_ask_after_anniversary": {
      // B3.3: výročí spolupráce (client_since jinak created_at) MM-DD = today.
      query = sql`
        SELECT id AS "contactId", email, first_name AS "firstName", last_name AS "lastName"
        FROM contacts
        WHERE ${tenantFilter}
          AND ${base}
          AND to_char(COALESCE(client_since, created_at), 'MM-DD')
              = to_char((now() + (${offset}::int || ' days')::interval), 'MM-DD')
      `;
      break;
    }
    default: {
      console.warn(`[automation-worker] unknown trigger type: ${rule.triggerType}`);
      return [];
    }
  }

  const res = (await dbService.execute(query)) as unknown as Candidate[];
  return res;
}

async function createAutomationCampaign(
  rule: {
    id: string;
    tenantId: string;
    name: string;
  },
  template: {
    subject: string;
    preheader: string | null;
    bodyHtml: string;
  },
  cand: Candidate,
  scheduledFor: Date,
): Promise<string | null> {
  if (!cand.email) return null;

  return withServiceTenantContext({ tenantId: rule.tenantId }, async (tx) => {
    // Dvojitá kontrola doNotEmail + valid email pod RLS kontextem.
    const [c] = await tx
      .select({ email: contacts.email, doNotEmail: contacts.doNotEmail })
      .from(contacts)
      .where(and(eq(contacts.id, cand.contactId), eq(contacts.tenantId, rule.tenantId)))
      .limit(1);
    if (!c || !c.email || c.doNotEmail) return null;

    // B1.2: GDPR consent gate. Automation-triggered sendy jsou marketingové
    // komunikace a musejí mít platný souhlas. Fail-closed pokud není consent.
    if (isConsentEnforcementEnabled()) {
      const ok = await hasValidConsent(tx, {
        tenantId: rule.tenantId,
        contactId: cand.contactId,
        purposeName: PURPOSE_MARKETING_EMAILS,
      });
      if (!ok) return null;
    }

    const [created] = await tx
      .insert(emailCampaigns)
      .values({
        tenantId: rule.tenantId,
        createdByUserId: "system:automation",
        name: `${rule.name} — ${cand.firstName ?? ""} ${cand.lastName ?? ""}`.trim(),
        subject: template.subject,
        preheader: template.preheader,
        bodyHtml: template.bodyHtml,
        status: scheduledFor.getTime() > Date.now() + 60_000 ? "scheduled" : "queued",
        scheduledAt: scheduledFor,
        queuedAt: scheduledFor.getTime() <= Date.now() + 60_000 ? new Date() : null,
        automationRuleId: rule.id,
        recipientCount: 1,
      })
      .returning({ id: emailCampaigns.id });

    const campaignId = created!.id;
    const token = mintTrackingToken();

    const [recipientRow] = await tx
      .insert(emailCampaignRecipients)
      .values({
        tenantId: rule.tenantId,
        campaignId,
        contactId: cand.contactId,
        email: c.email,
        trackingToken: token,
        status: "queued",
      })
      .returning({ id: emailCampaignRecipients.id });

    await tx.insert(emailSendQueue).values({
      tenantId: rule.tenantId,
      campaignId,
      recipientId: recipientRow!.id,
      scheduledFor,
      nextAttemptAt: scheduledFor,
      status: "pending",
      payload: {
        firstName: cand.firstName ?? "",
        lastName: cand.lastName ?? "",
        email: c.email.trim(),
      },
    });

    return campaignId;
  });
}

async function recordRun(
  rule: { id: string; tenantId: string },
  contactId: string,
  campaignId: string | null,
  status: "queued" | "sent" | "skipped" | "failed",
  skipReason: string | null,
): Promise<void> {
  await dbService.execute(sql`
    INSERT INTO email_automation_runs (tenant_id, rule_id, contact_id, campaign_id, status, skip_reason)
    VALUES (${rule.tenantId}::uuid, ${rule.id}::uuid, ${contactId}::uuid,
            ${campaignId ? sql`${campaignId}::uuid` : sql`NULL`},
            ${status}, ${skipReason})
  `);
}
