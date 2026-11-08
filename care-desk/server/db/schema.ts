import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";

// Every row in these tables is synthetic demo data. Care Desk is a fictional
// care-record system; Anji reads and writes it only through actions.

export type AboutMeSection = {
  key: string;
  label: string;
  text: string;
};

export const residents = pgTable("cd_residents", {
  id: text("id").primaryKey(),
  fullName: text("full_name").notNull(),
  preferredName: text("preferred_name").notNull(),
  dateOfBirth: text("date_of_birth").notNull(),
  room: text("room").notNull(),
  aboutMe: jsonb("about_me").$type<AboutMeSection[]>().notNull(),
  createdAt: text("created_at").notNull(),
});

export const carePlanLines = pgTable("cd_care_plan_lines", {
  id: text("id").primaryKey(),
  residentId: text("resident_id").notNull(),
  section: text("section").notNull(),
  position: integer("position").notNull(),
  text: text("text").notNull(),
  // "fluid" and "appetite" lines are checked against records; "safety" lines
  // are surfaced first in briefs.
  checkKind: text("check_kind"),
  safety: integer("safety").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
  reviewDue: text("review_due"),
});

export const observations = pgTable("cd_observations", {
  id: text("id").primaryKey(),
  residentId: text("resident_id").notNull(),
  category: text("category").notNull(),
  recordedAt: text("recorded_at").notNull(),
  note: text("note").notNull(),
  fluidMl: integer("fluid_ml"),
  meal: text("meal"),
  portion: text("portion"),
  source: text("source").notNull(),
  recordedBy: text("recorded_by").notNull(),
});

export type DraftEvidence = { label: string; detail: string };

export const planDrafts = pgTable("cd_plan_drafts", {
  id: text("id").primaryKey(),
  residentId: text("resident_id").notNull(),
  lineId: text("line_id").notNull(),
  reason: text("reason").notNull(),
  beforeText: text("before_text").notNull(),
  afterText: text("after_text").notNull(),
  evidence: jsonb("evidence").$type<DraftEvidence[]>().notNull(),
  author: text("author").notNull(),
  status: text("status").notNull(),
  finalText: text("final_text"),
  createdAt: text("created_at").notNull(),
  decidedAt: text("decided_at"),
});

export type PageTarget =
  | { kind: "plan"; lineText: string }
  | { kind: "record"; recordId: string }
  | { kind: "about"; label: string };

// The one thing Anji last pointed at on the care system's page. The side
// panel reads it after each change and scrolls the page there.
export const pageFocus = pgTable("cd_page_focus", {
  id: text("id").primaryKey(),
  residentId: text("resident_id").notNull(),
  target: jsonb("target").$type<PageTarget>().notNull(),
  nonce: text("nonce").notNull(),
  createdAt: text("created_at").notNull(),
});

// A manager's question to whoever is on shift ("Ask the shift"). It has no
// status column on purpose: it is answered when a matching record arrives
// after askedAt, so nobody has to tick it off.
export const shiftAsks = pgTable("cd_shift_asks", {
  id: text("id").primaryKey(),
  residentId: text("resident_id").notNull(),
  lineId: text("line_id").notNull(),
  kind: text("kind").notNull(),
  text: text("text").notNull(),
  askedAt: text("asked_at").notNull(),
  askedBy: text("asked_by").notNull(),
});
