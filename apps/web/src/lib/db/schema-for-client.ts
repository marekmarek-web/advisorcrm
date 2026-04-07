/**
 * Client-safe exports: Drizzle schema types and small const enums only.
 * The main `db` path (`src/lib/db.ts`) re-exports `db-client` (postgres); never import that from "use client" modules.
 */
export type { BookingWeeklyAvailability } from "../../../../../packages/db/src/schema/advisor-preferences";
export * from "../../../../../packages/db/src/schema/termination-enums";
