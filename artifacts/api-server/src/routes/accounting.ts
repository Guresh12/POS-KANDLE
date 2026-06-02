import { Router } from "express";
import { db } from "@workspace/db";
import {
  accountsTable, journalEntriesTable, journalLinesTable,
  cashDrawerSessionsTable, customersTable, suppliersTable,
} from "@workspace/db";
import { eq, sql, and, gte, lte, desc, asc, isNull } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";
import { invalidateAccountCache, createJournalEntry } from "../lib/journal-engine";

const router = Router();

function n(v: any): number { return Number(v ?? 0); }

// ─── Chart of Accounts ───────────────────────────────────────────────────────

router.get("/accounting/accounts", requireAuth, async (req, res) => {
  try {
    const rows = await db.select().from(accountsTable).where(eq(accountsTable.isActive, true)).orderBy(asc(accountsTable.code));
    res.json(rows);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/accounting/accounts", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { code, name, type, subtype, normalBalance, parentId, description } = req.body;
    if (!code || !name || !type) return res.status(400).json({ error: "code, name, type required" });
    const [acct] = await db.insert(accountsTable).values({ code, name, type, subtype, normalBalance: normalBalance ?? "debit", parentId, description, isSystem: false }).returning();
    invalidateAccountCache();
    res.status(201).json(acct);
  } catch (err: any) {
    if (err.code === "23505") return res.status(409).json({ error: "Account code already exists" });
    req.log.error(err); res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/accounting/accounts/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, description, isActive } = req.body;
    const acct = await db.query.accountsTable.findFirst({ where: eq(accountsTable.id, id) });
    if (!acct) return res.status(404).json({ error: "Not found" });
    if (acct.isSystem && isActive === false) return res.status(400).json({ error: "System accounts cannot be deactivated" });
    const [updated] = await db.update(accountsTable).set({ name, description, isActive }).where(eq(accountsTable.id, id)).returning();
    invalidateAccountCache();
    res.json(updated);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ─── Journal Entries ─────────────────────────────────────────────────────────

router.get("/accounting/journal-entries", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, sourceModule, limit = "100", offset = "0" } = req.query;
    const conds: any[] = [];
    if (startDate) conds.push(gte(journalEntriesTable.date, new Date(String(startDate))));
    if (endDate)   conds.push(lte(journalEntriesTable.date, new Date(String(endDate))));
    if (sourceModule) conds.push(eq(journalEntriesTable.sourceModule, String(sourceModule)));

    const rows = await db.select().from(journalEntriesTable)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(journalEntriesTable.date))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json(rows.map(e => ({ ...e, date: e.date?.toISOString(), createdAt: e.createdAt?.toISOString() })));
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/accounting/journal-entries/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const entry = await db.query.journalEntriesTable.findFirst({ where: eq(journalEntriesTable.id, id) });
    if (!entry) return res.status(404).json({ error: "Not found" });

    const lines = await db.select({
      id: journalLinesTable.id,
      accountId: journalLinesTable.accountId,
      accountCode: accountsTable.code,
      accountName: accountsTable.name,
      accountType: accountsTable.type,
      debit: journalLinesTable.debit,
      credit: journalLinesTable.credit,
      description: journalLinesTable.description,
    }).from(journalLinesTable)
      .leftJoin(accountsTable, eq(journalLinesTable.accountId, accountsTable.id))
      .where(eq(journalLinesTable.journalEntryId, id))
      .orderBy(asc(journalLinesTable.id));

    res.json({
      ...entry,
      date: entry.date?.toISOString(),
      createdAt: entry.createdAt?.toISOString(),
      lines: lines.map(l => ({ ...l, debit: n(l.debit), credit: n(l.credit) })),
      totalDebit: lines.reduce((s, l) => s + n(l.debit), 0),
      totalCredit: lines.reduce((s, l) => s + n(l.credit), 0),
    });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// Manual journal entry (admin only)
router.post("/accounting/journal-entries", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { description, date, sourceRef, lines } = req.body;
    if (!description || !lines?.length) return res.status(400).json({ error: "description and lines required" });

    const entryId = await createJournalEntry({
      description,
      date: date ? new Date(date) : undefined,
      sourceModule: "manual",
      sourceRef,
      createdBy: (req as any).dbUser?.id,
      lines: lines.map((l: any) => ({ accountCode: l.accountCode, debit: Number(l.debit ?? 0), credit: Number(l.credit ?? 0), description: l.description })),
    });

    if (!entryId) return res.status(400).json({ error: "Entry rejected — check account codes and that debits equal credits" });
    const entry = await db.query.journalEntriesTable.findFirst({ where: eq(journalEntriesTable.id, entryId) });
    res.status(201).json(entry);
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// Reverse an entry (creates an equal-and-opposite reversal)
router.post("/accounting/journal-entries/:id/reverse", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const entry = await db.query.journalEntriesTable.findFirst({ where: eq(journalEntriesTable.id, id) });
    if (!entry) return res.status(404).json({ error: "Not found" });
    if (entry.isReversed) return res.status(400).json({ error: "Entry already reversed" });

    const lines = await db.select({
      accountId: journalLinesTable.accountId,
      debit: journalLinesTable.debit,
      credit: journalLinesTable.credit,
      description: journalLinesTable.description,
    }).from(journalLinesTable).where(eq(journalLinesTable.journalEntryId, id));

    // Need account codes to create reversal via journal engine
    const accts = await db.select({ id: accountsTable.id, code: accountsTable.code }).from(accountsTable);
    const idToCode = new Map(accts.map(a => [a.id, a.code]));

    const reversalId = await createJournalEntry({
      description: `REVERSAL of ${entry.entryNumber}: ${entry.description}`,
      sourceModule: "reversal",
      sourceId: id,
      sourceRef: `REV-${entry.entryNumber}`,
      createdBy: (req as any).dbUser?.id,
      lines: lines.map(l => ({
        accountCode: idToCode.get(l.accountId) ?? "",
        debit: n(l.credit),   // swapped
        credit: n(l.debit),   // swapped
        description: l.description ?? undefined,
      })).filter(l => l.accountCode),
    });

    if (!reversalId) return res.status(400).json({ error: "Reversal failed" });

    await db.update(journalEntriesTable)
      .set({ isReversed: true, reversedById: reversalId })
      .where(eq(journalEntriesTable.id, id));

    res.status(201).json({ reversalEntryId: reversalId });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ─── Financial Reports ───────────────────────────────────────────────────────

// Trial Balance — aggregate debit/credit per account from posted journal lines
router.get("/accounting/reports/trial-balance", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateConds: string[] = [];
    if (startDate) dateConds.push(`e.date >= '${String(startDate)}'`);
    if (endDate)   dateConds.push(`e.date <= '${String(endDate)}'`);
    const whereClause = dateConds.length ? `AND ${dateConds.join(" AND ")}` : "";

    const result = await db.execute(sql.raw(`
      SELECT
        a.id, a.code, a.name, a.type, a.subtype, a.normal_balance,
        COALESCE(SUM(l.debit::numeric), 0)  AS total_debit,
        COALESCE(SUM(l.credit::numeric), 0) AS total_credit,
        CASE
          WHEN a.normal_balance = 'debit'
            THEN COALESCE(SUM(l.debit::numeric), 0) - COALESCE(SUM(l.credit::numeric), 0)
          ELSE
            COALESCE(SUM(l.credit::numeric), 0) - COALESCE(SUM(l.debit::numeric), 0)
        END AS balance
      FROM accounts a
      LEFT JOIN journal_lines l ON l.account_id = a.id
      LEFT JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted'
      WHERE a.is_active = true ${whereClause}
      GROUP BY a.id, a.code, a.name, a.type, a.subtype, a.normal_balance
      ORDER BY a.code
    `));

    const rows = (result as any).rows as any[];
    const data = rows.map(r => ({
      id: n(r.id), code: r.code, name: r.name, type: r.type, subtype: r.subtype,
      normalBalance: r.normal_balance,
      totalDebit: n(r.total_debit), totalCredit: n(r.total_credit),
      balance: n(r.balance),
    }));

    res.json({
      data,
      grandTotalDebit:  data.reduce((s, r) => s + r.totalDebit, 0),
      grandTotalCredit: data.reduce((s, r) => s + r.totalCredit, 0),
    });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// Balance Sheet
router.get("/accounting/reports/balance-sheet", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { asOf } = req.query;
    const dateCond = asOf ? `AND e.date <= '${String(asOf)}'` : "";

    const result = await db.execute(sql.raw(`
      SELECT
        a.code, a.name, a.type, a.subtype, a.normal_balance,
        CASE
          WHEN a.normal_balance = 'debit'
            THEN COALESCE(SUM(l.debit::numeric), 0) - COALESCE(SUM(l.credit::numeric), 0)
          ELSE
            COALESCE(SUM(l.credit::numeric), 0) - COALESCE(SUM(l.debit::numeric), 0)
        END AS balance
      FROM accounts a
      LEFT JOIN journal_lines l ON l.account_id = a.id
      LEFT JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted' ${dateCond}
      WHERE a.is_active = true
      GROUP BY a.code, a.name, a.type, a.subtype, a.normal_balance
      ORDER BY a.code
    `));

    const rows = ((result as any).rows as any[]).map(r => ({ code: r.code, name: r.name, type: r.type, subtype: r.subtype, balance: n(r.balance) }));

    const assets      = rows.filter(r => r.type === "asset");
    const liabilities = rows.filter(r => r.type === "liability");
    const equity      = rows.filter(r => r.type === "equity");
    const revenue     = rows.filter(r => r.type === "revenue");
    const expenses    = rows.filter(r => r.type === "expense");

    const totalAssets      = assets.reduce((s, r) => s + r.balance, 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0);
    const totalEquity      = equity.reduce((s, r) => s + r.balance, 0);
    const netIncome        = revenue.reduce((s, r) => s + r.balance, 0) - expenses.reduce((s, r) => s + r.balance, 0);

    res.json({
      asOf: asOf ?? new Date().toISOString().split("T")[0],
      assets, liabilities, equity, netIncome,
      totalAssets,
      totalLiabilities,
      totalEquity: totalEquity + netIncome,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity + netIncome)) < 0.01,
    });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// Income Statement (P&L backed by journal entries)
router.get("/accounting/reports/income-statement", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateConds: string[] = [];
    if (startDate) dateConds.push(`e.date >= '${String(startDate)}'`);
    if (endDate)   dateConds.push(`e.date <= '${String(endDate)}'`);
    const whereClause = dateConds.length ? `AND ${dateConds.join(" AND ")}` : "";

    const result = await db.execute(sql.raw(`
      SELECT
        a.code, a.name, a.type, a.subtype,
        CASE
          WHEN a.normal_balance = 'debit'
            THEN COALESCE(SUM(l.debit::numeric), 0) - COALESCE(SUM(l.credit::numeric), 0)
          ELSE
            COALESCE(SUM(l.credit::numeric), 0) - COALESCE(SUM(l.debit::numeric), 0)
        END AS balance
      FROM accounts a
      JOIN journal_lines l ON l.account_id = a.id
      JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted' ${whereClause}
      WHERE a.type IN ('revenue', 'expense') AND a.is_active = true
      GROUP BY a.code, a.name, a.type, a.subtype, a.normal_balance
      ORDER BY a.code
    `));

    const rows = ((result as any).rows as any[]).map(r => ({ code: r.code, name: r.name, type: r.type, balance: n(r.balance) }));
    const revenue  = rows.filter(r => r.type === "revenue");
    const expenses = rows.filter(r => r.type === "expense");
    const totalRevenue  = revenue.reduce((s, r) => s + r.balance, 0);
    const totalExpenses = expenses.reduce((s, r) => s + r.balance, 0);
    const cogs = expenses.filter(e => e.code === "5000").reduce((s, r) => s + r.balance, 0);
    const opExpenses = expenses.filter(e => e.code !== "5000").reduce((s, r) => s + r.balance, 0);

    res.json({
      revenue, totalRevenue,
      cogs, grossProfit: totalRevenue - cogs,
      grossMargin: totalRevenue > 0 ? ((totalRevenue - cogs) / totalRevenue) * 100 : 0,
      expenses: expenses.filter(e => e.code !== "5000"),
      operatingExpenses: opExpenses,
      netIncome: totalRevenue - totalExpenses,
      netMargin: totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0,
    });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// General Ledger — all movements for a single account
router.get("/accounting/reports/general-ledger/:accountCode", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { accountCode } = req.params;
    const { startDate, endDate } = req.query;

    const acct = await db.query.accountsTable.findFirst({ where: eq(accountsTable.code, accountCode) });
    if (!acct) return res.status(404).json({ error: "Account not found" });

    const dateConds: string[] = [];
    if (startDate) dateConds.push(`e.date >= '${String(startDate)}'`);
    if (endDate)   dateConds.push(`e.date <= '${String(endDate)}'`);
    const whereClause = dateConds.length ? `AND ${dateConds.join(" AND ")}` : "";

    const result = await db.execute(sql.raw(`
      SELECT
        e.id as entry_id, e.entry_number, e.date, e.description, e.source_module, e.source_ref,
        l.debit::numeric, l.credit::numeric, l.description as line_description
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted'
      WHERE l.account_id = ${acct.id} ${whereClause}
      ORDER BY e.date ASC, e.id ASC
    `));

    const lines = (result as any).rows as any[];
    let runningBalance = 0;
    const isDebitNormal = acct.normalBalance === "debit";

    const ledger = lines.map(l => {
      const dr = n(l.debit);
      const cr = n(l.credit);
      runningBalance += isDebitNormal ? (dr - cr) : (cr - dr);
      return {
        entryId: n(l.entry_id), entryNumber: l.entry_number,
        date: new Date(l.date).toISOString(),
        description: l.line_description ?? l.description,
        sourceModule: l.source_module, sourceRef: l.source_ref,
        debit: dr, credit: cr, balance: Math.round(runningBalance * 100) / 100,
      };
    });

    res.json({ account: acct, entries: ledger, closingBalance: runningBalance });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// AR Aging — outstanding customer balances by age bucket
router.get("/accounting/reports/ar-aging", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.execute(sql.raw(`
      SELECT
        c.id, c.name, c.phone, c.balance::numeric as balance,
        (SELECT MAX(s.created_at) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed') as last_sale_date,
        CURRENT_DATE - (SELECT MAX(s.created_at::date) FROM sales s WHERE s.customer_id = c.id AND s.status = 'completed') as days_outstanding
      FROM customers c
      WHERE c.balance::numeric > 0
      ORDER BY balance DESC
    `));

    const rows = ((result as any).rows as any[]).map(r => {
      const days = n(r.days_outstanding);
      const bucket = days <= 30 ? "0-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
      return {
        id: n(r.id), name: r.name, phone: r.phone, balance: n(r.balance),
        lastSaleDate: r.last_sale_date ? new Date(r.last_sale_date).toISOString() : null,
        daysOutstanding: days, bucket,
      };
    });

    const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 } as Record<string, number>;
    rows.forEach(r => { buckets[r.bucket] = (buckets[r.bucket] ?? 0) + r.balance; });

    res.json({ customers: rows, buckets, totalOutstanding: rows.reduce((s, r) => s + r.balance, 0) });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// AP Aging — outstanding supplier balances by age bucket
router.get("/accounting/reports/ap-aging", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.execute(sql.raw(`
      SELECT
        s.id, s.name, s.phone, s.balance::numeric as balance,
        (SELECT MAX(p.created_at) FROM purchases p WHERE p.supplier_id = s.id) as last_purchase_date,
        CURRENT_DATE - (SELECT MAX(p.created_at::date) FROM purchases p WHERE p.supplier_id = s.id) as days_outstanding
      FROM suppliers s
      WHERE s.balance::numeric > 0
      ORDER BY balance DESC
    `));

    const rows = ((result as any).rows as any[]).map(r => {
      const days = n(r.days_outstanding);
      const bucket = days <= 30 ? "0-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
      return {
        id: n(r.id), name: r.name, phone: r.phone, balance: n(r.balance),
        lastPurchaseDate: r.last_purchase_date ? new Date(r.last_purchase_date).toISOString() : null,
        daysOutstanding: days, bucket,
      };
    });

    const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 } as Record<string, number>;
    rows.forEach(r => { buckets[r.bucket] = (buckets[r.bucket] ?? 0) + r.balance; });

    res.json({ suppliers: rows, buckets, totalOutstanding: rows.reduce((s, r) => s + r.balance, 0) });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// Cash Flow Summary — from movements on Cash (1000) and Bank (1010) accounts
router.get("/accounting/reports/cash-flow", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateConds: string[] = [];
    if (startDate) dateConds.push(`e.date >= '${String(startDate)}'`);
    if (endDate)   dateConds.push(`e.date <= '${String(endDate)}'`);
    const whereClause = dateConds.length ? `AND ${dateConds.join(" AND ")}` : "";

    const result = await db.execute(sql.raw(`
      SELECT
        e.source_module,
        SUM(l.debit::numeric)  AS total_in,
        SUM(l.credit::numeric) AS total_out
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'posted' ${whereClause}
      JOIN accounts a ON a.id = l.account_id AND a.code IN ('1000','1010')
      GROUP BY e.source_module
      ORDER BY e.source_module
    `));

    const rows = ((result as any).rows as any[]).map(r => ({
      module: r.source_module ?? "other",
      totalIn: n(r.total_in),
      totalOut: n(r.total_out),
      net: n(r.total_in) - n(r.total_out),
    }));

    res.json({
      flows: rows,
      totalInflow:  rows.reduce((s, r) => s + r.totalIn, 0),
      totalOutflow: rows.reduce((s, r) => s + r.totalOut, 0),
      netCashFlow:  rows.reduce((s, r) => s + r.net, 0),
    });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

// ─── Cash Drawer ─────────────────────────────────────────────────────────────

router.get("/accounting/cash-drawer", requireAuth, async (req, res) => {
  try {
    const { branchId } = req.query;
    const conds: any[] = [];
    if (branchId) conds.push(eq(cashDrawerSessionsTable.branchId, Number(branchId)));
    const sessions = await db.select().from(cashDrawerSessionsTable)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(cashDrawerSessionsTable.openedAt))
      .limit(50);
    res.json(sessions.map(s => ({
      ...s,
      openingBalance: n(s.openingBalance), expectedBalance: n(s.expectedBalance),
      actualBalance: s.actualBalance !== null ? n(s.actualBalance) : null,
      variance: s.variance !== null ? n(s.variance) : null,
      openedAt: s.openedAt?.toISOString(), closedAt: s.closedAt?.toISOString() ?? null,
    })));
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.get("/accounting/cash-drawer/current", requireAuth, async (req, res) => {
  try {
    const { branchId } = req.query;
    const conds: any[] = [eq(cashDrawerSessionsTable.status, "open")];
    if (branchId) conds.push(eq(cashDrawerSessionsTable.branchId, Number(branchId)));
    const [session] = await db.select().from(cashDrawerSessionsTable).where(and(...conds)).orderBy(desc(cashDrawerSessionsTable.openedAt)).limit(1);
    if (!session) return res.json(null);
    res.json({ ...session, openingBalance: n(session.openingBalance), expectedBalance: n(session.expectedBalance), openedAt: session.openedAt?.toISOString() });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.post("/accounting/cash-drawer", requireAuth, async (req, res) => {
  try {
    const { branchId, openingBalance = 0 } = req.body;
    const userId = (req as any).dbUser?.id;

    // Close any existing open session for this branch first
    if (branchId) {
      await db.update(cashDrawerSessionsTable)
        .set({ status: "closed", closedAt: new Date(), closedBy: userId })
        .where(and(eq(cashDrawerSessionsTable.branchId, Number(branchId)), eq(cashDrawerSessionsTable.status, "open")));
    }

    const [session] = await db.insert(cashDrawerSessionsTable).values({
      branchId: branchId ? Number(branchId) : null,
      openedBy: userId,
      openingBalance: String(openingBalance),
      expectedBalance: String(openingBalance),
      status: "open",
    }).returning();

    res.status(201).json({ ...session, openingBalance: n(session.openingBalance), expectedBalance: n(session.expectedBalance), openedAt: session.openedAt?.toISOString() });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

router.patch("/accounting/cash-drawer/:id/close", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { actualBalance, notes } = req.body;
    const session = await db.query.cashDrawerSessionsTable.findFirst({ where: eq(cashDrawerSessionsTable.id, id) });
    if (!session) return res.status(404).json({ error: "Not found" });

    // Calculate expected balance: opening + cash sales - cash expenses in this period
    const salesResult = await db.execute(sql.raw(`
      SELECT COALESCE(SUM(sp.amount::numeric), 0) as cash_sales
      FROM sale_payments sp
      JOIN sales s ON s.id = sp.sale_id
      WHERE sp.method = 'cash' AND s.status = 'completed' AND s.created_at >= '${session.openedAt.toISOString()}'
    `));
    const cashSales = n(((salesResult as any).rows as any[])[0]?.cash_sales ?? 0);

    const expResult = await db.execute(sql.raw(`
      SELECT COALESCE(SUM(amount::numeric), 0) as cash_exp
      FROM expenses
      WHERE (reference IS NULL OR reference NOT ILIKE '%bank%')
      AND created_at >= '${session.openedAt.toISOString()}'
    `));
    const cashExp = n(((expResult as any).rows as any[])[0]?.cash_exp ?? 0);

    const expected = n(session.openingBalance) + cashSales - cashExp;
    const actual = actualBalance !== undefined ? n(actualBalance) : expected;
    const variance = actual - expected;
    const userId = (req as any).dbUser?.id;

    const [updated] = await db.update(cashDrawerSessionsTable).set({
      status: "closed", closedAt: new Date(), closedBy: userId,
      expectedBalance: String(expected), actualBalance: String(actual),
      variance: String(variance), notes,
    }).where(eq(cashDrawerSessionsTable.id, id)).returning();

    res.json({
      ...updated,
      openingBalance: n(updated.openingBalance), expectedBalance: n(updated.expectedBalance),
      actualBalance: n(updated.actualBalance), variance: n(updated.variance),
      cashSales, cashExpenses: cashExp,
      openedAt: updated.openedAt?.toISOString(), closedAt: updated.closedAt?.toISOString(),
    });
  } catch (err) { req.log.error(err); res.status(500).json({ error: "Internal server error" }); }
});

export default router;
