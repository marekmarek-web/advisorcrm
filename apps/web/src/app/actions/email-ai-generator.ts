"use server";

import { withAuthContext } from "@/lib/auth/with-auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import { createResponseStructured } from "@/lib/openai";
import { emailTemplates, emailContentSources, inArray, eq, and } from "db";
import { saveGeneration } from "@/lib/ai/ai-generations-repository";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";

export type GeneratedCampaignDraft = {
  subject: string;
  preheader: string;
  bodyHtml: string;
  notes: string | null;
};

const CAMPAIGN_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: { type: "string", description: "Předmět emailu, max 70 znaků." },
    preheader: { type: "string", description: "Preview text, max 110 znaků." },
    bodyHtml: {
      type: "string",
      description:
        "HTML email (inline CSS, max-width 600px, font-family Arial). Obsahuje oslovení {{jmeno}} a {{unsubscribe_url}} patička.",
    },
    notes: {
      type: ["string", "null"],
      description: "Volitelná poznámka pro poradce (např. co upravit, na co si dát pozor).",
    },
  },
  required: ["subject", "preheader", "bodyHtml", "notes"],
} as const;

const SYSTEM_PROMPT = `Jsi copywriter pro finančního poradce v CRM Aidvisora. Generuješ česky psané email kampaně pro klienty.

Pravidla:
- Tón: profesionální, vřelý, stručný. Vykání. Žádné emoji.
- HTML: inline CSS, max-width 600px, font-family Arial, barva odkazů #0B3A7A, světle šedý footer.
- Povinné placeholdery v bodyHtml: {{jmeno}} v oslovení, {{unsubscribe_url}} v patičce.
- Subject do 70 znaků, bez klikbaitu, personalizace přes {{jmeno}} je povolená.
- Preheader do 110 znaků, doplňuje subject (neopakuje ho).
- Když je zadán seznam článků, vlož je do emailu jako karty se zdrojem, titulkem, krátkým popisem a odkazem.
- Neinfikuj email marketingovými frázemi typu "klikněte teď" nebo "exkluzivní nabídka".`;

/**
 * F6 — AI draft kampaně. Vrátí JSON se subject, preheader, bodyHtml.
 * NIC neukládá — frontend může výstup použít jako návrh a uložit přes existující akce.
 */
export async function generateCampaignDraft(input: {
  goal: string;
  audienceDescription?: string | null;
  baseTemplateKind?: string | null;
  articleIds?: string[];
  toneHints?: string | null;
  /** Volitelné — pokud editor už pracuje s uloženým draftem, logujeme jeho ID do ai_generations. */
  campaignId?: string | null;
}): Promise<GeneratedCampaignDraft> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) {
      throw new Error("Nemáte oprávnění.");
    }
    if (!isFeatureEnabled("email_campaigns_v2_ai", auth.tenantId)) {
      throw new Error(
        "AI generátor e-mailů není ve vašem tenantovi aktivní. Obraťte se na admina pro zapnutí.",
      );
    }
    const goal = input.goal.trim();
    if (!goal) throw new Error("Uveďte cíl kampaně.");

    // Enrich prompt existujícími artefakty
    const sections: string[] = [`Cíl kampaně: ${goal}`];
    if (input.audienceDescription?.trim()) {
      sections.push(`Cílová skupina: ${input.audienceDescription.trim()}`);
    }
    if (input.toneHints?.trim()) {
      sections.push(`Tón / styl: ${input.toneHints.trim()}`);
    }

    if (input.baseTemplateKind) {
      const [tpl] = await tx
        .select({
          subject: emailTemplates.subject,
          preheader: emailTemplates.preheader,
          bodyHtml: emailTemplates.bodyHtml,
        })
        .from(emailTemplates)
        .where(
          and(
            eq(emailTemplates.kind, input.baseTemplateKind),
            eq(emailTemplates.isArchived, false),
          ),
        )
        .limit(1);
      if (tpl) {
        sections.push(
          `Vzor stylu (odvoď od něj vizuál, ale vygeneruj vlastní obsah):\n${tpl.bodyHtml.slice(0, 2000)}`,
        );
      }
    }

    if (input.articleIds && input.articleIds.length > 0) {
      const articles = await tx
        .select({
          url: emailContentSources.url,
          canonicalUrl: emailContentSources.canonicalUrl,
          title: emailContentSources.title,
          description: emailContentSources.description,
          sourceName: emailContentSources.sourceName,
        })
        .from(emailContentSources)
        .where(
          and(
            eq(emailContentSources.tenantId, auth.tenantId),
            inArray(emailContentSources.id, input.articleIds),
          ),
        )
        .limit(8);
      if (articles.length > 0) {
        const list = articles
          .map((a, i) => {
            const href = a.canonicalUrl || a.url;
            const title = a.title ?? "(bez titulku)";
            const desc = a.description ?? "";
            const src = a.sourceName ?? "";
            return `${i + 1}. ${title} — ${src}\n   URL: ${href}\n   Popis: ${desc}`.trim();
          })
          .join("\n\n");
        sections.push(`Články k zakomponování (použij každý jako kartu s odkazem):\n${list}`);
      }
    }

    const userInput = `${SYSTEM_PROMPT}\n\n${sections.join("\n\n")}\n\nVrať JSON odpověď přesně podle schématu.`;

    try {
      const { parsed } = await createResponseStructured<GeneratedCampaignDraft>(
        userInput,
        CAMPAIGN_DRAFT_SCHEMA as unknown as Record<string, unknown>,
        {
          schemaName: "email_campaign_draft",
          store: false,
          routing: { category: "default" },
        },
      );
      const draft: GeneratedCampaignDraft = {
        subject: (parsed.subject ?? "").toString().trim().slice(0, 200) || "Novinky",
        preheader: (parsed.preheader ?? "").toString().trim().slice(0, 200),
        bodyHtml: ensurePersonalizationPlaceholders(
          (parsed.bodyHtml ?? "").toString(),
        ),
        notes: parsed.notes ? String(parsed.notes).slice(0, 500) : null,
      };

      try {
        await saveGeneration({
          tenantId: auth.tenantId,
          entityType: "email_campaign",
          entityId: input.campaignId ?? "draft-preview",
          promptType: "email_campaign_draft",
          promptId: "email-ai-generator-v1",
          generatedByUserId: auth.userId,
          outputText: JSON.stringify(draft),
          status: "success",
        });
      } catch {
        // log selhání nesmí rozbít návrat draftu — zalogování je bonus.
      }

      return draft;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      try {
        await saveGeneration({
          tenantId: auth.tenantId,
          entityType: "email_campaign",
          entityId: input.campaignId ?? "draft-preview",
          promptType: "email_campaign_draft",
          promptId: "email-ai-generator-v1",
          generatedByUserId: auth.userId,
          outputText: JSON.stringify({ error: msg, input: { goal, audienceDescription: input.audienceDescription, baseTemplateKind: input.baseTemplateKind } }),
          status: "failure",
        });
      } catch {
        // no-op
      }
      throw new Error(`Generování draftu selhalo: ${msg}`);
    }
  });
}

function ensurePersonalizationPlaceholders(html: string): string {
  let out = html;
  if (!out.includes("{{unsubscribe_url}}")) {
    out += `\n<p style="margin-top:32px;font-size:12px;color:#64748b;">\n  <a href="{{unsubscribe_url}}">Odhlásit odběr</a>\n</p>`;
  }
  return out;
}
