import { defineConfig } from "drizzle-kit";
import { resolve } from "path";
import { existsSync } from "fs";
import { config } from "dotenv";

// Načte DATABASE_URL z apps/web/.env.local při db:push / db:migrate z kořene repo
const envLocal = resolve(process.cwd(), "apps/web/.env.local");
const envLocalFromDb = resolve(process.cwd(), "../../apps/web/.env.local");
if (existsSync(envLocal)) config({ path: envLocal });
else if (existsSync(envLocalFromDb)) config({ path: envLocalFromDb });

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? "postgresql://localhost:5432/advisor_crm",
  },
});
