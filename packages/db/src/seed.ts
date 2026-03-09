import "dotenv/config";
import { db } from "./client";
import {
  tenants,
  roles,
  memberships,
  contacts,
  households,
  householdMembers,
  opportunityStages,
  opportunities,
  noteTemplates,
  processingPurposes,
  partners,
  products,
  boardViews,
  boardItems,
} from "./schema/index";

const DEMO_TENANT_ID = "00000000-0000-4000-8000-000000000001";
const DEMO_ROLE_ADMIN = "00000000-0000-4000-8000-000000000002";
const DEMO_ROLE_ADVISOR = "00000000-0000-4000-8000-000000000003";
const DEMO_ROLE_MANAGER = "00000000-0000-4000-8000-000000000004";
const DEMO_ROLE_VIEWER = "00000000-0000-4000-8000-000000000005";
const DEMO_ROLE_CLIENT = "00000000-0000-4000-8000-000000000006";
/** Po vytvoření uživatele v Supabase Auth nastavte toto na jeho User UID a znovu spusťte seed, nebo ručně upravte memberships.user_id. */
const DEMO_USER_ID = "demo-user-id-supabase-auth";

async function seed() {
  await db.insert(tenants).values({
    id: DEMO_TENANT_ID,
    name: "Demo Poradenská firma",
    slug: "demo",
  }).onConflictDoNothing();

  await db.insert(roles).values([
    { id: DEMO_ROLE_ADMIN, tenantId: DEMO_TENANT_ID, name: "Admin" },
    { id: DEMO_ROLE_ADVISOR, tenantId: DEMO_TENANT_ID, name: "Advisor" },
    { id: DEMO_ROLE_MANAGER, tenantId: DEMO_TENANT_ID, name: "Manager" },
    { id: DEMO_ROLE_VIEWER, tenantId: DEMO_TENANT_ID, name: "Viewer" },
    { id: DEMO_ROLE_CLIENT, tenantId: DEMO_TENANT_ID, name: "Client" },
  ]).onConflictDoNothing();

  await db.insert(memberships).values({
    tenantId: DEMO_TENANT_ID,
    userId: DEMO_USER_ID,
    roleId: DEMO_ROLE_ADMIN,
  }).onConflictDoNothing();

  const firstNames = ["Jan", "Marie", "Petr", "Eva", "Martin", "Jana", "Tomáš", "Lucie", "David", "Kateřina", "Pavel", "Anna", "Michal", "Tereza", "Jakub", "Kristýna", "Ondřej", "Nikola", "Filip", "Veronika"];
  const lastNames = ["Novák", "Svobodová", "Novotný", "Novotná", "Dvořák", "Černá", "Procházka", "Marková", "Růžička", "Veselá", "Horák", "Němcová", "Marek", "Pospíšilová", "Král", "Benešová", "Urban", "Fialová", "Kučera", "Sedláčková"];

  const contactIds: string[] = [];
  for (let i = 0; i < 20; i++) {
    const res = await db.insert(contacts).values({
      tenantId: DEMO_TENANT_ID,
      firstName: firstNames[i],
      lastName: lastNames[i],
      email: `klient${i + 1}@example.cz`,
      phone: `+420 7${String(i).padStart(2, "0")} ${String(100 + i).padStart(3, "0")} ${String(i * 11).padStart(2, "0")}`,
    }).returning({ id: contacts.id });
    if (res[0]) contactIds.push(res[0].id);
  }

  const householdIds: string[] = [];
  const hNames = ["Novákovi", "Svobodovi", "Dvořákovi", "Černí", "Procházkovi"];
  for (let i = 0; i < 5; i++) {
    const res = await db.insert(households).values({
      tenantId: DEMO_TENANT_ID,
      name: hNames[i],
    }).returning({ id: households.id });
    if (res[0]) householdIds.push(res[0].id);
  }

  for (let h = 0; h < 5; h++) {
    const base = h * 4;
    for (let j = 0; j < 2 && base + j < contactIds.length; j++) {
      await db.insert(householdMembers).values({
        householdId: householdIds[h],
        contactId: contactIds[base + j],
        role: j === 0 ? "primary" : "member",
      });
    }
  }

  const stageIds: string[] = [];
  const stages = [
    { name: "Lead", sortOrder: 0, probability: 10 },
    { name: "Kvalifikace", sortOrder: 1, probability: 30 },
    { name: "Nabídka", sortOrder: 2, probability: 60 },
    { name: "Vyjednávání", sortOrder: 3, probability: 80 },
    { name: "Uzavřeno", sortOrder: 4, probability: 100 },
  ];
  for (const s of stages) {
    const res = await db.insert(opportunityStages).values({
      tenantId: DEMO_TENANT_ID,
      name: s.name,
      sortOrder: s.sortOrder,
      probability: s.probability,
    }).returning({ id: opportunityStages.id });
    if (res[0]) stageIds.push(res[0].id);
  }

  const caseTypes = ["hypo", "invest", "pojist"];
  for (let i = 0; i < 10; i++) {
    await db.insert(opportunities).values({
      tenantId: DEMO_TENANT_ID,
      contactId: contactIds[i % contactIds.length],
      caseType: caseTypes[i % 3],
      title: `${caseTypes[i % 3]} – ${firstNames[i]} ${lastNames[i]}`,
      stageId: stageIds[i % stageIds.length],
      probability: stages[i % stageIds.length].probability,
      assignedTo: DEMO_USER_ID,
    });
  }

  await db.insert(processingPurposes).values([
    { tenantId: DEMO_TENANT_ID, name: "Poskytování poradenských služeb", legalBasis: "contract", retentionMonths: 84 },
    { tenantId: DEMO_TENANT_ID, name: "Compliance a regulace", legalBasis: "legal_obligation", retentionMonths: 120 },
  ]).onConflictDoNothing();

  const templateDomains = ["hypo", "invest", "pojist"];
  for (const d of templateDomains) {
    await db.insert(noteTemplates).values({
      tenantId: DEMO_TENANT_ID,
      name: d === "hypo" ? "Hypo – první schůzka" : d === "invest" ? "Investiční update" : "Pojistná revize",
      domain: d,
      schema: { fields: ["cas", "ucastnici", "obsah", "doporuceni", "dalsi_kroky"] },
    });
  }

  const partnerIds: string[] = [];
  const demoPartners = [
    { name: "Pojišťovna A", segment: "ZP" },
    { name: "Pojišťovna B", segment: "ZP" },
    { name: "Investiční společnost", segment: "INV" },
    { name: "Hypoteční banka", segment: "HYPO" },
  ];
  for (const p of demoPartners) {
    const [row] = await db.insert(partners).values({
      tenantId: DEMO_TENANT_ID,
      name: p.name,
      segment: p.segment,
    }).returning({ id: partners.id });
    if (row) partnerIds.push(row.id);
  }
  if (partnerIds[0]) {
    await db.insert(products).values([
      { partnerId: partnerIds[0], name: "Životní pojištění Standard", category: "ŽP" },
      { partnerId: partnerIds[0], name: "Doplnit", category: "ŽP", isTbd: true },
      { partnerId: partnerIds[1], name: "Úrazové pojištění", category: "ŽP" },
      { partnerId: partnerIds[2], name: "Podílový fond", category: "INV" },
      { partnerId: partnerIds[3], name: "Hypotéka 5 let", category: "HYPO" },
    ]);
  }

  const defaultGroups = [
    { id: "g1", name: "Nové", color: "#579bfc", collapsed: false },
    { id: "g2", name: "Rozpracované", color: "#00c875", collapsed: false },
  ];
  const [boardView] = await db
    .insert(boardViews)
    .values({
      tenantId: DEMO_TENANT_ID,
      name: "Plan rozdeleno",
      columnsConfig: {},
      groupsConfig: defaultGroups as unknown as Record<string, unknown>,
    })
    .returning({ id: boardViews.id });
  if (boardView) {
    for (let i = 0; i < Math.min(10, contactIds.length); i++) {
      await db.insert(boardItems).values({
        tenantId: DEMO_TENANT_ID,
        viewId: boardView.id,
        contactId: contactIds[i],
        groupId: i % 2 === 0 ? "g1" : "g2",
        name: `${firstNames[i]} ${lastNames[i]}`,
        cells: {},
        sortOrder: i,
      });
    }
  }

  console.log("Seed done: 1 tenant, 20 contacts, 5 households, 10 opportunities, stages, templates, purposes, partners, products, board.");
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
