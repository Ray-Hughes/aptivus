/**
 * Aptivus data model.
 *
 * SQLite for local development so there is no infrastructure to stand up.
 * Written to stay Postgres-shaped: no SQLite-only types, timestamps stored as
 * epoch integers, ids as text. Moving to Postgres is a driver swap plus a
 * column-type pass, not a redesign.
 */
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch())`;
const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());

/* ------------------------------------------------------------------ */
/* accounts                                                            */
/* ------------------------------------------------------------------ */
export const users = sqliteTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    emailVerifiedAt: integer("email_verified_at"),
    // Nullable on purpose: passwordless-only accounts are first class.
    passwordHash: text("password_hash"),
    displayName: text("display_name"),
    image: text("image"),
    // "user" | "admin". There is no admin signup route; admins are promoted
    // deliberately via the CLI, never through a public form.
    role: text("role").notNull().default("user"),
    timezone: text("timezone").notNull().default("UTC"),
    gemBalance: integer("gem_balance").notNull().default(0),
    createdAt: integer("created_at").notNull().default(now),
    lastSeenAt: integer("last_seen_at"),
    deletedAt: integer("deleted_at"),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
  }),
);

/** Auth.js session/account tables. */
export const sessions = sqliteTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const accounts = sqliteTable(
  "accounts",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({ pk: primaryKey({ columns: [t.provider, t.providerAccountId] }) }),
);

export const verificationTokens = sqliteTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.identifier, t.token] }) }),
);

/**
 * Our own single-use tokens for password reset and email verification.
 * Only the HASH is stored: a database leak must not hand out working links.
 */
export const authTokens = sqliteTable(
  "auth_tokens",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // password_reset | email_verify
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    consumedAt: integer("consumed_at"),
    createdIp: text("created_ip"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    hashIdx: uniqueIndex("auth_tokens_hash_idx").on(t.tokenHash),
    userIdx: index("auth_tokens_user_idx").on(t.userId),
  }),
);

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  targetCompany: text("target_company"),
  targetRole: text("target_role"),
  targetRound: text("target_round"),
  experienceLevel: text("experience_level"),
  primaryLanguage: text("primary_language").notNull().default("python"),
  interviewDate: integer("interview_date"),
});

/* ------------------------------------------------------------------ */
/* billing and the gem economy                                         */
/* ------------------------------------------------------------------ */
export const subscriptions = sqliteTable("subscriptions", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status: text("status").notNull().default("none"),
  plan: text("plan").notNull().default("free"),
  currentPeriodEnd: integer("current_period_end"),
  updatedAt: integer("updated_at").notNull().default(now),
});

/**
 * Append-only. Balances are derived from this and cached on users.gemBalance.
 * Never mutate a balance without writing the row that explains it - when a
 * charge is disputed, a ledger is the difference between a quick answer and
 * an unanswerable one.
 */
export const gemLedger = sqliteTable(
  "gem_ledger",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    kind: text("kind").notNull(), // earn | purchase | spend | grant | refund
    reason: text("reason").notNull(),
    problemId: text("problem_id"),
    stripeRef: text("stripe_ref"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({ userIdx: index("gem_ledger_user_idx").on(t.userId, t.createdAt) }),
);

/** Free-tier daily allowance, tracked separately from gems and spent first. */
export const dailyUsage = sqliteTable(
  "daily_usage",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    dayUtc: text("day_utc").notNull(), // YYYY-MM-DD
    hintsUsed: integer("hints_used").notNull().default(0),
    solutionsUsed: integer("solutions_used").notNull().default(0),
    generationsUsed: integer("generations_used").notNull().default(0),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.dayUtc] }) }),
);

/** Idempotency for Stripe webhooks: they are delivered at least once. */
export const processedEvents = sqliteTable("processed_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  processedAt: integer("processed_at").notNull().default(now),
});

/* ------------------------------------------------------------------ */
/* content                                                             */
/* ------------------------------------------------------------------ */
export const companies = sqliteTable(
  "companies",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    industry: text("industry"),
    /** Research payload: loop shape, patterns tested, sources. */
    profile: text("profile", { mode: "json" }),
    isPublished: integer("is_published", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({ slugIdx: uniqueIndex("companies_slug_idx").on(t.slug) }),
);

export const problems = sqliteTable(
  "problems",
  {
    id: id(),
    slug: text("slug").notNull(),
    pack: text("pack").notNull().default("general"),
    companyId: text("company_id").references(() => companies.id),
    kind: text("kind").notNull().default("python"), // python | sql
    title: text("title").notNull(),
    difficulty: text("difficulty").notNull().default("medium"),
    pattern: text("pattern"),
    minutes: integer("minutes").notNull().default(15),
    /** Language-neutral spec: prompt, hints, tests, signature, per-language bindings. */
    body: text("body", { mode: "json" }).notNull(),
    source: text("source").notNull().default("curated"), // curated | generated
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    /** Generated problems are only shown once verify has passed against them. */
    verifiedAt: integer("verified_at"),
    isPublished: integer("is_published", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    slugIdx: uniqueIndex("problems_slug_idx").on(t.slug),
    packIdx: index("problems_pack_idx").on(t.pack),
    companyIdx: index("problems_company_idx").on(t.companyId),
  }),
);

/**
 * One row per submission, not one per problem. The old progress.json kept only
 * the latest state, which is why there were no stats to build a dashboard from.
 */
export const attempts = sqliteTable(
  "attempts",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    problemId: text("problem_id").notNull(),
    language: text("language").notNull().default("python"),
    status: text("status").notNull(), // tried | solved
    code: text("code"),
    testsPassed: integer("tests_passed").notNull().default(0),
    testsTotal: integer("tests_total").notNull().default(0),
    hintLevelUsed: integer("hint_level_used").notNull().default(0),
    solutionRevealed: integer("solution_revealed", { mode: "boolean" }).notNull().default(false),
    durationMs: integer("duration_ms"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    userIdx: index("attempts_user_idx").on(t.userId, t.createdAt),
    problemIdx: index("attempts_problem_idx").on(t.userId, t.problemId),
  }),
);

/** What a user has unlocked, so re-opening is never charged twice. */
export const reveals = sqliteTable(
  "reveals",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    problemId: text("problem_id").notNull(),
    kind: text("kind").notNull(), // hint | solution
    level: integer("level").notNull().default(0),
    paidWith: text("paid_with").notNull(), // free | gem | pro | earned
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    uniq: uniqueIndex("reveals_uniq_idx").on(t.userId, t.problemId, t.kind, t.level),
  }),
);

/* ------------------------------------------------------------------ */
/* achievements                                                        */
/* ------------------------------------------------------------------ */
export const achievements = sqliteTable(
  "achievements",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    icon: text("icon"),
    tier: text("tier").notNull().default("bronze"),
    gemReward: integer("gem_reward").notNull().default(0),
    rule: text("rule", { mode: "json" }), // evaluated server-side
  },
  (t) => ({ slugIdx: uniqueIndex("achievements_slug_idx").on(t.slug) }),
);

export const userAchievements = sqliteTable(
  "user_achievements",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    achievementId: text("achievement_id").notNull().references(() => achievements.id),
    progress: real("progress").notNull().default(0),
    earnedAt: integer("earned_at"),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.achievementId] }) }),
);

/* ------------------------------------------------------------------ */
/* feature flags                                                       */
/* ------------------------------------------------------------------ */
export const featureFlags = sqliteTable(
  "feature_flags",
  {
    key: text("key").primaryKey(),
    description: text("description").notNull().default(""),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    /** 0-100. Deterministic per user, so a user does not flip between loads. */
    rolloutPercent: integer("rollout_percent").notNull().default(0),
    /** Explicit allow list, evaluated before the percentage. */
    allowUserIds: text("allow_user_ids", { mode: "json" }).$type<string[]>(),
    updatedAt: integer("updated_at").notNull().default(now),
  },
);

/** Every consequential admin action, so the panel is auditable. */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: id(),
    actorUserId: text("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    meta: text("meta", { mode: "json" }),
    ip: text("ip"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({ actorIdx: index("audit_actor_idx").on(t.actorUserId, t.createdAt) }),
);

export type User = typeof users.$inferSelect;
export type Problem = typeof problems.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export type FeatureFlag = typeof featureFlags.$inferSelect;
