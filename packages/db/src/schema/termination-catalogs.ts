import { pgTable, uuid, text, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import type { TerminationDefaultDateComputation } from "./termination-enums";

/**
 * Registr pojišťoven pro výpovědi – globální (`tenant_id` NULL) nebo override per tenant.
 * Seed: používej stabilní `catalog_key` (např. `cz:GENERALI`) pro idempotentní upsert v migraci/seed skriptu.
 * Unikátnost řádků: partial indexy v `migrations/termination_module_2026-04-07.sql` (globální vs per-tenant).
 */
export const insurerTerminationRegistry = pgTable(
  "insurer_termination_registry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    catalogKey: text("catalog_key").notNull(),
    insurerName: text("insurer_name").notNull(),
    aliases: jsonb("aliases").$type<string[]>(),
    supportedSegments: jsonb("supported_segments").$type<string[]>(),
    mailingAddress: jsonb("mailing_address").$type<Record<string, unknown>>(),
    email: text("email"),
    dataBox: text("data_box"),
    webFormUrl: text("web_form_url"),
    clientPortalUrl: text("client_portal_url"),
    freeformLetterAllowed: boolean("freeform_letter_allowed").notNull().default(true),
    requiresOfficialForm: boolean("requires_official_form").notNull().default(false),
    officialFormName: text("official_form_name"),
    officialFormStoragePath: text("official_form_storage_path"),
    officialFormNotes: text("official_form_notes"),
    allowedChannels: jsonb("allowed_channels").$type<string[]>(),
    ruleOverrides: jsonb("rule_overrides").$type<Record<string, unknown>>(),
    attachmentRules: jsonb("attachment_rules").$type<Record<string, unknown>>(),
    /** Backoffice: záznam z katalogu ještě nebyl ověřen právně/ops. */
    registryNeedsVerification: boolean("registry_needs_verification").notNull().default(false),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    registryInternalNotes: text("registry_internal_notes"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

/**
 * Verzovatelný katalog důvodů výpovědi (globální nebo per tenant).
 * `reason_code` odpovídá hodnotám z `terminationReasonCodes` (+ rozšíření přes migrace).
 * Unikátnost: partial indexy v `migrations/termination_module_2026-04-07.sql`.
 */
export const terminationReasonCatalog = pgTable(
  "termination_reason_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    reasonCode: text("reason_code").notNull(),
    labelCs: text("label_cs").notNull(),
    /** Segmentové kódy (např. ZP, MAJ) – průnik s app katalogem smluv. */
    supportedSegments: jsonb("supported_segments").$type<string[]>(),
    defaultDateComputation: text("default_date_computation")
      .notNull()
      .$type<TerminationDefaultDateComputation>(),
    /** Pole struktury žádosti / wizardu, které rules engine vyžaduje. */
    requiredFields: jsonb("required_fields").$type<string[]>(),
    attachmentRequired: boolean("attachment_required").notNull().default(false),
    alwaysReview: boolean("always_review").notNull().default(false),
    instructions: text("instructions"),
    sortOrder: integer("sort_order").notNull().default(0),
    version: integer("version").notNull().default(1),
    active: boolean("active").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  }
);
