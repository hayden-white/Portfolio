import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// One row per person who has reached out. Email is the unique identity, so repeat
// submissions from the same person attach to the same contact (the basis for leads).
export const contacts = pgTable("contacts", {
  id: serial().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  phone: text(),
  company: text(),
  // Lead pipeline status: new | contacted | qualified | converted | archived
  status: text().notNull().default("new"),
  notes: text(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Each contact form submission. A contact can have many messages.
export const messages = pgTable(
  "messages",
  {
    id: serial().primaryKey(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    subject: text(),
    body: text().notNull(),
    // Where the submission came from (e.g. page path) for later attribution
    source: text(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_contact_id_idx").on(t.contactId)],
);

export type Contact = typeof contacts.$inferSelect;
export type Message = typeof messages.$inferSelect;
