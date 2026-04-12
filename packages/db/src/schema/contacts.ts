import { pgTable, uuid, text, timestamp, date, unique, boolean } from "drizzle-orm/pg-core";

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  title: text("title"),
  notes: text("notes"),
  referralSource: text("referral_source"), // kdo doporučil / doporučen
  referralContactId: uuid("referral_contact_id"),
  birthDate: date("birth_date", { mode: "string" }),
  personalId: text("personal_id"),
  /** Číslo občanského průkazu (volitelné). */
  idCardNumber: text("id_card_number"),
  street: text("street"),
  city: text("city"),
  zip: text("zip"),
  tags: text("tags").array(),
  lifecycleStage: text("lifecycle_stage"),
  leadSource: text("lead_source"), // e.g. "zivefirmy.cz", "import", "manually"
  leadSourceUrl: text("lead_source_url"), // optional URL user pasted
  priority: text("priority"), // low | normal | high | urgent – jak rychle se to musí vyřešit
  avatarUrl: text("avatar_url"),
  notificationUnsubscribedAt: timestamp("notification_unsubscribed_at", { withTimezone: true }),
  gdprConsentAt: timestamp("gdpr_consent_at", { withTimezone: true }),
  serviceCycleMonths: text("service_cycle_months"),
  lastServiceDate: date("last_service_date", { mode: "string" }),
  nextServiceDue: date("next_service_due", { mode: "string" }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedReason: text("archived_reason"),
  preferredChannel: text("preferred_channel"),
  doNotEmail: boolean("do_not_email").notNull().default(false),
  doNotPush: boolean("do_not_push").notNull().default(false),
  bestContactTime: text("best_contact_time"),
  /** Ručně zadané formální oslovení (např. „pane Nováku,“) — bez auto-skloňování. */
  preferredSalutation: text("preferred_salutation"),
  preferredGreetingName: text("preferred_greeting_name"),
  greetingStyle: text("greeting_style"),
  birthGreetingOptOut: boolean("birth_greeting_opt_out").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  icon: text("icon"), // e.g. "home", "users", "heart" – from predefined set
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const householdMembers = pgTable("household_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  role: text("role"), // primary | member | child
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  ico: text("ico"),
  dic: text("dic"),
  address: text("address"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const relationships = pgTable("relationships", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  fromType: text("from_type").notNull(), // contact | organization
  fromId: uuid("from_id").notNull(),
  toType: text("to_type").notNull(),
  toId: uuid("to_id").notNull(),
  kind: text("kind").notNull(), // works_at | spouse | parent_of | ...
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Mapování přihlášeného uživatele (klienta) na kontakt – přístup do Client Zone jen k tomuto kontaktu. */
export const clientContacts = pgTable(
  "client_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    userId: text("user_id").notNull(),
    contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("client_contacts_tenant_user").on(t.tenantId, t.userId),
    unique("client_contacts_tenant_contact").on(t.tenantId, t.contactId),
  ]
);

/** Jednorázový token pro odhlášení z notifikací (odkaz v e-mailu). */
export const unsubscribeTokens = pgTable("unsubscribe_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Pozvánka klienta do Client Zone – e-mail s odkazem (token); po registraci/přihlášení mapování user_id → contact_id. */
export const clientInvitations = pgTable("client_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  authUserId: text("auth_user_id"),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  invitedByUserId: text("invited_by_user_id"),
  temporaryPasswordSentAt: timestamp("temporary_password_sent_at", { withTimezone: true }),
  passwordChangeRequiredAt: timestamp("password_change_required_at", { withTimezone: true }),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
  lastEmailError: text("last_email_error"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
