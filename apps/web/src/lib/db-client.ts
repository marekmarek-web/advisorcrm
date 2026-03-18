import "server-only";
import postgres from "postgres";
import { createDb } from "../../../../packages/db/src/create-db";

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL or SUPABASE_DB_URL");
}

if (connectionString.includes("[") || connectionString.includes("]")) {
  throw new Error(
    "DATABASE_URL je placeholder (obsahuje [ref] nebo [password]). Použij skutečný connection string z Supabase."
  );
}

const isSupabase = connectionString.includes("supabase.co");
const hasSslParam = connectionString.includes("sslmode=");

// Pool = kolik připojení k DB může aplikace mít najednou. Každý dotaz jedno použije a vrátí.
// Supabase Free má 60 přímých připojení; 30 stačí pro jednu instanci, nic tě neomezí.
const client = postgres(connectionString, {
  max: 30,
  prepare: false,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
  ...(isSupabase && !hasSslParam ? { ssl: "require" as const } : {}),
});

export const db = createDb(client);
