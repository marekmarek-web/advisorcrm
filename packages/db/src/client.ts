import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? "";

if (!connectionString) {
  throw new Error(
    "DATABASE_URL není nastavená. Přidej do apps/web/.env.local řádek: DATABASE_URL=postgresql://... (zkopíruj z Supabase → Project Settings → Database → Connection string URI a nahraď [YOUR-PASSWORD] heslem)."
  );
}
if (connectionString.includes("[") || connectionString.includes("]")) {
  throw new Error(
    "DATABASE_URL v .env.local je stále placeholder (obsahuje [ref], [password] nebo [region]). V Supabase Dashboard → Project Settings → Database zkopíruj skutečný Connection string (URI) a nahraď [YOUR-PASSWORD] heslem k databázi."
  );
}

const client = postgres(connectionString, { max: 10, prepare: false });
export const db = drizzle(client, { schema });
