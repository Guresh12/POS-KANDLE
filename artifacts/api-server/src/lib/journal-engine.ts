/**
 * Double-Entry Journal Engine
 *
 * Every business transaction that affects financial position creates a
 * balanced journal entry here.  Callers never touch journal_entries or
 * journal_lines directly — they call the typed helpers below.
 *
 * Design rules:
 *  • Errors are caught and logged; they never propagate to the caller so a
 *    failed accounting write never blocks the underlying business operation.
 *  • Total debits must equal total credits — entries that don't balance are
 *    rejected with a warning.
 *  • Account codes are resolved to IDs via an in-process cache that is
 *    invalidated whenever accounts are modified.
 */

import { db } from "@workspace/db";
import { accountsTable, journalEntriesTable, journalLinesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ─── System Account Codes ────────────────────────────────────────────────────
export const ACC = {
  CASH:            "1000",
  BANK:            "1010",
  ACCOUNTS_REC:    "1100",
  INVENTORY:       "1200",
  ACCOUNTS_PAY:    "2000",
  TAX_PAYABLE:     "2100",
  OWNER_CAPITAL:   "3000",
  RETAINED_EARN:   "3100",
  SALES_REVENUE:   "4000",
  SERVICE_REVENUE: "4100",
  COGS:            "5000",
  RENT:            "6000",
  SALARIES:        "6100",
  UTILITIES:       "6200",
  INTERNET:        "6300",
  FUEL:            "6400",
  MARKETING:       "6500",
  BANK_CHARGES:    "6600",
  MISC_EXPENSE:    "6900",
  INVENTORY_LOSS:  "7000",
} as const;

// Payment method → debit account code
export function paymentMethodAccount(method: string): string {
  if (method === "bank" || method === "card" || method === "bank_transfer" || method === "mpesa" || method === "mobile_money") return ACC.BANK;
  if (method === "credit") return ACC.ACCOUNTS_REC;
  return ACC.CASH;
}

// Expense category name → account code (fallback = misc)
export function expenseCategoryAccount(categoryName: string | null | undefined): string {
  const n = (categoryName ?? "").toLowerCase();
  if (n.includes("rent") || n.includes("lease")) return ACC.RENT;
  if (n.includes("salary") || n.includes("salaries") || n.includes("wage")) return ACC.SALARIES;
  if (n.includes("util") || n.includes("electric") || n.includes("water")) return ACC.UTILITIES;
  if (n.includes("internet") || n.includes("phone") || n.includes("telecom")) return ACC.INTERNET;
  if (n.includes("fuel") || n.includes("transport") || n.includes("delivery")) return ACC.FUEL;
  if (n.includes("market") || n.includes("advert") || n.includes("promo")) return ACC.MARKETING;
  if (n.includes("bank") || n.includes("charge") || n.includes("fee")) return ACC.BANK_CHARGES;
  return ACC.MISC_EXPENSE;
}

// ─── Account ID Cache ─────────────────────────────────────────────────────────
let _codeToId: Map<string, number> | null = null;

async function resolveAccountId(code: string): Promise<number | null> {
  if (!_codeToId) {
    const rows = await db.select({ id: accountsTable.id, code: accountsTable.code }).from(accountsTable);
    _codeToId = new Map(rows.map(r => [r.code, r.id]));
  }
  return _codeToId.get(code) ?? null;
}

export function invalidateAccountCache(): void {
  _codeToId = null;
}

// ─── Entry Number Generator ───────────────────────────────────────────────────
function makeEntryNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `JE-${ymd}-${Date.now().toString(36).toUpperCase()}`;
}

// ─── Core Engine ─────────────────────────────────────────────────────────────
interface LineInput {
  accountCode: string;
  debit?: number;
  credit?: number;
  description?: string;
}

interface EntryInput {
  date?: Date;
  description: string;
  sourceModule?: string;
  sourceId?: number;
  sourceRef?: string;
  branchId?: number;
  createdBy?: number;
  lines: LineInput[];
}

