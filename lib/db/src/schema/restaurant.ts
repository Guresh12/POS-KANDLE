import { pgTable, serial, text, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

export const restaurantTablesTable = pgTable("restaurant_tables", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull().default(4),
  status: text("status").notNull().default("available"),
  currentOrderId: integer("current_order_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const restaurantOrdersTable = pgTable("restaurant_orders", {
  id: serial("id").primaryKey(),
  tableId: integer("table_id").references(() => restaurantTablesTable.id),
  orderType: text("order_type").notNull().default("dine_in"),
  status: text("status").notNull().default("pending"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  kitchenSentAt: timestamp("kitchen_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const restaurantOrderItemsTable = pgTable("restaurant_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => restaurantOrdersTable.id),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("pending"),
});

export const insertRestaurantOrderSchema = createInsertSchema(restaurantOrdersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRestaurantOrder = z.infer<typeof insertRestaurantOrderSchema>;
export type RestaurantOrder = typeof restaurantOrdersTable.$inferSelect;
