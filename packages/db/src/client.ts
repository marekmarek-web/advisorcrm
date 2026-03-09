import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

let _db: PostgresJsDatabase<typeof schema> | null = null;

function getDb(): PostgresJsDatabase<typeof schema> {
  if (_db) return _db;
  const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? "";
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL není nastavená. Na Vercelu přidej Environment Variable DATABASE_URL (Supabase → Project Settings → Database → Connection string)."
    );
  }
  if (connectionString.includes("[") || connectionString.includes("]")) {
    throw new Error(
      "DATABASE_URL je stále placeholder (obsahuje [ref], [password] nebo [region]). V Supabase zkopíruj skutečný Connection string a nahraď [YOUR-PASSWORD] heslem."
    );
  }
  const isSupabase = connectionString.includes("supabase.co");
  const hasSslParam = connectionString.includes("sslmode=");
  const connectionOptions: Record<string, unknown> = { max: 10, prepare: false };
  if (isSupabase && !hasSslParam) {
    connectionOptions.ssl = "require";
  }
  const client = postgres(connectionString, connectionOptions as Parameters<typeof postgres>[1]);
  _db = drizzle(client, { schema });
  return _db;
}

/** Lazy DB – chyba připojení vznikne až při prvním dotazu, takže ji může zachytit try/catch ve server action. */
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_, prop) {
    return (getDb() as Record<string, unknown>)[prop as string];
  },
});