export async function createJournalEntry(input: EntryInput): Promise<number | null> {
  try {
    // Resolve account codes → IDs
    const resolved: { accountId: number; debit: number; credit: number; description?: string }[] = [];
    for (const line of input.lines) {
      const id = await resolveAccountId(line.accountCode);
      if (!id) {
        console.warn(`[journal] Unknown account code: ${line.accountCode}`);
        continue;
      }
      const debit = Math.round((line.debit ?? 0) * 100) / 100;
      const credit = Math.round((line.credit ?? 0) * 100) / 100;
      if (debit === 0 && credit === 0) continue;
      resolved.push({ accountId: id, debit, credit, description: line.description });
    }

    if (resolved.length < 2) {
      console.warn("[journal] Entry has fewer than 2 valid lines, skipping");
      return null;
    }

    // Verify balance
    const sumD = resolved.reduce((s, l) => s + l.debit, 0);
    const sumC = resolved.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(sumD - sumC) > 0.005) {
      console.warn(`[journal] Unbalanced entry: DR ${sumD.toFixed(2)} CR ${sumC.toFixed(2)}`);
      return null;
    }

    const [entry] = await db.insert(journalEntriesTable).values({
      entryNumber: makeEntryNumber(),
      date: input.date ?? new Date(),
      description: input.description,
      sourceModule: input.sourceModule,
      sourceId: input.sourceId,
      sourceRef: input.sourceRef,
      branchId: input.branchId,
      createdBy: input.createdBy,
      status: "posted",
    }).returning();

    await db.insert(journalLinesTable).values(
      resolved.map(l => ({
        journalEntryId: entry.id,
        accountId: l.accountId,
        debit: String(l.debit),
        credit: String(l.credit),
        description: l.description,
      }))
    );

    return entry.id;
  } catch (err) {
    console.error("[journal] Failed to create entry:", err);
    return null;
  }
}

// ─── Typed Business Event Helpers ────────────────────────────────────────────

/** Called after a sale is completed */
export async function journalSale(p: {
  saleId: number;
  saleNumber: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  payments: Array<{ method: string; amount: number }>;
  items: Array<{ quantity: number; costPrice: number }>;
  branchId: number;
  createdBy?: number;
}): Promise<void> {
  const lines: LineInput[] = [];

  // Revenue side
  if (p.subtotal > 0) lines.push({ accountCode: ACC.SALES_REVENUE, credit: p.subtotal, description: `Revenue ${p.saleNumber}` });
  if (p.taxAmount > 0) lines.push({ accountCode: ACC.TAX_PAYABLE, credit: p.taxAmount, description: `Tax collected ${p.saleNumber}` });

  // Payment side (debit the asset received).
  // Use p.total as the authoritative DR amount, not the tendered amount, because
  // change given back to a cash customer must not be journaled as income.
  const rawPayTotal = p.payments.reduce((s, pp) => s + pp.amount, 0);
  for (const pay of p.payments) {
    if (pay.amount <= 0) continue;
    // Allocate p.total proportionally across payment methods
    const debitAmount = rawPayTotal > 0
      ? Math.round(((pay.amount / rawPayTotal) * p.total) * 100) / 100
      : pay.amount;
    lines.push({ accountCode: paymentMethodAccount(pay.method), debit: debitAmount, description: `${pay.method} receipt ${p.saleNumber}` });
  }

  // COGS: debit COGS, credit Inventory
  const totalCOGS = p.items.reduce((s, i) => s + i.quantity * i.costPrice, 0);
  if (totalCOGS > 0.005) {
    lines.push({ accountCode: ACC.COGS, debit: totalCOGS, description: `COGS ${p.saleNumber}` });
    lines.push({ accountCode: ACC.INVENTORY, credit: totalCOGS, description: `Inventory out ${p.saleNumber}` });
  }

  await createJournalEntry({
    description: `Sale ${p.saleNumber}`,
    sourceModule: "sale",
    sourceId: p.saleId,
    sourceRef: p.saleNumber,
    branchId: p.branchId,
    createdBy: p.createdBy,
    lines,
  });
}

/** Called when a purchase is received into stock */
export async function journalPurchaseReceived(p: {
  purchaseId: number;
  purchaseRef: string;
  totalAmount: number;
  branchId?: number;
  createdBy?: number;
}): Promise<void> {
  if (p.totalAmount <= 0) return;
  await createJournalEntry({
    description: `Purchase received ${p.purchaseRef}`,
    sourceModule: "purchase",
    sourceId: p.purchaseId,
    sourceRef: p.purchaseRef,
    branchId: p.branchId,
    createdBy: p.createdBy,
    lines: [
      { accountCode: ACC.INVENTORY,     debit:  p.totalAmount, description: "Stock received" },
      { accountCode: ACC.ACCOUNTS_PAY,  credit: p.totalAmount, description: `Payable ${p.purchaseRef}` },
    ],
  });
}

