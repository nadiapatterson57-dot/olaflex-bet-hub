import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const predictionsTable = pgTable(
  "olaflex_predictions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    category: text("category").notNull().default("free"),
    risk: text("risk").notNull().default("medium"),
    status: text("status").notNull().default("draft"),
    result: text("result").notNull().default("pending"),
    bookingCode: text("booking_code"),
    analysis: text("analysis"),
    imagePath: text("image_path"),
    combinedOddsOverride: numeric("combined_odds_override", {
      precision: 16,
      scale: 4,
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("olaflex_predictions_slug_uidx").on(table.slug),
    index("olaflex_predictions_public_idx").on(
      table.status,
      table.category,
      table.publishedAt,
    ),
    index("olaflex_predictions_result_idx").on(table.result, table.publishedAt),
  ],
);

export const predictionMatchesTable = pgTable(
  "olaflex_prediction_matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    predictionId: uuid("prediction_id")
      .notNull()
      .references(() => predictionsTable.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    homeTeam: text("home_team").notNull(),
    awayTeam: text("away_team").notNull(),
    homeLogoUrl: text("home_logo_url"),
    awayLogoUrl: text("away_logo_url"),
    competition: text("competition").notNull(),
    market: text("market").notNull(),
    selection: text("selection").notNull(),
    odds: numeric("odds", { precision: 12, scale: 4 }).notNull(),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("olaflex_prediction_matches_prediction_idx").on(
      table.predictionId,
      table.sortOrder,
    ),
    index("olaflex_prediction_matches_kickoff_idx").on(table.kickoffAt),
  ],
);

export const predictionResultEventsTable = pgTable(
  "olaflex_prediction_result_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    predictionId: uuid("prediction_id")
      .notNull()
      .references(() => predictionsTable.id, { onDelete: "cascade" }),
    result: text("result").notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("olaflex_result_events_prediction_idx").on(
      table.predictionId,
      table.settledAt,
    ),
  ],
);

export const siteSettingsTable = pgTable("olaflex_site_settings", {
  id: text("id").primaryKey().default("primary"),
  contactEmail: text("contact_email").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  whatsappNumber: text("whatsapp_number").notNull().default(""),
  instagramUrl: text("instagram_url").notNull().default(""),
  facebookUrl: text("facebook_url").notNull().default(""),
  xUrl: text("x_url").notNull().default(""),
  announcement: text("announcement").notNull().default(""),
  sportyBetUrl: text("sporty_bet_url")
    .notNull()
    .default("https://www.sportybet.com/"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const blogPostsTable = pgTable(
  "olaflex_blog_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    content: text("content").notNull(),
    status: text("status").notNull().default("draft"),
    coverImagePath: text("cover_image_path"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("olaflex_blog_posts_slug_uidx").on(table.slug),
    index("olaflex_blog_posts_public_idx").on(table.status, table.publishedAt),
  ],
);

export const contactMessagesTable = pgTable(
  "olaflex_contact_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("olaflex_contact_messages_created_idx").on(table.createdAt)],
);

export const predictionBackupMetaTable = pgTable("olaflex_backup_meta", {
  id: text("id").primaryKey().default("primary"),
  lastImportAt: timestamp("last_import_at", { withTimezone: true }),
  importDetails: jsonb("import_details"),
});
