import { Router } from "express";
import { db } from "@workspace/db";
import { expensesTable, expenseCategoriesTable } from "@workspace/db";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import { journalExpense } from "../lib/journal-engine";

const router = Router();

router.get("/expenses", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, categoryId } = req.query;
    const conditions: any[] = [];
    if (startDate) conditions.push(gte(expensesTable.date, String(startDate)));
    if (endDate) conditions.push(lte(expensesTable.date, String(endDate)));
    if (categoryId) conditions.push(eq(expensesTable.categoryId, Number(categoryId)));

    const rows = await db.select({
      id: expensesTable.id, categoryId: expensesTable.categoryId, categoryName: expenseCategoriesTable.name,
      branchId: expensesTable.branchId, amount: expensesTable.amount, description: expensesTable.description,
      date: expensesTable.date, reference: expensesTable.reference, status: expensesTable.status, createdAt: expensesTable.createdAt,
    }).from(expensesTable).leftJoin(expenseCategoriesTable, eq(expensesTable.categoryId, expenseCategoriesTable.id))
      .where(conditions.length ? and(...conditions) : undefined).orderBy(desc(expensesTable.createdAt));

    res.json(rows.map(e => ({ ...e, amount: Number(e.amount), createdAt: e.createdAt.toISOString() })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/expenses", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { categoryId, branchId, amount, description, date, reference } = req.body;
    if (!amount || !description || !date) return res.status(400).json({ error: "amount, description, date required" });
    const [expense] = await db.insert(expensesTable).values({ categoryId, branchId, amount: String(amount), description, date, reference }).returning();
    const cat = categoryId ? await db.query.expenseCategoriesTable.findFirst({ where: eq(expenseCategoriesTable.id, categoryId) }) : null;

    // Journal: DR Expense Account, CR Cash/Bank
    journalExpense({
      expenseId: expense.id,
      description,
      amount: Number(amount),
      categoryName: cat?.name,
      paymentMethod: (req.body.paymentMethod as string | undefined) ?? "cash",
      branchId: branchId ? Number(branchId) : undefined,
      createdBy: (req as any).dbUser?.id,
    });

    res.status(201).json({ ...expense, amount: Number(expense.amount), categoryName: cat?.name, createdAt: expense.createdAt.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/expenses/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { categoryId, branchId, amount, description, date, reference } = req.body;
    const update: any = { categoryId, branchId, description, date, reference };
    if (amount !== undefined) update.amount = String(amount);
    const [updated] = await db.update(expensesTable).set(update).where(eq(expensesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, amount: Number(updated.amount), createdAt: updated.createdAt.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/expenses/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(expensesTable).where(eq(expensesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/expense-categories", requireAuth, async (req, res) => {
  try {
    const cats = await db.select().from(expenseCategoriesTable).orderBy(expenseCategoriesTable.name);
    res.json(cats);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/expense-categories", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });
    const [cat] = await db.insert(expenseCategoriesTable).values({ name, description }).returning();
    res.status(201).json(cat);
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
