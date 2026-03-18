import { config } from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Load DATABASE_URL from apps/web/.env.local when run from monorepo root (pnpm db:migrate)
const cwd = process.cwd();
const envLocal = resolve(cwd, "apps/web/.env.local");
const envLocalFromDb = resolve(cwd, "../../apps/web/.env.local");
if (existsSync(envLocal)) config({ path: envLocal });
else if (existsSync(envLocalFromDb)) config({ path: envLocalFromDb });

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? "";
if (!connectionString) {
  console.error("Set DATABASE_URL or SUPABASE_DB_URL");
  process.exit(1);
}

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

async function main() {
  const migrationsFolder = resolve(cwd, "drizzle");
  await migrate(db, { migrationsFolder });
  console.log("Migrations done.");
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
