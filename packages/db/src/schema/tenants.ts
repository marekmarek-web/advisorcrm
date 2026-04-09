import { pgTable, uuid, text, timestamp, boolean, unique } from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** Stripe Customer id (cus_…), jeden na workspace */
  stripeCustomerId: text("stripe_customer_id").unique(),
  notificationEmail: text("notification_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // Admin | Director | Manager | Advisor | Viewer
  permissions: text("permissions").array(), // JSON or array of permission keys
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    parentId: text("parent_id"),
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    invitedBy: text("invited_by"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    mfaEnabled: boolean("mfa_enabled").default(false),
    /** Kariérní program (odděleně od roleId) — viz docs/team-overview-career-ladders.md */
    careerProgram: text("career_program"),
    careerTrack: text("career_track"),
    careerPositionCode: text("career_position_code"),
  },
  (t) => [unique("memberships_tenant_user").on(t.tenantId, t.userId)]
);

/** Pozvánka poradce / člena týmu do existujícího tenantu (odkaz s tokenem). */
export const staffInvitations = pgTable("staff_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  authUserId: text("auth_user_id"),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  invitedByUserId: text("invited_by_user_id"),
  emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
  lastEmailError: text("last_email_error"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
