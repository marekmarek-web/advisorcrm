import type { AdvisorChatAiBundle } from "./advisor-chat-ai-types";

/** Čitelný blok pro prompt — oddělený od instrukcí modelu. */
export function formatAdvisorChatBundleForPrompt(bundle: AdvisorChatAiBundle): string {
  const lines: string[] = [];
  lines.push("=== FAKTA Z CRM (nevymýšlej nic mimo tento blok) ===");
  lines.push(`Klient: ${bundle.contactDisplayName}`);
  lines.push(`Kontext klienta: ${bundle.contactMetaLine || "—"}`);
  lines.push(`Poslední aktivita ve vlákně: ${bundle.lastThreadActivityAt ?? "—"}`);
  lines.push(
    `CRM počty: otevřené úkoly ${bundle.crmCounts.openTasksCount}, po termínu ${bundle.crmCounts.overdueTasksCount}, čekající podklady ${bundle.crmCounts.pendingMaterialRequestsCount}, otevřené obchody ${bundle.crmCounts.opportunitiesReadable ? bundle.crmCounts.openOpportunitiesCount : "(bez oprávnění číst obchody)"}`,
  );

  if (bundle.primaryOpportunity) {
    lines.push(
      `Aktivní obchod/případ: ${bundle.primaryOpportunity.title} | oblast: ${bundle.primaryOpportunity.caseType || "—"} | fáze: ${bundle.primaryOpportunity.stageName}`,
    );
  } else if (bundle.crmCounts.opportunitiesReadable) {
    lines.push("Aktivní obchod: žádný otevřený nebo není vybraný primární.");
  } else {
    lines.push("Aktivní obchod: data nejsou k dispozici (oprávnění).");
  }

  if (bundle.openTasks.length) {
    lines.push("Otevřené úkoly (název, termín):");
    for (const t of bundle.openTasks) {
      lines.push(`- ${t.title}${t.dueDate ? ` (do ${t.dueDate})` : ""}`);
    }
  } else {
    lines.push("Otevřené úkoly: žádné v seznamu.");
  }

  if (bundle.pendingMaterialRequests.length) {
    lines.push("Čekající požadavky na podklady:");
    for (const m of bundle.pendingMaterialRequests) {
      lines.push(`- [${m.category}] ${m.title}`);
    }
  }

  if (bundle.attachmentHints.length) {
    lines.push("Přílohy u nedávných zpráv (jen názvy souborů, neobsah):");
    for (const a of bundle.attachmentHints) {
      lines.push(`- ${a.fileName}${a.mimeType ? ` (${a.mimeType})` : ""}`);
    }
  }

  if (bundle.terminationRequests.length) {
    lines.push("Žádosti o výpověď u tohoto klienta (stav, pojišťovna, poslední změna):");
    for (const t of bundle.terminationRequests) {
      lines.push(`- ${t.id.slice(0, 8)}… · ${t.status} · ${t.insurerName} · ${t.updatedAt}`);
    }
  } else {
    lines.push("Žádosti o výpověď u klienta: žádné v posledních záznamech.");
  }

  lines.push("");
  lines.push("=== KONVERZACE (chronologicky, klient / poradce) ===");
  if (!bundle.messages.length) {
    lines.push("(Žádné zprávy ve vlákně.)");
  } else {
    for (const m of bundle.messages) {
      const who = m.sender === "client" ? "KLIENT" : "PORADCE";
      lines.push(`[${m.createdAt}] ${who}: ${m.body}`);
    }
  }

  return lines.join("\n");
}
