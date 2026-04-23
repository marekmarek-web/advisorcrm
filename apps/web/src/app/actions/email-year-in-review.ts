"use server";

import { withAuthContext } from "@/lib/auth/with-auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import { emailTemplates, contacts, contracts, eq, and, sql } from "db";

/**
 * F5 — vygeneruje draft "Náš společný rok" pro daný rok a vrátí HTML / subject
 * s vyplněnými čísly za celý segment (nebo pro konkrétní kontakt).
 *
 * Tato akce nic neposílá — pouze vrátí připravený body / subject, který frontend
 * použije pro vytvoření `email_campaigns` draftu (a uživatel může upravit).
 */

export type YearInReviewDraft = {
  subject: string;
  preheader: string;
  bodyHtml: string;
  stats: {
    contactsCount: number;
    contractsCount: number;
    meetingsCount: number;
    totalPremiumCzk: number;
    productList: string[];
  };
};

export async function generateYearInReviewDraft(input: {
  year?: number;
  contactId?: string | null;
}): Promise<YearInReviewDraft> {
  const year = input.year ?? new Date().getFullYear();

  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) {
      throw new Error("Nemáte oprávnění.");
    }

    const [template] = await tx
      .select({
        subject: emailTemplates.subject,
        preheader: emailTemplates.preheader,
        bodyHtml: emailTemplates.bodyHtml,
      })
      .from(emailTemplates)
      .where(
        and(eq(emailTemplates.kind, "year_in_review"), eq(emailTemplates.isArchived, false)),
      )
      .limit(1);
    if (!template) {
      throw new Error("Šablona 'year_in_review' nebyla nalezena.");
    }

    // Agregované statistiky za rok
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year + 1}-01-01`;

    const filter = input.contactId
      ? and(
          eq(contracts.tenantId, auth.tenantId),
          eq(contracts.contactId, input.contactId),
          sql`${contracts.createdAt} >= ${yearStart} AND ${contracts.createdAt} < ${yearEnd}`,
        )
      : and(
          eq(contracts.tenantId, auth.tenantId),
          sql`${contracts.createdAt} >= ${yearStart} AND ${contracts.createdAt} < ${yearEnd}`,
        );

    const [contractStats] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        totalPremium: sql<number>`coalesce(sum(premium_annual)::numeric, 0)::int`,
      })
      .from(contracts)
      .where(filter!);

    const products = await tx
      .select({
        name: contracts.productName,
        count: sql<number>`count(*)::int`,
      })
      .from(contracts)
      .where(filter!)
      .groupBy(contracts.productName)
      .limit(10);

    const contactFilter = input.contactId
      ? and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, input.contactId))
      : eq(contacts.tenantId, auth.tenantId);

    const [contactStats] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(contacts)
      .where(contactFilter!);

    const productList = products.map((p) => p.name ?? "—").filter((n) => n && n !== "—");
    const productListText =
      productList.length > 0 ? productList.slice(0, 5).join(", ") : "—";

    const stats = {
      contactsCount: contactStats?.total ?? 0,
      contractsCount: contractStats?.total ?? 0,
      meetingsCount: 0, // bez napojení na kalendář zatím 0
      totalPremiumCzk: Math.round(contractStats?.totalPremium ?? 0),
      productList,
    };

    const formatted = stats.totalPremiumCzk
      ? `${stats.totalPremiumCzk.toLocaleString("cs-CZ")} Kč`
      : "—";

    // Substitute templates placeholders. `{{jmeno}}` zůstává pro per-recipient
    // personalizaci při odeslání.
    const bodyHtml = template.bodyHtml
      .replaceAll("{{year_savings_total}}", formatted)
      .replaceAll("{{products_list}}", productListText)
      .replaceAll("{{meetings_count}}", String(stats.meetingsCount))
      .replaceAll(
        "{{advisor_note}}",
        "Pokud bude mít cokoliv, co bychom měli probrat, jsem Vám k dispozici.",
      );

    const subject = template.subject.replace("{{rok}}", String(year));
    const preheader = (template.preheader ?? "").replace("{{rok}}", String(year));

    return { subject, preheader, bodyHtml, stats };
  });
}
