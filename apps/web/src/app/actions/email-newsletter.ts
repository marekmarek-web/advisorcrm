"use server";

import { withAuthContext } from "@/lib/auth/with-auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import { emailTemplates, emailContentSources, inArray, eq, and } from "db";
import { composeNewsletterHtml } from "@/lib/email/newsletter-builder";

export type NewsletterDraftResult = {
  subject: string;
  preheader: string | null;
  bodyHtml: string;
  articlesUsed: string[];
};

/**
 * F6 — z daných článků a šablony 'newsletter' vygeneruje HTML připravený k uložení
 * jako draft kampaně. Nic neodesílá.
 */
export async function generateNewsletterDraft(input: {
  articleIds: string[];
  subjectOverride?: string | null;
  preheaderOverride?: string | null;
}): Promise<NewsletterDraftResult> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) {
      throw new Error("Nemáte oprávnění.");
    }
    if (input.articleIds.length === 0) {
      throw new Error("Vyberte alespoň jeden článek.");
    }

    const [template] = await tx
      .select({
        subject: emailTemplates.subject,
        preheader: emailTemplates.preheader,
        bodyHtml: emailTemplates.bodyHtml,
      })
      .from(emailTemplates)
      .where(and(eq(emailTemplates.kind, "newsletter"), eq(emailTemplates.isArchived, false)))
      .limit(1);
    if (!template) throw new Error("Šablona 'newsletter' nebyla nalezena.");

    const articles = await tx
      .select({
        id: emailContentSources.id,
        url: emailContentSources.url,
        canonicalUrl: emailContentSources.canonicalUrl,
        title: emailContentSources.title,
        description: emailContentSources.description,
        imageUrl: emailContentSources.imageUrl,
        sourceName: emailContentSources.sourceName,
        tags: emailContentSources.tags,
        isEvergreen: emailContentSources.isEvergreen,
        capturedAt: emailContentSources.capturedAt,
        lastUsedAt: emailContentSources.lastUsedAt,
      })
      .from(emailContentSources)
      .where(
        and(
          eq(emailContentSources.tenantId, auth.tenantId),
          inArray(emailContentSources.id, input.articleIds),
        ),
      );

    // Seřaď podle pořadí v input.articleIds
    const byId = new Map(articles.map((a) => [a.id, a]));
    const orderedArticles = input.articleIds
      .map((id) => byId.get(id))
      .filter((a): a is NonNullable<typeof a> => a !== undefined);

    const bodyHtml = composeNewsletterHtml(
      template.bodyHtml,
      orderedArticles.map((a) => ({
        id: a.id,
        url: a.url,
        canonicalUrl: a.canonicalUrl,
        title: a.title,
        description: a.description,
        imageUrl: a.imageUrl,
        sourceName: a.sourceName,
      })),
    );

    return {
      subject: input.subjectOverride?.trim() || template.subject,
      preheader: input.preheaderOverride?.trim() || template.preheader,
      bodyHtml,
      articlesUsed: orderedArticles.map((a) => a.id),
    };
  });
}
