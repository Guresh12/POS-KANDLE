import { Router } from "express";
import { db } from "@workspace/db";
import { purchasesTable, purchaseItemsTable, purchasePaymentsTable, suppliersTable, productsTable, inventoryTable, inventoryTransactionsTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import { journalPurchaseReceived, journalSupplierPayment } from "../lib/journal-engine";

const router = Router();

function formatPurchase(p: any) {
  return { ...p, totalAmount: Number(p.totalAmount), paidAmount: Number(p.paidAmount), balanceDue: Number(p.totalAmount) - Number(p.paidAmount), createdAt: p.createdAt?.toISOString() };
}

router.get("/purchases", requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await db.select({
      id: purchasesTable.id,
      supplierId: purchasesTable.supplierId,
      supplierName: suppliersTable.name,
      branchId: purchasesTable.branchId,
      status: purchasesTable.status,
      totalAmount: purchasesTable.totalAmount,
      paidAmount: purchasesTable.paidAmount,
      invoiceNumber: purchasesTable.invoiceNumber,
      notes: purchasesTable.notes,
      createdAt: purchasesTable.createdAt,
    })
      .from(purchasesTable)
      .leftJoin(suppliersTable, eq(purchasesTable.supplierId, suppliersTable.id))
      .orderBy(desc(purchasesTable.createdAt));
    res.json(rows.map(formatPurchase));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/purchases", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { supplierId, branchId, invoiceNumber, notes, items } = req.body;
    if (!supplierId || !items?.length) return res.status(400).json({ error: "supplierId and items required" });

    const totalAmount = items.reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unitCost), 0);
    const [purchase] = await db.insert(purchasesTable).values({ supplierId, branchId, invoiceNumber, notes, totalAmount: String(totalAmount), status: "pending" }).returning();

    await db.insert(purchaseItemsTable).values(items.map((i: any) => ({
      purchaseId: purchase.id,
      productId: i.productId,
      quantity: String(i.quantity),
      unitCost: String(i.unitCost),
      total: String(Number(i.quantity) * Number(i.unitCost)),
    })));

    const supplier = await db.query.suppliersTable.findFirst({ where: eq(suppliersTable.id, supplierId) });
    if (supplier) {
      await db.update(suppliersTable).set({ balance: String(Number(supplier.balance) + totalAmount) }).where(eq(suppliersTable.id, supplierId));
    }

    res.status(201).json(formatPurchase({ ...purchase, supplierName: supplier?.name ?? "", balanceDue: totalAmount }));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/purchases/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [purchase] = await db.select({
      id: purchasesTable.id,
      supplierId: purchasesTable.supplierId,
      supplierName: suppliersTable.name,
      branchId: purchasesTable.branchId,
      status: purchasesTable.status,
      totalAmount: purchasesTable.totalAmount,
      paidAmount: purchasesTable.paidAmount,
      invoiceNumber: purchasesTable.invoiceNumber,
      notes: purchasesTable.notes,
      createdAt: purchasesTable.createdAt,
    }).from(purchasesTable).leftJoin(suppliersTable, eq(purchasesTable.supplierId, suppliersTable.id)).where(eq(purchasesTable.id, id));
    if (!purchase) return res.status(404).json({ error: "Not found" });

    const items = await db.select({
      id: purchaseItemsTable.id,
      productId: purchaseItemsTable.productId,
      productName: productsTable.name,
      quantity: purchaseItemsTable.quantity,
      unitCost: purchaseItemsTable.unitCost,
      total: purchaseItemsTable.total,
    }).from(purchaseItemsTable).leftJoin(productsTable, eq(purchaseItemsTable.productId, productsTable.id)).where(eq(purchaseItemsTable.purchaseId, id));

    const payments = await db.select().from(purchasePaymentsTable).where(eq(purchasePaymentsTable.purchaseId, id)).orderBy(desc(purchasePaymentsTable.createdAt));

    res.json({
      ...formatPurchase(purchase),
      items: items.map(i => ({ ...i, quantity: Number(i.quantity), unitCost: Number(i.unitCost), total: Number(i.total) })),
      payments: payments.map(p => ({ ...p, amount: Number(p.amount), createdAt: p.createdAt?.toISOString() })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/purchases/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { invoiceNumber, notes, status } = req.body;
    const [updated] = await db.update(purchasesTable).set({ invoiceNumber, notes, status }).where(eq(purchasesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    const supplier = await db.query.suppliersTable.findFirst({ where: eq(suppliersTable.id, updated.supplierId) });
    res.json(formatPurchase({ ...updated, supplierName: supplier?.name ?? "" }));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/purchases/:id/receive", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const purchase = await db.query.purchasesTable.findFirst({ where: eq(purchasesTable.id, id) });
    if (!purchase) return res.status(404).json({ error: "Not found" });
    if (purchase.status === "received" || purchase.status === "paid") return res.status(400).json({ error: "Already received" });

    const items = await db.select().from(purchaseItemsTable).where(eq(purchaseItemsTable.purchaseId, id));
    const branchId = purchase.branchId ?? 1;
    for (const item of items) {
      let inv = await db.query.inventoryTable.findFirst({ where: and(eq(inventoryTable.productId, item.productId), eq(inventoryTable.branchId, branchId)) });
      const qBefore = Number(inv?.quantity ?? 0);
      const qAfter = qBefore + Number(item.quantity);
      if (inv) {
        await db.update(inventoryTable).set({ quantity: String(qAfter) }).where(and(eq(inventoryTable.productId, item.productId), eq(inventoryTable.branchId, branchId)));
      } else {
        await db.insert(inventoryTable).values({ productId: item.productId, branchId, quantity: String(qAfter) });
      }
      await db.insert(inventoryTransactionsTable).values({
        productId: item.productId, branchId, type: "purchase",
        quantityBefore: String(qBefore), quantityChanged: item.quantity, quantityAfter: String(qAfter),
        reference: `PO-${id}`,
      });
    }

    const newStatus = Number(purchase.paidAmount) >= Number(purchase.totalAmount) ? "paid" : "received";
    const [updated] = await db.update(purchasesTable).set({ status: newStatus }).where(eq(purchasesTable.id, id)).returning();
    const supplier = await db.query.suppliersTable.findFirst({ where: eq(suppliersTable.id, updated.supplierId) });

    // Journal: DR Inventory, CR Accounts Payable
    journalPurchaseReceived({
      purchaseId: id,
      purchaseRef: `PO-${id}`,
      totalAmount: Number(purchase.totalAmount),
      branchId: purchase.branchId ?? undefined,
      createdBy: (req as any).dbUser?.id,
    });

    res.json(formatPurchase({ ...updated, supplierName: supplier?.name ?? "" }));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/purchases/:id/payments", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { amount, method, reference, notes } = req.body;
    if (!amount || !method) return res.status(400).json({ error: "amount and method required" });

    const [payment] = await db.insert(purchasePaymentsTable).values({ purchaseId: id, amount: String(amount), method, reference, notes }).returning();

    const purchase = await db.query.purchasesTable.findFirst({ where: eq(purchasesTable.id, id) });
    if (purchase) {
      const newPaid = Number(purchase.paidAmount) + Number(amount);
      const newStatus = newPaid >= Number(purchase.totalAmount) ? "paid" : "partial";
      await db.update(purchasesTable).set({ paidAmount: String(newPaid), status: newStatus }).where(eq(purchasesTable.id, id));
      await db.update(suppliersTable).set({ balance: sql`balance::numeric - ${amount}` }).where(eq(suppliersTable.id, purchase.supplierId));
    }

    // Journal: DR Accounts Payable, CR Cash/Bank
    journalSupplierPayment({
      purchaseId: id,
      purchaseRef: `PO-${id}`,
      amount: Number(amount),
      method,
      branchId: (await db.query.purchasesTable.findFirst({ where: eq(purchasesTable.id, id) }))?.branchId ?? undefined,
      createdBy: (req as any).dbUser?.id,
    });

    res.status(201).json({ ...payment, amount: Number(payment.amount), createdAt: payment.createdAt?.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
