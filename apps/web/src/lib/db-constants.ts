/**
 * Client-safe re-exports from db schema (no server-only code).
 * Use this in "use client" components instead of importing from "db".
 */
export { EVENT_TYPE_LABELS } from "../../../../packages/db/src/schema/tasks-events";
