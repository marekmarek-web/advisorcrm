/**
 * Team Overview F1 — canonical team_members + manual periods + career log.
 *
 * team_members je source of truth pro osobu v týmové struktuře.
 * auth_user_id je nullable — umožňuje externí / manuálně vedené členy bez auth účtu.
 * Hierarchie přes parent_member_id, ne přes memberships.parent_id (po migraci).
 *
 * Po dobu migrace memberships drží shadow copy kariérních polí a parent_id;
 * trigger sync_team_member_from_membership udržuje team_members v konzistenci.
 */

import { pgTable, uuid, text, integer, numeric, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Vazba na auth uživatele; null = externí / manuálně vedený člen. */
    authUserId: text("auth_user_id"),
    displayName: text("display_name"),
    email: text("email"),
    phone: text("phone"),
    /** Kanonický strom hierarchie. */
    parentMemberId: uuid("parent_member_id"),
    /** active | paused | offboarded | planned */
    status: text("status").notNull().default("active"),
    /** internal_user | external_manual */
    memberKind: text("member_kind").notNull().default("internal_user"),
    careerProgram: text("career_program"),
    careerTrack: text("career_track"),
    careerPositionCode: text("career_position_code"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
  },
  (t) => [
    // Partial unique index (auth_user_id IS NOT NULL) je definovan\u00fd v SQL migraci.
    // Zde nech\u00e1v\u00e1me pouze non-unique index pro Drizzle/TypeScript reference.
    index("team_members_tenant_idx").on(t.tenantId),
    index("team_members_parent_idx").on(t.parentMemberId),
    index("team_members_auth_user_idx").on(t.tenantId, t.authUserId),
  ]
);

export const teamMemberManualPeriods = pgTable(
  "team_member_manual_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    teamMemberId: uuid("team_member_id").notNull(),
    /** week | month | quarter */
    period: text("period").notNull(),
    year: integer("year").notNull(),
    /** 1..53 pro týden, 1..12 pro měsíc, 1..4 pro quartal */
    periodIndex: integer("period_index").notNull(),
    unitsCount: integer("units_count"),
    productionAmount: numeric("production_amount", { precision: 18, scale: 2 }),
    contractsCount: integer("contracts_count"),
    meetingsCount: integer("meetings_count"),
    activitiesCount: integer("activities_count"),
    /**
     * Pool-specific jednotky per program:
     *   { beplan: { bj, bjs }, premium_brokers: { units }, call_center: { calls, conversions } }
     */
    poolUnits: jsonb("pool_units"),
    /** manual_confirmed | manual_estimated */
    confidence: text("confidence").notNull().default("manual_confirmed"),
    sourceNote: text("source_note"),
    enteredBy: text("entered_by"),
    enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("team_member_manual_periods_uniq").on(t.tenantId, t.teamMemberId, t.period, t.year, t.periodIndex),
    index("team_member_manual_periods_tenant_idx").on(t.tenantId),
    index("team_member_manual_periods_member_idx").on(t.teamMemberId),
  ]
);

export const teamMemberCareerLog = pgTable(
  "team_member_career_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    teamMemberId: uuid("team_member_id").notNull(),
    careerProgram: text("career_program"),
    careerTrack: text("career_track"),
    careerPositionCode: text("career_position_code"),
    /** auto | manual_confirmed | manual_override */
    changeKind: text("change_kind").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    sourceNote: text("source_note"),
    actorUserId: text("actor_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("team_member_career_log_member_idx").on(t.teamMemberId, t.effectiveFrom),
    index("team_member_career_log_tenant_idx").on(t.tenantId),
  ]
);

export type TeamMemberStatus = "active" | "paused" | "offboarded" | "planned";
export type TeamMemberKind = "internal_user" | "external_manual";
export type TeamMemberManualConfidence = "manual_confirmed" | "manual_estimated";
export type TeamMemberCareerChangeKind = "auto" | "manual_confirmed" | "manual_override";
