import { Router } from "express";
import { db } from "@workspace/db";
import { suppliersTable, purchasesTable } from "@workspace/db";
import { eq, ilike, sql, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";

const router = Router();

router.get("/suppliers", requireAuth, async (req, res) => {
  try {
    const { search } = req.query;
    const rows = search
      ? await db.select().from(suppliersTable).where(ilike(suppliersTable.name, `%${search}%`)).orderBy(suppliersTable.name)
      : await db.select().from(suppliersTable).orderBy(suppliersTable.name);
    res.json(rows.map(s => ({ ...s, balance: Number(s.balance), createdAt: s.createdAt.toISOString() })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/suppliers", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, phone, email, address } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });
    const [supplier] = await db.insert(suppliersTable).values({ name, phone, email, address }).returning();
    res.status(201).json({ ...supplier, balance: Number(supplier.balance), createdAt: supplier.createdAt.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/suppliers/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const supplier = await db.query.suppliersTable.findFirst({ where: eq(suppliersTable.id, id) });
    if (!supplier) return res.status(404).json({ error: "Not found" });

    const purchases = await db.select({
      id: purchasesTable.id,
      type: sql<string>`'purchase'`,
      amount: purchasesTable.totalAmount,
      reference: purchasesTable.invoiceNumber,
      notes: purchasesTable.notes,
      createdAt: purchasesTable.createdAt,
    }).from(purchasesTable).where(eq(purchasesTable.supplierId, id)).orderBy(desc(purchasesTable.createdAt)).limit(50);

    const totalPurchases = purchases.reduce((s, t) => s + Number(t.amount), 0);

    res.json({
      ...supplier,
      balance: Number(supplier.balance),
      totalPurchases,
      totalPaid: totalPurchases - Number(supplier.balance),
      transactions: purchases.map(p => ({ ...p, amount: Number(p.amount), createdAt: p.createdAt.toISOString() })),
      createdAt: supplier.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/suppliers/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, phone, email, address } = req.body;
    const [updated] = await db.update(suppliersTable).set({ name, phone, email, address }).where(eq(suppliersTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, balance: Number(updated.balance), createdAt: updated.createdAt.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/suppliers/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(suppliersTable).where(eq(suppliersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
