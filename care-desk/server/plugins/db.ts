import { runMigrations } from "@agent-native/core/db";

export default runMigrations(
  [
    {
      version: 1,
      name: "care-desk-core-tables",
      sql: `
        CREATE TABLE IF NOT EXISTS cd_residents (
          id TEXT PRIMARY KEY,
          full_name TEXT NOT NULL,
          preferred_name TEXT NOT NULL,
          date_of_birth TEXT NOT NULL,
          room TEXT NOT NULL,
          about_me JSONB NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS cd_care_plan_lines (
          id TEXT PRIMARY KEY,
          resident_id TEXT NOT NULL,
          section TEXT NOT NULL,
          position INTEGER NOT NULL,
          text TEXT NOT NULL,
          check_kind TEXT,
          safety INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL,
          updated_by TEXT NOT NULL,
          review_due TEXT
        );
        CREATE INDEX IF NOT EXISTS cd_care_plan_lines_resident ON cd_care_plan_lines (resident_id, position);
        CREATE TABLE IF NOT EXISTS cd_observations (
          id TEXT PRIMARY KEY,
          resident_id TEXT NOT NULL,
          category TEXT NOT NULL,
          recorded_at TEXT NOT NULL,
          note TEXT NOT NULL,
          fluid_ml INTEGER,
          meal TEXT,
          portion TEXT,
          source TEXT NOT NULL,
          recorded_by TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS cd_observations_resident_time ON cd_observations (resident_id, recorded_at);
        CREATE TABLE IF NOT EXISTS cd_plan_drafts (
          id TEXT PRIMARY KEY,
          resident_id TEXT NOT NULL,
          line_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          before_text TEXT NOT NULL,
          after_text TEXT NOT NULL,
          evidence JSONB NOT NULL,
          author TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'dismissed')),
          final_text TEXT,
          created_at TEXT NOT NULL,
          decided_at TEXT
        );
        CREATE INDEX IF NOT EXISTS cd_plan_drafts_resident ON cd_plan_drafts (resident_id, status);
      `,
    },
    {
      version: 2,
      name: "care-desk-page-focus",
      sql: `
        CREATE TABLE IF NOT EXISTS cd_page_focus (
          id TEXT PRIMARY KEY,
          resident_id TEXT NOT NULL,
          target JSONB NOT NULL,
          nonce TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `,
    },
    {
      version: 3,
      name: "care-desk-shift-asks",
      sql: `
        CREATE TABLE IF NOT EXISTS cd_shift_asks (
          id TEXT PRIMARY KEY,
          resident_id TEXT NOT NULL,
          line_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          text TEXT NOT NULL,
          asked_at TEXT NOT NULL,
          asked_by TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS cd_shift_asks_resident ON cd_shift_asks (resident_id, asked_at);
      `,
    },
  ],
  { table: "care_desk_migrations" },
);
