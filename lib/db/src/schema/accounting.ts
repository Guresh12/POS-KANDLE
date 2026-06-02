import { pgTable, serial, text, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { branchesTable } from "./branches";
import { usersTable } from "./users";

// Chart of Accounts
export const accountsTable = pgTable("accounts", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(), // asset | liability | equity | revenue | expense
  subtype: text("subtype"),     // cash | bank | receivable | inventory | payable | tax | capital | retained | sales | cogs | operating
  normalBalance: text("normal_balance").notNull().default("debit"), // debit | credit
  parentId: integer("parent_id"),
  isSystem: boolean("is_system").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Journal Entry header
export const journalEntriesTable = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  entryNumber: text("entry_number").notNull().unique(),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  description: text("description").notNull(),
  sourceModule: text("source_module"), // sale | purchase | expense | payment | adjustment | manual
  sourceId: integer("source_id"),
  sourceRef: text("source_ref"),
  branchId: integer("branch_id").references(() => branchesTable.id),
  createdBy: integer("created_by").references(() => usersTable.id),
  isReversed: boolean("is_reversed").notNull().default(false),
  reversedById: integer("reversed_by_id"),
  status: text("status").notNull().default("posted"), // posted | void
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Journal Entry lines — always balanced (sum debits = sum credits per entry)
export const journalLinesTable = pgTable("journal_lines", {
  id: serial("id").primaryKey(),
  journalEntryId: integer("journal_entry_id").notNull().references(() => journalEntriesTable.id),
  accountId: integer("account_id").notNull().references(() => accountsTable.id),
  debit: numeric("debit", { precision: 12, scale: 2 }).notNull().default("0"),
  credit: numeric("credit", { precision: 12, scale: 2 }).notNull().default("0"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Cash drawer reconciliation sessions
export const cashDrawerSessionsTable = pgTable("cash_drawer_sessions", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").references(() => branchesTable.id),
  openedBy: integer("opened_by").references(() => usersTable.id),
  closedBy: integer("closed_by").references(() => usersTable.id),
  openingBalance: numeric("opening_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  expectedBalance: numeric("expected_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  actualBalance: numeric("actual_balance", { precision: 12, scale: 2 }),
  variance: numeric("variance", { precision: 12, scale: 2 }),
  status: text("status").notNull().default("open"), // open | closed
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  notes: text("notes"),
});

export const insertAccountSchema = createInsertSchema(accountsTable).omit({ id: true, createdAt: true });
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;

export const insertJournalEntrySchema = createInsertSchema(journalEntriesTable).omit({ id: true, createdAt: true });
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = typeof journalEntriesTable.$inferSelect;

export const insertCashDrawerSchema = createInsertSchema(cashDrawerSessionsTable).omit({ id: true });
export type InsertCashDrawer = z.infer<typeof insertCashDrawerSchema>;
export type CashDrawerSession = typeof cashDrawerSessionsTable.$inferSelect;
