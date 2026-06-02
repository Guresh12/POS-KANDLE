import { Router } from "express";
import { db } from "@workspace/db";
import { customersTable, salesTable, salePaymentsTable } from "@workspace/db";
import { eq, ilike, sql, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import { journalCustomerPayment } from "../lib/journal-engine";

const router = Router();

router.get("/customers", requireAuth, async (req, res) => {
  try {
    const { search } = req.query;
    const rows = search
      ? await db.select().from(customersTable).where(ilike(customersTable.name, `%${search}%`)).orderBy(customersTable.name)
      : await db.select().from(customersTable).orderBy(customersTable.name);
    res.json(rows.map(c => ({ ...c, balance: Number(c.balance), createdAt: c.createdAt.toISOString() })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/customers", requireAuth, async (req, res) => {
  try {
    const { name, phone, email, address } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });
    const [customer] = await db.insert(customersTable).values({ name, phone, email, address }).returning();
    res.status(201).json({ ...customer, balance: Number(customer.balance), createdAt: customer.createdAt.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/customers/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const customer = await db.query.customersTable.findFirst({ where: eq(customersTable.id, id) });
    if (!customer) return res.status(404).json({ error: "Not found" });

    const sales = await db.select({
      id: salesTable.id,
      type: sql<string>`'sale'`,
      amount: salesTable.total,
      reference: salesTable.saleNumber,
      notes: sql<string | null>`null`,
      createdAt: salesTable.createdAt,
    }).from(salesTable).where(eq(salesTable.customerId, id)).orderBy(desc(salesTable.createdAt)).limit(50);

    const totalPurchases = sales.reduce((s, t) => s + Number(t.amount), 0);

    res.json({
      ...customer,
      balance: Number(customer.balance),
      totalPurchases,
      totalPaid: totalPurchases - Number(customer.balance),
      transactions: sales.map(s => ({ ...s, amount: Number(s.amount), createdAt: s.createdAt.toISOString() })),
      createdAt: customer.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/customers/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, phone, email, address } = req.body;
    const [updated] = await db.update(customersTable).set({ name, phone, email, address }).where(eq(customersTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, balance: Number(updated.balance), createdAt: updated.createdAt.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Record a payment from a customer against their outstanding credit balance
router.post("/customers/:id/payments", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { amount, method = "cash", notes } = req.body;
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "amount required" });

    const customer = await db.query.customersTable.findFirst({ where: eq(customersTable.id, id) });
    if (!customer) return res.status(404).json({ error: "Not found" });

    const paymentAmount = Math.min(Number(amount), Number(customer.balance));
    if (paymentAmount <= 0) return res.status(400).json({ error: "No outstanding balance" });

    const newBalance = Number(customer.balance) - paymentAmount;
    await db.update(customersTable).set({ balance: String(newBalance) }).where(eq(customersTable.id, id));

    // Journal: DR Cash/Bank, CR Accounts Receivable
    await journalCustomerPayment({
      customerId: id,
      customerName: customer.name,
      amount: paymentAmount,
      method,
      createdBy: (req as any).dbUser?.id,
    });

    res.status(201).json({ customerId: id, amount: paymentAmount, method, notes, newBalance, createdAt: new Date().toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/customers/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(customersTable).where(eq(customersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
