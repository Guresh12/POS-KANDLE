import { Router } from "express";
import { db } from "@workspace/db";
import { salesTable, expensesTable, inventoryTable, customersTable, suppliersTable, branchesTable, productsTable, saleItemsTable } from "@workspace/db";
import { eq, sql, and, gte, lte } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";

const router = Router();

function execRows(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

router.get("/reports/sales", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { period, startDate, endDate, branchId, groupBy } = req.query;
    const conditions: any[] = [sql`${salesTable.status} = 'completed'`];
    const now = new Date();
    if (period === "today") conditions.push(gte(salesTable.createdAt, new Date(now.getFullYear(), now.getMonth(), now.getDate())));
    else if (period === "week") { const w = new Date(now); w.setDate(now.getDate() - 7); conditions.push(gte(salesTable.createdAt, w)); }
    else if (period === "month") conditions.push(gte(salesTable.createdAt, new Date(now.getFullYear(), now.getMonth(), 1)));
    if (startDate) conditions.push(gte(salesTable.createdAt, new Date(String(startDate))));
    if (endDate) conditions.push(lte(salesTable.createdAt, new Date(String(endDate))));
    if (branchId) conditions.push(eq(salesTable.branchId, Number(branchId)));

    const [agg] = await db.select({
      count: sql<number>`count(*)`,
      revenue: sql<number>`coalesce(sum(total::numeric), 0)`,
    }).from(salesTable).where(and(...conditions));

    let data: any[] = [];
    if (groupBy === "product") {
      const r = await db.execute(sql`
        SELECT p.name as label, SUM(si.quantity::numeric) as quantity, SUM(si.total::numeric) as revenue
        FROM sale_items si JOIN sales s ON si.sale_id = s.id JOIN products p ON si.product_id = p.id
        WHERE s.status = 'completed'
        GROUP BY p.name ORDER BY revenue DESC LIMIT 20
      `);
      data = execRows(r).map((d: any) => ({ ...d, quantity: Number(d.quantity), revenue: Number(d.revenue) }));
    } else {
      const r = await db.execute(sql`
        SELECT DATE(created_at) as date, COUNT(*) as sales, SUM(total::numeric) as revenue
        FROM sales WHERE status = 'completed' GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 60
      `);
      data = execRows(r).map((d: any) => ({ date: String(d.date), sales: Number(d.sales), revenue: Number(d.revenue) }));
    }

    res.json({ period: String(period ?? "custom"), totalSales: Number(agg?.count ?? 0), totalRevenue: Number(agg?.revenue ?? 0), data });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/reports/inventory", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { branchId, type } = req.query;
    const conds = branchId ? `AND i.branch_id = ${Number(branchId)}` : "";
    const r = await db.execute(sql`
      SELECT p.id, p.name, p.sku, COALESCE(SUM(i.quantity::numeric), 0) as quantity,
             p.cost_price::numeric as cost_price, p.reorder_level::numeric as reorder_level,
             COALESCE(SUM(i.quantity::numeric), 0) * p.cost_price::numeric as total_value
      FROM products p LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.is_active = true GROUP BY p.id, p.name, p.sku, p.cost_price, p.reorder_level
      ORDER BY p.name
    `);
    const rows = execRows(r);
    const totalValue = rows.reduce((s: number, row: any) => s + Number(row.total_value), 0);
    res.json({
      type: String(type ?? "levels"),
      totalValue,
      data: rows.map((row: any) => ({
        id: row.id, name: row.name, sku: row.sku,
        quantity: Number(row.quantity), costPrice: Number(row.cost_price), reorderLevel: Number(row.reorder_level), totalValue: Number(row.total_value),
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/reports/profit-loss", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const salesConds: any[] = [sql`${salesTable.status} = 'completed'`];
    if (startDate) salesConds.push(gte(salesTable.createdAt, new Date(String(startDate))));
    if (endDate) salesConds.push(lte(salesTable.createdAt, new Date(String(endDate))));

    const [rev] = await db.select({ revenue: sql<number>`coalesce(sum(total::numeric), 0)` })
      .from(salesTable).where(and(...salesConds));

    const cogResult = await db.execute(sql`
      SELECT COALESCE(SUM(si.quantity::numeric * p.cost_price::numeric), 0) as cog
      FROM sale_items si JOIN sales s ON si.sale_id = s.id JOIN products p ON si.product_id = p.id
      WHERE s.status = 'completed'
    `);
    const [cost] = execRows(cogResult);

    const expConds: any[] = [];
    if (startDate) expConds.push(gte(expensesTable.date, String(startDate)));
    if (endDate) expConds.push(lte(expensesTable.date, String(endDate)));
    const [exp] = await db.select({ total: sql<number>`coalesce(sum(amount::numeric), 0)` })
      .from(expensesTable).where(expConds.length ? and(...expConds) : undefined);

    const revenue = Number(rev?.revenue ?? 0);
    const cog = Number(cost?.cog ?? 0);
    const expenses = Number(exp?.total ?? 0);
    const grossProfit = revenue - cog;
    const netProfit = grossProfit - expenses;

    res.json({
      revenue, costOfGoods: cog, grossProfit,
      grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
      expenses, netProfit,
      netMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/reports/debtors", requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await db.execute(sql`
      SELECT c.id as "customerId", c.name as "customerName", c.phone, c.balance::numeric as balance,
             (SELECT MAX(created_at) FROM sales WHERE customer_id = c.id) as "lastTransactionDate"
      FROM customers c WHERE c.balance::numeric > 0 ORDER BY balance DESC
    `);
    res.json(execRows(r).map((row: any) => ({ ...row, balance: Number(row.balance), lastTransactionDate: row.lastTransactionDate ? new Date(row.lastTransactionDate).toISOString() : null })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/reports/creditors", requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await db.execute(sql`
      SELECT s.id as "supplierId", s.name as "supplierName", s.phone, s.balance::numeric as balance,
             (SELECT MAX(created_at) FROM purchases WHERE supplier_id = s.id) as "lastTransactionDate"
      FROM suppliers s WHERE s.balance::numeric > 0 ORDER BY balance DESC
    `);
    res.json(execRows(r).map((row: any) => ({ ...row, balance: Number(row.balance), lastTransactionDate: row.lastTransactionDate ? new Date(row.lastTransactionDate).toISOString() : null })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
