import { Router } from "express";
import { db } from "@workspace/db";
import { salesTable, saleItemsTable, expensesTable, customersTable, suppliersTable, productsTable, inventoryTable, categoriesTable } from "@workspace/db";
import { sql, desc, gte, and, lt, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.get("/dashboard/summary", requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart); weekStart.setDate(todayStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const todaySalesRows = await db.select({
      count: sql<number>`count(*)`,
      revenue: sql<number>`coalesce(sum(total::numeric), 0)`,
    }).from(salesTable).where(and(gte(salesTable.createdAt, todayStart), sql`status = 'completed'`));

    const weekSalesRows = await db.select({
      count: sql<number>`count(*)`,
      revenue: sql<number>`coalesce(sum(total::numeric), 0)`,
    }).from(salesTable).where(and(gte(salesTable.createdAt, weekStart), sql`status = 'completed'`));

    const monthSalesRows = await db.select({
      count: sql<number>`count(*)`,
      revenue: sql<number>`coalesce(sum(total::numeric), 0)`,
    }).from(salesTable).where(and(gte(salesTable.createdAt, monthStart), sql`status = 'completed'`));

    const allSalesRows = await db.select({
      revenue: sql<number>`coalesce(sum(total::numeric), 0)`,
    }).from(salesTable).where(sql`status = 'completed'`);

    const costRows = await db.select({
      cost: sql<number>`coalesce(sum(${saleItemsTable.quantity}::numeric * ${productsTable.costPrice}::numeric), 0)`,
    }).from(saleItemsTable).leftJoin(productsTable, eq(saleItemsTable.productId, productsTable.id));

    const expenseRows = await db.select({
      total: sql<number>`coalesce(sum(amount::numeric), 0)`,
    }).from(expensesTable);

    const debtorRows = await db.select({
      total: sql<number>`coalesce(sum(balance::numeric), 0)`,
    }).from(customersTable).where(sql`balance::numeric > 0`);

    const creditorRows = await db.select({
      total: sql<number>`coalesce(sum(balance::numeric), 0)`,
    }).from(suppliersTable).where(sql`balance::numeric > 0`);

    const revenue = Number(allSalesRows[0]?.revenue ?? 0);
    const cost = Number(costRows[0]?.cost ?? 0);
    const expenses = Number(expenseRows[0]?.total ?? 0);

    res.json({
      todaySales: Number(todaySalesRows[0]?.count ?? 0),
      todayRevenue: Number(todaySalesRows[0]?.revenue ?? 0),
      weekSales: Number(weekSalesRows[0]?.count ?? 0),
      weekRevenue: Number(weekSalesRows[0]?.revenue ?? 0),
      monthSales: Number(monthSalesRows[0]?.count ?? 0),
      monthRevenue: Number(monthSalesRows[0]?.revenue ?? 0),
      totalRevenue: revenue,
      totalProfit: revenue - cost - expenses,
      totalExpenses: expenses,
      outstandingDebtors: Number(debtorRows[0]?.total ?? 0),
      outstandingCreditors: Number(creditorRows[0]?.total ?? 0),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/top-products", requireAuth, async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 10);
    const rows = await db.select({
      productId: saleItemsTable.productId,
      productName: productsTable.name,
      sku: productsTable.sku,
      totalQuantity: sql<number>`sum(sale_items.quantity::numeric)`,
      totalRevenue: sql<number>`sum(sale_items.total::numeric)`,
    })
      .from(saleItemsTable)
      .leftJoin(productsTable, sql`sale_items.product_id = products.id`)
      .leftJoin(salesTable, sql`sale_items.sale_id = sales.id`)
      .where(sql`sales.status = 'completed'`)
      .groupBy(saleItemsTable.productId, productsTable.name, productsTable.sku)
      .orderBy(desc(sql`sum(sale_items.total::numeric)`))
      .limit(limit);
    res.json(rows.map(r => ({ ...r, totalQuantity: Number(r.totalQuantity), totalRevenue: Number(r.totalRevenue) })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/recent-transactions", requireAuth, async (req, res) => {
  try {
    const limit = Number(req.query.limit ?? 10);
    const rows = await db.select({
      id: salesTable.id,
      saleNumber: salesTable.saleNumber,
      customerName: customersTable.name,
      total: salesTable.total,
      status: salesTable.status,
      createdAt: salesTable.createdAt,
    })
      .from(salesTable)
      .leftJoin(customersTable, sql`sales.customer_id = customers.id`)
      .orderBy(desc(salesTable.createdAt))
      .limit(limit);

    const paymentRows = await db.execute(
      sql`SELECT sale_id, method FROM sale_payments sp WHERE sp.id = (SELECT id FROM sale_payments WHERE sale_id = sp.sale_id ORDER BY created_at LIMIT 1)`
    );

    res.json(rows.map(r => ({
      id: r.id,
      saleNumber: r.saleNumber,
      customerName: r.customerName ?? "Walk-in",
      total: Number(r.total),
      paymentMethod: "cash",
      status: r.status,
      createdAt: r.createdAt?.toISOString(),
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/low-stock", requireAuth, async (req, res) => {
  try {
    const rows = await db.execute(sql`
      SELECT p.id as "productId", p.name as "productName", p.sku,
             COALESCE(SUM(i.quantity::numeric), 0) as "currentStock",
             p.reorder_level::numeric as "reorderLevel",
             NULL as "branchName"
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.is_active = true
      GROUP BY p.id, p.name, p.sku, p.reorder_level
      HAVING COALESCE(SUM(i.quantity::numeric), 0) <= p.reorder_level::numeric
      ORDER BY (COALESCE(SUM(i.quantity::numeric), 0) - p.reorder_level::numeric) ASC
    `);
    res.json(((rows as any).rows as any[]).map(r => ({
      productId: r.productId,
      productName: r.productName,
      sku: r.sku,
      currentStock: Number(r.currentStock),
      reorderLevel: Number(r.reorderLevel),
      branchName: r.branchName,
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
