import { Router } from "express";
import { db } from "@workspace/db";
import { salesTable, saleItemsTable, salePaymentsTable, customersTable, branchesTable, productsTable, inventoryTable, inventoryTransactionsTable } from "@workspace/db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { journalSale } from "../lib/journal-engine";

const router = Router();

function formatSale(s: any) {
  return { ...s, subtotal: Number(s.subtotal), taxAmount: Number(s.taxAmount), discountAmount: Number(s.discountAmount), total: Number(s.total), paidAmount: Number(s.paidAmount), changeAmount: Number(s.changeAmount), createdAt: s.createdAt?.toISOString() };
}

router.get("/sales", requireAuth, async (req, res) => {
  try {
    const { branchId, customerId, status, startDate, endDate } = req.query;
    const conditions: any[] = [];
    if (branchId) conditions.push(eq(salesTable.branchId, Number(branchId)));
    if (customerId) conditions.push(eq(salesTable.customerId, Number(customerId)));
    if (status) conditions.push(sql`${salesTable.status} = ${status}`);
    if (startDate) conditions.push(gte(salesTable.createdAt, new Date(String(startDate))));
    if (endDate) conditions.push(lte(salesTable.createdAt, new Date(String(endDate))));

    const rows = await db.select({
      id: salesTable.id,
      saleNumber: salesTable.saleNumber,
      branchId: salesTable.branchId,
      branchName: branchesTable.name,
      customerId: salesTable.customerId,
      customerName: customersTable.name,
      status: salesTable.status,
      subtotal: salesTable.subtotal,
      taxAmount: salesTable.taxAmount,
      discountAmount: salesTable.discountAmount,
      total: salesTable.total,
      paidAmount: salesTable.paidAmount,
      changeAmount: salesTable.changeAmount,
      notes: salesTable.notes,
      createdAt: salesTable.createdAt,
    })
      .from(salesTable)
      .leftJoin(branchesTable, eq(salesTable.branchId, branchesTable.id))
      .leftJoin(customersTable, eq(salesTable.customerId, customersTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(salesTable.createdAt))
      .limit(200);

    res.json(rows.map(formatSale));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/sales/held", requireAuth, async (req, res) => {
  try {
    const rows = await db.select({
      id: salesTable.id, saleNumber: salesTable.saleNumber, branchId: salesTable.branchId, branchName: branchesTable.name,
      customerId: salesTable.customerId, customerName: customersTable.name, status: salesTable.status,
      subtotal: salesTable.subtotal, taxAmount: salesTable.taxAmount, discountAmount: salesTable.discountAmount,
      total: salesTable.total, paidAmount: salesTable.paidAmount, changeAmount: salesTable.changeAmount,
      notes: salesTable.notes, createdAt: salesTable.createdAt,
    })
      .from(salesTable)
      .leftJoin(branchesTable, eq(salesTable.branchId, branchesTable.id))
      .leftJoin(customersTable, eq(salesTable.customerId, customersTable.id))
      .where(sql`${salesTable.status} = 'held'`)
      .orderBy(desc(salesTable.createdAt));
    res.json(rows.map(formatSale));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/sales/summary", requireAuth, async (req, res) => {
  try {
    const { period, startDate, endDate, branchId } = req.query;
    const conditions: any[] = [sql`${salesTable.status} = 'completed'`];
    const now = new Date();
    if (period === "today") conditions.push(gte(salesTable.createdAt, new Date(now.getFullYear(), now.getMonth(), now.getDate())));
    else if (period === "week") { const w = new Date(now); w.setDate(now.getDate() - 7); conditions.push(gte(salesTable.createdAt, w)); }
    else if (period === "month") conditions.push(gte(salesTable.createdAt, new Date(now.getFullYear(), now.getMonth(), 1)));
    if (startDate) conditions.push(gte(salesTable.createdAt, new Date(String(startDate))));
    if (endDate) conditions.push(lte(salesTable.createdAt, new Date(String(endDate))));
    if (branchId) conditions.push(eq(salesTable.branchId, Number(branchId)));

    const [agg] = await db.select({
      totalSales: sql<number>`count(*)`,
      totalRevenue: sql<number>`coalesce(sum(total::numeric), 0)`,
      totalTax: sql<number>`coalesce(sum(tax_amount::numeric), 0)`,
      totalDiscount: sql<number>`coalesce(sum(discount_amount::numeric), 0)`,
    }).from(salesTable).where(and(...conditions));

    const daily = await db.execute(sql`
      SELECT DATE(created_at) as date, COUNT(*) as sales, SUM(total::numeric) as revenue
      FROM sales WHERE status = 'completed'
      GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30
    `);

    const avg = Number(agg?.totalSales ?? 0) > 0 ? Number(agg?.totalRevenue ?? 0) / Number(agg?.totalSales ?? 1) : 0;

    res.json({
      totalSales: Number(agg?.totalSales ?? 0),
      totalRevenue: Number(agg?.totalRevenue ?? 0),
      totalTax: Number(agg?.totalTax ?? 0),
      totalDiscount: Number(agg?.totalDiscount ?? 0),
      averageOrderValue: avg,
      topPaymentMethod: "cash",
      dailyBreakdown: ((daily as any).rows as any[]).map(d => ({ date: String(d.date), sales: Number(d.sales), revenue: Number(d.revenue) })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/sales", requireAuth, async (req, res) => {
  try {
    const { branchId, customerId, discountAmount, notes, status, items, payments } = req.body;
    if (!branchId || !items?.length) return res.status(400).json({ error: "branchId and items required" });

    const saleNumber = `SALE-${Date.now()}`;
    let subtotal = 0, taxAmount = 0;
    const itemsWithTax = [];
    for (const item of items) {
      const product = await db.query.productsTable.findFirst({ where: eq(productsTable.id, item.productId) });
      const lineSubtotal = Number(item.quantity) * Number(item.unitPrice) - Number(item.discountAmount ?? 0);
      const lineTax = lineSubtotal * (Number(product?.taxRate ?? 0) / 100);
      const lineTotal = lineSubtotal + lineTax;
      subtotal += lineSubtotal;
      taxAmount += lineTax;
      // Capture costPrice for COGS journal entry
      itemsWithTax.push({ ...item, taxAmount: lineTax, total: lineTotal, costPrice: Number(product?.costPrice ?? 0) });
    }
    const disc = Number(discountAmount ?? 0);
    const total = subtotal + taxAmount - disc;
    const paidAmount = (payments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);
    const changeAmount = Math.max(0, paidAmount - total);

    const [sale] = await db.insert(salesTable).values({
      saleNumber, branchId, customerId, discountAmount: String(disc), notes,
      status: status ?? "completed",
      subtotal: String(subtotal), taxAmount: String(taxAmount), total: String(total),
      paidAmount: String(paidAmount), changeAmount: String(changeAmount),
    }).returning();

    const insertedItems = await db.insert(saleItemsTable).values(itemsWithTax.map((i: any) => ({
      saleId: sale.id, productId: i.productId,
      quantity: String(i.quantity), unitPrice: String(i.unitPrice),
      discountAmount: String(i.discountAmount ?? 0), taxAmount: String(i.taxAmount), total: String(i.total),
    }))).returning();

    if (payments?.length) {
      await db.insert(salePaymentsTable).values(payments.map((p: any) => ({ saleId: sale.id, amount: String(p.amount), method: p.method, reference: p.reference, notes: p.notes })));
    }

    if ((status ?? "completed") === "completed") {
      for (const item of itemsWithTax) {
        let inv = await db.query.inventoryTable.findFirst({ where: and(eq(inventoryTable.productId, item.productId), eq(inventoryTable.branchId, branchId)) });
        const qBefore = Number(inv?.quantity ?? 0);
        const qAfter = Math.max(0, qBefore - Number(item.quantity));
        if (inv) {
          await db.update(inventoryTable).set({ quantity: String(qAfter) }).where(and(eq(inventoryTable.productId, item.productId), eq(inventoryTable.branchId, branchId)));
        }
        await db.insert(inventoryTransactionsTable).values({
          productId: item.productId, branchId, type: "sale",
          quantityBefore: String(qBefore), quantityChanged: String(-Number(item.quantity)), quantityAfter: String(qAfter),
          reference: saleNumber,
        });
      }
      if (customerId) {
        const creditPayment = payments?.find((p: any) => p.method === "credit");
        if (creditPayment) {
          const customer = await db.query.customersTable.findFirst({ where: eq(customersTable.id, customerId) });
          if (customer) {
            await db.update(customersTable).set({ balance: String(Number(customer.balance) + Number(creditPayment.amount)) }).where(eq(customersTable.id, customerId));
          }
        }
      }

      // Fire-and-forget accounting journal entry
      journalSale({
        saleId: sale.id,
        saleNumber,
        subtotal,
        taxAmount,
        total,
        payments: (payments ?? []).map((p: any) => ({ method: p.method, amount: Number(p.amount) })),
        items: itemsWithTax.map((i: any) => ({ quantity: Number(i.quantity), costPrice: i.costPrice })),
        branchId,
        createdBy: (req as any).dbUser?.id,
      });
    }

    const branch = await db.query.branchesTable.findFirst({ where: eq(branchesTable.id, branchId) });
    const customer = customerId ? await db.query.customersTable.findFirst({ where: eq(customersTable.id, customerId) }) : null;
    const saleItems = await db.select({
      id: saleItemsTable.id, productId: saleItemsTable.productId, productName: productsTable.name, sku: productsTable.sku,
      quantity: saleItemsTable.quantity, unitPrice: saleItemsTable.unitPrice, discountAmount: saleItemsTable.discountAmount, taxAmount: saleItemsTable.taxAmount, total: saleItemsTable.total,
    }).from(saleItemsTable).leftJoin(productsTable, eq(saleItemsTable.productId, productsTable.id)).where(eq(saleItemsTable.saleId, sale.id));

    res.status(201).json({
      ...formatSale(sale),
      branchName: branch?.name, customerName: customer?.name,
      items: saleItems.map(i => ({ ...i, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), discountAmount: Number(i.discountAmount), taxAmount: Number(i.taxAmount), total: Number(i.total) })),
      payments: (payments ?? []).map((p: any) => ({ ...p, amount: Number(p.amount), id: 0, createdAt: new Date().toISOString() })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/sales/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [sale] = await db.select({
      id: salesTable.id, saleNumber: salesTable.saleNumber, branchId: salesTable.branchId, branchName: branchesTable.name,
      customerId: salesTable.customerId, customerName: customersTable.name, status: salesTable.status,
      subtotal: salesTable.subtotal, taxAmount: salesTable.taxAmount, discountAmount: salesTable.discountAmount,
      total: salesTable.total, paidAmount: salesTable.paidAmount, changeAmount: salesTable.changeAmount,
      notes: salesTable.notes, createdAt: salesTable.createdAt,
    }).from(salesTable).leftJoin(branchesTable, eq(salesTable.branchId, branchesTable.id)).leftJoin(customersTable, eq(salesTable.customerId, customersTable.id)).where(eq(salesTable.id, id));
    if (!sale) return res.status(404).json({ error: "Not found" });

    const saleItems = await db.select({
      id: saleItemsTable.id, productId: saleItemsTable.productId, productName: productsTable.name, sku: productsTable.sku,
      quantity: saleItemsTable.quantity, unitPrice: saleItemsTable.unitPrice, discountAmount: saleItemsTable.discountAmount, taxAmount: saleItemsTable.taxAmount, total: saleItemsTable.total,
    }).from(saleItemsTable).leftJoin(productsTable, eq(saleItemsTable.productId, productsTable.id)).where(eq(saleItemsTable.saleId, id));

    const payments = await db.select().from(salePaymentsTable).where(eq(salePaymentsTable.saleId, id));

    res.json({
      ...formatSale(sale),
      items: saleItems.map(i => ({ ...i, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), discountAmount: Number(i.discountAmount), taxAmount: Number(i.taxAmount), total: Number(i.total) })),
      payments: payments.map(p => ({ ...p, amount: Number(p.amount), createdAt: p.createdAt?.toISOString() })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/sales/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, customerId, notes } = req.body;
    const [updated] = await db.update(salesTable).set({ status, customerId, notes }).where(eq(salesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(formatSale(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
