import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(8).optional(),
  SENTRY_DSN: z.string().min(1).optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().min(1).optional(),
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.string().min(1).optional(),
  INTEGRATIONS_ENCRYPTION_KEY: z.string().min(16).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  /** Odpovědi na tento e-mail (např. firemní poradce); From zůstane z ověřené domény. */
  RESEND_REPLY_TO: z.string().min(3).optional(),
  /** Doména pro generovaný From (např. aidvisora.cz); jinak se parsuje z RESEND_FROM_EMAIL. */
  RESEND_FROM_DOMAIN: z.string().min(3).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_SKIP_AUTH: z.enum(["true", "false", ""]).optional(),
  /** When "true", hides client portal AI help (nav-only chat). */
  NEXT_PUBLIC_DISABLE_CLIENT_PORTAL_AI: z.enum(["true", "false", ""]).optional(),
});

function validateEnv() {
  const result = serverSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(`[ENV] Missing or invalid environment variables:\n${formatted}`);
    if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
      throw new Error(`Invalid environment configuration:\n${formatted}`);
    }
  }
  return result.success ? result.data : (process.env as unknown as z.infer<typeof serverSchema>);
}

export const env = validateEnv();