/** Called when a supplier payment is made */
export async function journalSupplierPayment(p: {
  purchaseId: number;
  purchaseRef: string;
  amount: number;
  method: string;
  branchId?: number;
  createdBy?: number;
}): Promise<void> {
  if (p.amount <= 0) return;
  const cashAcc = (p.method === "bank" || p.method === "card" || p.method === "bank_transfer") ? ACC.BANK : ACC.CASH;
  await createJournalEntry({
    description: `Supplier payment ${p.purchaseRef}`,
    sourceModule: "purchase_payment",
    sourceId: p.purchaseId,
    sourceRef: p.purchaseRef,
    branchId: p.branchId,
    createdBy: p.createdBy,
    lines: [
      { accountCode: ACC.ACCOUNTS_PAY, debit: p.amount, description: "AP cleared" },
      { accountCode: cashAcc,          credit: p.amount, description: `${p.method} paid` },
    ],
  });
}

/** Called when an expense is recorded */
export async function journalExpense(p: {
  expenseId: number;
  description: string;
  amount: number;
  categoryName?: string | null;
  paymentMethod?: string;
  branchId?: number;
  createdBy?: number;
}): Promise<void> {
  if (p.amount <= 0) return;
  const expAcc = expenseCategoryAccount(p.categoryName);
  const cashAcc = (p.paymentMethod === "bank") ? ACC.BANK : ACC.CASH;
  await createJournalEntry({
    description: `Expense: ${p.description}`,
    sourceModule: "expense",
    sourceId: p.expenseId,
    sourceRef: `EXP-${p.expenseId}`,
    branchId: p.branchId,
    createdBy: p.createdBy,
    lines: [
      { accountCode: expAcc,  debit: p.amount, description: p.description },
      { accountCode: cashAcc, credit: p.amount, description: "Cash/Bank out" },
    ],
  });
}

/** Called when a customer pays off a credit balance */
export async function journalCustomerPayment(p: {
  customerId: number;
  customerName: string;
  amount: number;
  method: string;
  branchId?: number;
  createdBy?: number;
}): Promise<void> {
  if (p.amount <= 0) return;
  const cashAcc = paymentMethodAccount(p.method);
  await createJournalEntry({
    description: `Customer payment ${p.customerName}`,
    sourceModule: "customer_payment",
    sourceId: p.customerId,
    branchId: p.branchId,
    createdBy: p.createdBy,
    lines: [
      { accountCode: cashAcc,           debit: p.amount, description: `Received from ${p.customerName}` },
      { accountCode: ACC.ACCOUNTS_REC,  credit: p.amount, description: `AR cleared ${p.customerName}` },
    ],
  });
}

/** Called when a manual inventory adjustment is made */
export async function journalInventoryAdjustment(p: {
  transactionId: number;
  type: string;
  costValue: number;
  notes?: string | null;
  branchId?: number;
  createdBy?: number;
}): Promise<void> {
  if (p.costValue <= 0) return;
  const note = p.notes ?? p.type;

  let lines: LineInput[];
  if (p.type === "stock_in") {
    lines = [
      { accountCode: ACC.INVENTORY,    debit:  p.costValue, description: note },
      { accountCode: ACC.OWNER_CAPITAL, credit: p.costValue, description: "Capital / adjustment" },
    ];
  } else if (p.type === "damage" || p.type === "expired" || p.type === "write_off") {
    lines = [
      { accountCode: ACC.INVENTORY_LOSS, debit:  p.costValue, description: note },
      { accountCode: ACC.INVENTORY,      credit: p.costValue, description: "Inventory removed" },
    ];
  } else if (p.type === "stock_out") {
    lines = [
      { accountCode: ACC.COGS,      debit:  p.costValue, description: note },
      { accountCode: ACC.INVENTORY, credit: p.costValue, description: "Inventory removed" },
    ];
  } else {
    return;
  }

  await createJournalEntry({
    description: `Inventory ${p.type}: ${note}`,
    sourceModule: "inventory",
    sourceId: p.transactionId,
    branchId: p.branchId,
    createdBy: p.createdBy,
    lines,
  });
}
