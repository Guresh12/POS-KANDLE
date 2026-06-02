import { Router } from "express";
import { db } from "@workspace/db";
import { restaurantTablesTable, restaurantOrdersTable, restaurantOrderItemsTable, productsTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";

const router = Router();

router.get("/restaurant/tables", requireAuth, async (req, res) => {
  try {
    const tables = await db.select().from(restaurantTablesTable).orderBy(restaurantTablesTable.name);
    res.json(tables.map(t => ({ ...t, createdAt: t.createdAt?.toISOString() })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/restaurant/tables", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, capacity } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });
    const [table] = await db.insert(restaurantTablesTable).values({ name, capacity: capacity ?? 4 }).returning();
    res.status(201).json({ ...table, createdAt: table.createdAt?.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/restaurant/tables/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, capacity, status } = req.body;
    const [updated] = await db.update(restaurantTablesTable).set({ name, capacity, status }).where(eq(restaurantTablesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, createdAt: updated.createdAt?.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/restaurant/orders", requireAuth, async (req, res) => {
  try {
    const { status, tableId } = req.query;
    const conditions: any[] = [];
    if (status) conditions.push(sql`${restaurantOrdersTable.status} = ${status}`);
    if (tableId) conditions.push(eq(restaurantOrdersTable.tableId, Number(tableId)));

    const orders = await db.select().from(restaurantOrdersTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(restaurantOrdersTable.createdAt));

    const result = await Promise.all(orders.map(async (o) => {
      const items = await db.select({
        id: restaurantOrderItemsTable.id,
        productId: restaurantOrderItemsTable.productId,
        productName: productsTable.name,
        quantity: restaurantOrderItemsTable.quantity,
        unitPrice: restaurantOrderItemsTable.unitPrice,
        notes: restaurantOrderItemsTable.notes,
        status: restaurantOrderItemsTable.status,
      }).from(restaurantOrderItemsTable).leftJoin(productsTable, eq(restaurantOrderItemsTable.productId, productsTable.id)).where(eq(restaurantOrderItemsTable.orderId, o.id));

      const table = o.tableId ? await db.query.restaurantTablesTable.findFirst({ where: eq(restaurantTablesTable.id, o.tableId) }) : null;
      return {
        ...o, tableName: table?.name,
        items: items.map(i => ({ ...i, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })),
        total: Number(o.total),
        createdAt: o.createdAt?.toISOString(),
        kitchenSentAt: o.kitchenSentAt?.toISOString() ?? null,
      };
    }));

    res.json(result);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/restaurant/orders", requireAuth, async (req, res) => {
  try {
    const { tableId, orderType, notes, items } = req.body;
    if (!orderType || !items?.length) return res.status(400).json({ error: "orderType and items required" });

    const total = items.reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unitPrice), 0);
    const [order] = await db.insert(restaurantOrdersTable).values({ tableId, orderType, notes, total: String(total), status: "pending" }).returning();

    await db.insert(restaurantOrderItemsTable).values(items.map((i: any) => ({
      orderId: order.id, productId: i.productId,
      quantity: String(i.quantity), unitPrice: String(i.unitPrice), notes: i.notes,
    })));

    if (tableId) {
      await db.update(restaurantTablesTable).set({ status: "occupied", currentOrderId: order.id }).where(eq(restaurantTablesTable.id, tableId));
    }

    res.status(201).json({ ...order, total: Number(order.total), items, createdAt: order.createdAt?.toISOString(), kitchenSentAt: null });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/restaurant/orders/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const order = await db.query.restaurantOrdersTable.findFirst({ where: eq(restaurantOrdersTable.id, id) });
    if (!order) return res.status(404).json({ error: "Not found" });

    const items = await db.select({
      id: restaurantOrderItemsTable.id, productId: restaurantOrderItemsTable.productId,
      productName: productsTable.name, quantity: restaurantOrderItemsTable.quantity,
      unitPrice: restaurantOrderItemsTable.unitPrice, notes: restaurantOrderItemsTable.notes,
      status: restaurantOrderItemsTable.status,
    }).from(restaurantOrderItemsTable).leftJoin(productsTable, eq(restaurantOrderItemsTable.productId, productsTable.id)).where(eq(restaurantOrderItemsTable.orderId, id));

    const table = order.tableId ? await db.query.restaurantTablesTable.findFirst({ where: eq(restaurantTablesTable.id, order.tableId) }) : null;

    res.json({
      ...order, tableName: table?.name, total: Number(order.total),
      items: items.map(i => ({ ...i, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })),
      createdAt: order.createdAt?.toISOString(), kitchenSentAt: order.kitchenSentAt?.toISOString() ?? null,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/restaurant/orders/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, sendToKitchen, notes } = req.body;
    const update: any = { status, notes };
    if (sendToKitchen) update.kitchenSentAt = new Date();
    if (status === "completed" || status === "served") {
      const order = await db.query.restaurantOrdersTable.findFirst({ where: eq(restaurantOrdersTable.id, id) });
      if (order?.tableId) {
        await db.update(restaurantTablesTable).set({ status: "available", currentOrderId: null }).where(eq(restaurantTablesTable.id, order.tableId));
      }
    }
    const [updated] = await db.update(restaurantOrdersTable).set(update).where(eq(restaurantOrdersTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, total: Number(updated.total), items: [], createdAt: updated.createdAt?.toISOString(), kitchenSentAt: updated.kitchenSentAt?.toISOString() ?? null });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
