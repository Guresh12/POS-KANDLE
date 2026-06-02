import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { branchesTable } from "./branches";

export const inventoryTable = pgTable("inventory", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const inventoryTransactionsTable = pgTable("inventory_transactions", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id),
  type: text("type").notNull(),
  quantityBefore: numeric("quantity_before", { precision: 12, scale: 2 }).notNull().default("0"),
  quantityChanged: numeric("quantity_changed", { precision: 12, scale: 2 }).notNull(),
  quantityAfter: numeric("quantity_after", { precision: 12, scale: 2 }).notNull().default("0"),
  reference: text("reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInventoryTransactionSchema = createInsertSchema(inventoryTransactionsTable).omit({ id: true, createdAt: true });
export type InsertInventoryTransaction = z.infer<typeof insertInventoryTransactionSchema>;
export type InventoryTransaction = typeof inventoryTransactionsTable.$inferSelect;
