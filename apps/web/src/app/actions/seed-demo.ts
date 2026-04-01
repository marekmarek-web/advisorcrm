"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import {
  contacts,
  contracts,
  events,
  tasks,
  opportunities,
  opportunityStages,
  partners,
  products,
  boardViews,
  boardItems,
  meetingNotes,
  noteTemplates,
  notificationLog,
  households,
  householdMembers,
} from "db";
import { eq } from "db";

export async function seedDemoData(): Promise<{ ok: boolean; message: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) return { ok: false, message: "Forbidden" };

  const existingContacts = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.tenantId, auth.tenantId))
    .limit(1);

  if (existingContacts.length > 0) {
    return { ok: true, message: "Demo data already seeded (contacts exist)." };
  }

  const existingPartners = await db
    .select({ id: partners.id })
    .from(partners)
    .where(eq(partners.tenantId, auth.tenantId))
    .limit(1);
  const partnerIds: string[] = [];
  if (existingPartners.length === 0) {
    const demoPartners = [
      { name: "Pojišťovna A", segment: "ZP" },
      { name: "Pojišťovna B", segment: "ZP" },
      { name: "Investiční společnost", segment: "INV" },
      { name: "Hypoteční banka", segment: "HYPO" },
    ];
    for (const p of demoPartners) {
      const [row] = await db
        .insert(partners)
        .values({
          tenantId: auth.tenantId,
          name: p.name,
          segment: p.segment,
        })
        .returning({ id: partners.id });
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
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  function daysFromNow(d: number) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() + d);
    return dt;
  }

  function dateStr(d: number) {
    return daysFromNow(d).toISOString().slice(0, 10);
  }

  const demoContacts = [
    { firstName: "Jan", lastName: "Novák", email: "jan.novak@example.cz", phone: "+420 601 111 222", birthDate: "1985-03-15", city: "Praha", street: "Vinohradská 42", zip: "12000", lifecycleStage: "client", tags: ["VIP", "rodina"] },
    { firstName: "Petra", lastName: "Svobodová", email: "petra.s@example.cz", phone: "+420 602 333 444", birthDate: "1990-07-22", city: "Brno", street: "Masarykova 10", zip: "60200", lifecycleStage: "client", tags: ["podnikatel"] },
    { firstName: "Martin", lastName: "Dvořák", email: "martin.d@example.cz", phone: "+420 603 555 666", birthDate: "1978-11-05", city: "Ostrava", street: "Stodolní 5", zip: "70200", lifecycleStage: "prospect", tags: [] },
    { firstName: "Lucie", lastName: "Černá", email: "lucie.c@example.cz", phone: "+420 604 777 888", birthDate: "1995-01-30", city: "Plzeň", street: "Americká 18", zip: "30100", lifecycleStage: "lead", tags: ["doporučení"] },
    { firstName: "Tomáš", lastName: "Horák", email: "tomas.h@example.cz", phone: "+420 605 999 000", birthDate: "1982-06-12", city: "Olomouc", street: "Horní nám. 3", zip: "77200", lifecycleStage: "client", tags: ["rodina"] },
  ];

  const createdContactIds: string[] = [];
  for (const c of demoContacts) {
    const [row] = await db
      .insert(contacts)
      .values({
        tenantId: auth.tenantId,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        birthDate: c.birthDate,
        city: c.city,
        street: c.street,
        zip: c.zip,
        lifecycleStage: c.lifecycleStage,
        tags: c.tags,
        nextServiceDue: dateStr(Math.floor(Math.random() * 30)),
      })
      .returning({ id: contacts.id });
    if (row) createdContactIds.push(row.id);
  }

  const existingHouseholds = await db
    .select({ id: households.id })
    .from(households)
    .where(eq(households.tenantId, auth.tenantId))
    .limit(1);
  if (existingHouseholds.length === 0) {
    const householdNames = ["Novákovi", "Svobodovi", "Dvořákovi"];
    const householdIds: string[] = [];
    for (const name of householdNames) {
      const [row] = await db
        .insert(households)
        .values({ tenantId: auth.tenantId, name })
        .returning({ id: households.id });
      if (row) householdIds.push(row.id);
    }
    if (householdIds[0] && createdContactIds[0]) {
      await db.insert(householdMembers).values({
        householdId: householdIds[0],
        contactId: createdContactIds[0],
        role: "primary",
      });
    }
    if (householdIds[0] && createdContactIds[1]) {
      await db.insert(householdMembers).values({
        householdId: householdIds[0],
        contactId: createdContactIds[1],
        role: "member",
      });
    }
    if (householdIds[1] && createdContactIds[2]) {
      await db.insert(householdMembers).values({
        householdId: householdIds[1],
        contactId: createdContactIds[2],
        role: "primary",
      });
    }
    if (householdIds[1] && createdContactIds[3]) {
      await db.insert(householdMembers).values({
        householdId: householdIds[1],
        contactId: createdContactIds[3],
        role: "member",
      });
    }
    if (householdIds[2] && createdContactIds[4]) {
      await db.insert(householdMembers).values({
        householdId: householdIds[2],
        contactId: createdContactIds[4],
        role: "primary",
      });
    }
  }

  const demoContracts = [
    { contactIdx: 0, segment: "ZP", partnerName: "UNIQA", productName: "UNIQA Život", contractNumber: "ZP-2024-001", startDate: "2024-01-15", anniversaryDate: dateStr(20) },
    { contactIdx: 0, segment: "INV", partnerName: "Conseq", productName: "Conseq Invest", contractNumber: "INV-2024-002", startDate: "2024-03-01", anniversaryDate: dateStr(45) },
    { contactIdx: 1, segment: "HYPO", partnerName: "Hypoteční banka", productName: "Klasik Hypotéka", contractNumber: "HY-2024-003", startDate: "2024-02-10", anniversaryDate: dateStr(60) },
    { contactIdx: 1, segment: "ZP", partnerName: "Generali Česká pojišťovna", productName: "Generali Život", contractNumber: "ZP-2024-004", startDate: "2024-05-20", anniversaryDate: dateStr(10) },
    { contactIdx: 2, segment: "DPS", partnerName: "NN", productName: "NN Penzijní spoření", contractNumber: "DPS-2024-005", startDate: "2024-04-01", anniversaryDate: dateStr(90) },
    { contactIdx: 4, segment: "POV", partnerName: "Kooperativa", productName: "Povinné ručení Plus", contractNumber: "POV-2024-006", startDate: "2024-06-15", anniversaryDate: dateStr(5) },
    { contactIdx: 4, segment: "NEM", partnerName: "Allianz", productName: "Pojištění nemovitosti", contractNumber: "NEM-2024-007", startDate: "2024-07-01", anniversaryDate: dateStr(35) },
  ];

  const thisYear = now.getFullYear();
  const thisMonth = String(now.getMonth() + 1).padStart(2, "0");
  const startDateThisMonth = `${thisYear}-${thisMonth}-01`;
  const startDateThisYear = `${thisYear}-01-15`;

  for (const c of demoContracts) {
    const contactId = createdContactIds[c.contactIdx];
    if (!contactId) continue;
    await db.insert(contracts).values({
      tenantId: auth.tenantId,
      contactId,
      advisorId: auth.userId,
      segment: c.segment,
      type: c.segment,
      partnerName: c.partnerName,
      productName: c.productName,
      contractNumber: c.contractNumber,
      startDate: c.startDate,
      anniversaryDate: c.anniversaryDate,
    });
  }

  const productionDemoContracts = [
    { contactIdx: 0, segment: "ZP", partnerName: "Pojišťovna A", productName: "Životní pojištění Standard", contractNumber: `ZP-${thisYear}-101`, startDate: startDateThisMonth },
    { contactIdx: 1, segment: "INV", partnerName: "Investiční společnost", productName: "Podílový fond", contractNumber: `INV-${thisYear}-102`, startDate: startDateThisMonth },
    { contactIdx: 2, segment: "DPS", partnerName: "NN", productName: "Penzijní spoření", contractNumber: `DPS-${thisYear}-103`, startDate: startDateThisYear },
  ];
  for (const c of productionDemoContracts) {
    const contactId = createdContactIds[c.contactIdx];
    if (!contactId) continue;
    await db.insert(contracts).values({
      tenantId: auth.tenantId,
      contactId,
      advisorId: auth.userId,
      segment: c.segment,
      type: c.segment,
      partnerName: c.partnerName,
      productName: c.productName,
      contractNumber: c.contractNumber,
      startDate: c.startDate,
    });
  }

  const eventTypes = ["schuzka", "telefonat", "kafe", "mail", "ukol", "schuzka"];
  const demoEvents = [
    { contactIdx: 0, title: "Servisní schůzka – Jan Novák", eventType: "schuzka", dayOffset: 0, hour: 10 },
    { contactIdx: 1, title: "Telefonát ohledně hypotéky", eventType: "telefonat", dayOffset: 0, hour: 14 },
    { contactIdx: 2, title: "Kafe – seznámení", eventType: "kafe", dayOffset: 1, hour: 9 },
    { contactIdx: 3, title: "E-mail s nabídkou ŽP", eventType: "mail", dayOffset: 1, hour: 11 },
    { contactIdx: 4, title: "Schůzka – prodloužení POV", eventType: "schuzka", dayOffset: 2, hour: 15 },
    { contactIdx: 0, title: "Follow-up investice", eventType: "schuzka", dayOffset: 3, hour: 10 },
    { contactIdx: 1, title: "Podpis smlouvy", eventType: "schuzka", dayOffset: 4, hour: 13 },
    { contactIdx: 3, title: "Analýza potřeb – Lucie", eventType: "schuzka", dayOffset: 5, hour: 10 },
  ];

  for (const ev of demoEvents) {
    const contactId = createdContactIds[ev.contactIdx] ?? null;
    const start = daysFromNow(ev.dayOffset);
    start.setHours(ev.hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(ev.hour + 1);
    await db.insert(events).values({
      tenantId: auth.tenantId,
      contactId,
      title: ev.title,
      eventType: ev.eventType,
      startAt: start,
      endAt: end,
      assignedTo: auth.userId,
    });
  }

  const demoTasks = [
    { contactIdx: 0, title: "Připravit podklady pro servis", dayOffset: -1 },
    { contactIdx: 1, title: "Zaslat nabídku hypotéky", dayOffset: 2 },
    { contactIdx: 2, title: "Ověřit kontaktní údaje", dayOffset: 0 },
    { contactIdx: 3, title: "Připravit finanční analýzu", dayOffset: 3 },
    { contactIdx: 4, title: "Zkontrolovat výročí smlouvy", dayOffset: 5 },
  ];

  for (const t of demoTasks) {
    const contactId = createdContactIds[t.contactIdx] ?? null;
    await db.insert(tasks).values({
      tenantId: auth.tenantId,
      contactId,
      title: t.title,
      dueDate: dateStr(t.dayOffset),
      assignedTo: auth.userId,
      createdBy: auth.userId,
    });
  }

  let stageIds = await db
    .select({ id: opportunityStages.id, name: opportunityStages.name })
    .from(opportunityStages)
    .where(eq(opportunityStages.tenantId, auth.tenantId));

  if (stageIds.length === 0) {
    const defaultStages = ["Začínáme", "Analýza potřeb", "Šla nabídka", "Před uzavřením", "Servis"];
    for (let i = 0; i < defaultStages.length; i++) {
      await db.insert(opportunityStages).values({
        tenantId: auth.tenantId,
        name: defaultStages[i],
        sortOrder: i,
      });
    }
    stageIds = await db
      .select({ id: opportunityStages.id, name: opportunityStages.name })
      .from(opportunityStages)
      .where(eq(opportunityStages.tenantId, auth.tenantId));
  }

  const demoOpportunities = [
    { contactIdx: 2, title: "Životní pojištění – Martin Dvořák", caseType: "pojištění", stageIdx: 0 },
    { contactIdx: 3, title: "Investice pro Lucii Černou", caseType: "investice", stageIdx: 1 },
    { contactIdx: 0, title: "Refinancování – Novákovi", caseType: "hypotéka", stageIdx: 2, expectedValue: "3500000" },
    { contactIdx: 4, title: "DPS pro Tomáše Horáka", caseType: "jiné", stageIdx: 3 },
  ];

  for (const o of demoOpportunities) {
    const contactId = createdContactIds[o.contactIdx] ?? null;
    const stage = stageIds[o.stageIdx] ?? stageIds[0];
    if (!stage) continue;
    await db.insert(opportunities).values({
      tenantId: auth.tenantId,
      contactId,
      title: o.title,
      caseType: o.caseType,
      stageId: stage.id,
      expectedValue: o.expectedValue ?? null,
      expectedCloseDate: dateStr(Math.floor(Math.random() * 30 + 5)),
    });
  }

  const boardViewRows = await db
    .select({ id: boardViews.id })
    .from(boardViews)
    .where(eq(boardViews.tenantId, auth.tenantId))
    .limit(1);
  let viewId: string;
  if (boardViewRows.length > 0) {
    viewId = boardViewRows[0].id;
  } else {
    const defaultGroups = [
      { id: "g1", name: "Nové", color: "#579bfc", collapsed: false },
      { id: "g2", name: "Rozpracované", color: "#00c875", collapsed: false },
    ];
    const [created] = await db
      .insert(boardViews)
      .values({
        tenantId: auth.tenantId,
        name: "Plan rozdeleno",
        columnsConfig: {},
        groupsConfig: defaultGroups as unknown as Record<string, unknown>,
      })
      .returning({ id: boardViews.id });
    viewId = created!.id;
  }

  const boardItemNames = [
    "Jan Novák",
    "Petra Svobodová",
    "Martin Dvořák",
    "Lucie Černá",
    "Tomáš Horák",
    "Životní pojištění – Martin Dvořák",
    "Investice pro Lucii Černou",
    "Refinancování – Novákovi",
  ];
  for (let i = 0; i < boardItemNames.length; i++) {
    const contactId = createdContactIds[i % createdContactIds.length] ?? null;
    await db.insert(boardItems).values({
      tenantId: auth.tenantId,
      viewId,
      contactId,
      groupId: i % 2 === 0 ? "g1" : "g2",
      name: boardItemNames[i],
      cells: {},
      sortOrder: i,
    });
  }

  let templateIds = await db
    .select({ id: noteTemplates.id, domain: noteTemplates.domain })
    .from(noteTemplates)
    .where(eq(noteTemplates.tenantId, auth.tenantId));
  if (templateIds.length === 0) {
    const templateDomains = [
      { name: "Hypo – první schůzka", domain: "hypo" },
      { name: "Investiční update", domain: "invest" },
      { name: "Pojistná revize", domain: "pojist" },
    ];
    for (const t of templateDomains) {
      const [row] = await db
        .insert(noteTemplates)
        .values({
          tenantId: auth.tenantId,
          name: t.name,
          domain: t.domain,
          schema: { fields: ["cas", "ucastnici", "obsah", "doporuceni", "dalsi_kroky"] },
        })
        .returning({ id: noteTemplates.id });
      if (row) templateIds.push({ id: row.id, domain: t.domain });
    }
  }
  const templateByIdDomain = new Map<string, string>();
  for (const t of templateIds) templateByIdDomain.set(t.domain, t.id);

  const demoNotes = [
    { contactIdx: 0, domain: "hypo" as const, dayOffset: -7, content: { cas: "10:00–11:00", ucastnici: "Jan Novák, poradce", obsah: "První schůzka – představení, zjištění potřeb.", doporuceni: "Připravit nabídku hypotéky.", dalsi_kroky: "Zaslat podklady, druhá schůzka za 14 dní." } },
    { contactIdx: 1, domain: "invest" as const, dayOffset: -5, content: { cas: "14:00", ucastnici: "Petra Svobodová", obsah: "Pravidelný update portfolia.", doporuceni: "Zvýšit podíl akciových fondů.", dalsi_kroky: "Upravit alokaci do týdne." } },
    { contactIdx: 2, domain: "pojist" as const, dayOffset: -3, content: { cas: "9:30", ucastnici: "Martin Dvořák", obsah: "Nabídka životního pojištění.", doporuceni: "Produkt Život & Radost.", dalsi_kroky: "Zaslat kalkulaci, schůzka na podpis." } },
    { contactIdx: 3, domain: "hypo" as const, dayOffset: -2, content: { cas: "", ucastnici: "Lucie Černá", obsah: "Konzultace hypotéky pro mladé.", doporuceni: "", dalsi_kroky: "Doplnit doklady." } },
    { contactIdx: 4, domain: "pojist" as const, dayOffset: -1, content: { cas: "11:00", ucastnici: "Tomáš Horák", obsah: "Revize POV a havarijního.", doporuceni: "Srovnání s konkurencí.", dalsi_kroky: "Zaslat srovnávací tabulku." } },
    { contactIdx: 0, domain: "invest" as const, dayOffset: 0, content: { cas: "15:00", ucastnici: "Jan Novák", obsah: "Follow-up investice – schváleno.", doporuceni: "Diverzifikace 60/40.", dalsi_kroky: "Podpis smlouvy příští týden." } },
  ];
  for (const n of demoNotes) {
    const contactId = createdContactIds[n.contactIdx];
    if (!contactId) continue;
    const meetingAt = daysFromNow(n.dayOffset);
    meetingAt.setHours(10, 0, 0, 0);
    await db.insert(meetingNotes).values({
      tenantId: auth.tenantId,
      contactId,
      templateId: templateByIdDomain.get(n.domain) ?? null,
      meetingAt,
      domain: n.domain,
      content: n.content,
      createdBy: auth.userId,
    });
  }

  const demoNotifications = [
    { contactIdx: 0, template: "welcome", subject: "Vítejte u Aidvisora", recipient: "jan.novak@example.cz" },
    { contactIdx: 1, template: "reminder", subject: "Připomínka schůzky", recipient: "petra.s@example.cz" },
    { contactIdx: 2, template: "reminder", subject: "Podklady pro schůzku", recipient: "martin.d@example.cz" },
    { contactIdx: 3, template: "offer", subject: "Nabídka hypotéky", recipient: "lucie.c@example.cz" },
    { contactIdx: 4, template: "reminder", subject: "Revize pojištění", recipient: "tomas.h@example.cz" },
    { contactIdx: 0, template: "reminder", subject: "Follow-up investice", recipient: "jan.novak@example.cz" },
    { contactIdx: 1, template: "contract", subject: "Smlouva k podpisu", recipient: "petra.s@example.cz" },
  ];
  for (let i = 0; i < demoNotifications.length; i++) {
    const n = demoNotifications[i];
    const contactId = createdContactIds[n.contactIdx] ?? null;
    const sentAt = daysFromNow(-i - 1);
    sentAt.setHours(12, 0, 0, 0);
    await db.insert(notificationLog).values({
      tenantId: auth.tenantId,
      contactId,
      channel: "email",
      template: n.template,
      subject: n.subject,
      recipient: n.recipient,
      status: "sent",
      sentAt,
    });
  }

  return {
    ok: true,
    message: `Demo data created: ${createdContactIds.length} contacts, ${demoContracts.length} contracts, ${demoEvents.length} events, ${demoTasks.length} tasks, ${demoOpportunities.length} opportunities, board with ${boardItemNames.length} items, ${demoNotes.length} meeting notes, ${demoNotifications.length} notifications, households.`,
  };
}
