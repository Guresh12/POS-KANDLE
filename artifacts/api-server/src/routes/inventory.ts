import { Router } from "express";
import { db } from "@workspace/db";
import { inventoryTable, inventoryTransactionsTable, productsTable, branchesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";

const router = Router();

router.get("/inventory", requireAuth, async (req, res) => {
  try {
    const { branchId, productId } = req.query;
    const conditions = [];
    if (branchId) conditions.push(eq(inventoryTable.branchId, Number(branchId)));
    if (productId) conditions.push(eq(inventoryTable.productId, Number(productId)));

    const rows = await db.select({
      productId: inventoryTable.productId,
      productName: productsTable.name,
      sku: productsTable.sku,
      branchId: inventoryTable.branchId,
      branchName: branchesTable.name,
      quantity: inventoryTable.quantity,
      reorderLevel: productsTable.reorderLevel,
      costPrice: productsTable.costPrice,
      updatedAt: inventoryTable.updatedAt,
    })
      .from(inventoryTable)
      .leftJoin(productsTable, eq(inventoryTable.productId, productsTable.id))
      .leftJoin(branchesTable, eq(inventoryTable.branchId, branchesTable.id))
      .where(conditions.length ? and(...conditions) : undefined);

    res.json(rows.map(r => ({
      ...r,
      quantity: Number(r.quantity),
      reorderLevel: Number(r.reorderLevel),
      costPrice: Number(r.costPrice),
      totalValue: Number(r.quantity) * Number(r.costPrice),
      updatedAt: r.updatedAt?.toISOString(),
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/inventory/transactions", requireAuth, async (req, res) => {
  try {
    const { branchId, productId, type, startDate, endDate } = req.query;
    const conditions = [];
    if (branchId) conditions.push(eq(inventoryTransactionsTable.branchId, Number(branchId)));
    if (productId) conditions.push(eq(inventoryTransactionsTable.productId, Number(productId)));
    if (type) conditions.push(sql`${inventoryTransactionsTable.type} = ${type}`);

    const rows = await db.select({
      id: inventoryTransactionsTable.id,
      productId: inventoryTransactionsTable.productId,
      productName: productsTable.name,
      branchId: inventoryTransactionsTable.branchId,
      branchName: branchesTable.name,
      type: inventoryTransactionsTable.type,
      quantityBefore: inventoryTransactionsTable.quantityBefore,
      quantityChanged: inventoryTransactionsTable.quantityChanged,
      quantityAfter: inventoryTransactionsTable.quantityAfter,
      reference: inventoryTransactionsTable.reference,
      notes: inventoryTransactionsTable.notes,
      createdAt: inventoryTransactionsTable.createdAt,
    })
      .from(inventoryTransactionsTable)
      .leftJoin(productsTable, eq(inventoryTransactionsTable.productId, productsTable.id))
      .leftJoin(branchesTable, eq(inventoryTransactionsTable.branchId, branchesTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(sql`${inventoryTransactionsTable.createdAt} DESC`)
      .limit(200);

    res.json(rows.map(r => ({
      ...r,
      quantityBefore: Number(r.quantityBefore),
      quantityChanged: Number(r.quantityChanged),
      quantityAfter: Number(r.quantityAfter),
      createdAt: r.createdAt?.toISOString(),
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/inventory/transactions", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { productId, branchId, type, quantityChanged, toBranchId, reference, notes } = req.body;
    if (!productId || !branchId || !type || quantityChanged === undefined) {
      return res.status(400).json({ error: "productId, branchId, type, quantityChanged required" });
    }

    let inv = await db.query.inventoryTable.findFirst({ where: and(eq(inventoryTable.productId, productId), eq(inventoryTable.branchId, branchId)) });
    const qBefore = Number(inv?.quantity ?? 0);
    const delta = ["stock_out", "transfer_out", "damaged"].includes(type) ? -Math.abs(quantityChanged) : Math.abs(quantityChanged);
    const qAfter = qBefore + delta;

    if (inv) {
      await db.update(inventoryTable).set({ quantity: String(qAfter) }).where(and(eq(inventoryTable.productId, productId), eq(inventoryTable.branchId, branchId)));
    } else {
      await db.insert(inventoryTable).values({ productId, branchId, quantity: String(qAfter) });
    }

    const [txn] = await db.insert(inventoryTransactionsTable).values({
      productId, branchId, type,
      quantityBefore: String(qBefore),
      quantityChanged: String(delta),
      quantityAfter: String(qAfter),
      reference, notes,
    }).returning();

    if (type === "transfer_out" && toBranchId) {
      let destInv = await db.query.inventoryTable.findFirst({ where: and(eq(inventoryTable.productId, productId), eq(inventoryTable.branchId, toBranchId)) });
      const destBefore = Number(destInv?.quantity ?? 0);
      const destAfter = destBefore + Math.abs(quantityChanged);
      if (destInv) {
        await db.update(inventoryTable).set({ quantity: String(destAfter) }).where(and(eq(inventoryTable.productId, productId), eq(inventoryTable.branchId, toBranchId)));
      } else {
        await db.insert(inventoryTable).values({ productId, branchId: toBranchId, quantity: String(destAfter) });
      }
      await db.insert(inventoryTransactionsTable).values({
        productId, branchId: toBranchId, type: "transfer_in",
        quantityBefore: String(destBefore),
        quantityChanged: String(Math.abs(quantityChanged)),
        quantityAfter: String(destAfter),
        reference, notes,
      });
    }

    res.status(201).json({
      ...txn,
      quantityBefore: Number(txn.quantityBefore),
      quantityChanged: Number(txn.quantityChanged),
      quantityAfter: Number(txn.quantityAfter),
      productName: "",
      branchName: "",
      createdAt: txn.createdAt?.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
