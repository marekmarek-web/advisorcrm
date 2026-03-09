import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? "";
if (!connectionString) {
  console.error("Set DATABASE_URL or SUPABASE_DB_URL");
  process.exit(1);
}

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations done.");
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
