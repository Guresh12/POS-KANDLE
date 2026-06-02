import { db } from "@workspace/db";
import { accountsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const DEFAULT_ACCOUNTS = [
  { code: "1000", name: "Cash",                    type: "asset",     subtype: "cash",      normalBalance: "debit",  isSystem: true,  description: "Physical cash on hand" },
  { code: "1010", name: "Bank",                    type: "asset",     subtype: "bank",      normalBalance: "debit",  isSystem: true,  description: "Bank accounts" },
  { code: "1100", name: "Accounts Receivable",     type: "asset",     subtype: "receivable",normalBalance: "debit",  isSystem: true,  description: "Amounts owed by customers" },
  { code: "1200", name: "Inventory",               type: "asset",     subtype: "inventory", normalBalance: "debit",  isSystem: true,  description: "Stock on hand at cost" },
  { code: "2000", name: "Accounts Payable",        type: "liability", subtype: "payable",   normalBalance: "credit", isSystem: true,  description: "Amounts owed to suppliers" },
  { code: "2100", name: "Tax Payable",             type: "liability", subtype: "tax",       normalBalance: "credit", isSystem: true,  description: "VAT/Sales tax collected" },
  { code: "3000", name: "Owner's Capital",         type: "equity",    subtype: "capital",   normalBalance: "credit", isSystem: true,  description: "Owner equity / invested capital" },
  { code: "3100", name: "Retained Earnings",       type: "equity",    subtype: "retained",  normalBalance: "credit", isSystem: true,  description: "Accumulated profits retained" },
  { code: "4000", name: "Sales Revenue",           type: "revenue",   subtype: "sales",     normalBalance: "credit", isSystem: true,  description: "Income from product sales" },
  { code: "4100", name: "Service Revenue",         type: "revenue",   subtype: "service",   normalBalance: "credit", isSystem: false, description: "Income from services rendered" },
  { code: "5000", name: "Cost of Goods Sold",      type: "expense",   subtype: "cogs",      normalBalance: "debit",  isSystem: true,  description: "Direct cost of items sold" },
  { code: "6000", name: "Rent Expense",            type: "expense",   subtype: "operating", normalBalance: "debit",  isSystem: false, description: "Office / shop rental" },
  { code: "6100", name: "Salaries Expense",        type: "expense",   subtype: "operating", normalBalance: "debit",  isSystem: false, description: "Employee salaries and wages" },
  { code: "6200", name: "Utilities Expense",       type: "expense",   subtype: "operating", normalBalance: "debit",  isSystem: false, description: "Electricity, water, gas" },
  { code: "6300", name: "Internet & Telephone",    type: "expense",   subtype: "operating", normalBalance: "debit",  isSystem: false, description: "Internet, phone bills" },
  { code: "6400", name: "Fuel & Transport",        type: "expense",   subtype: "operating", normalBalance: "debit",  isSystem: false, description: "Fuel, delivery, transport" },
  { code: "6500", name: "Marketing & Advertising", type: "expense",   subtype: "operating", normalBalance: "debit",  isSystem: false, description: "Advertising and promotions" },
  { code: "6600", name: "Bank Charges",            type: "expense",   subtype: "operating", normalBalance: "debit",  isSystem: false, description: "Bank fees and charges" },
  { code: "6900", name: "Miscellaneous Expense",   type: "expense",   subtype: "operating", normalBalance: "debit",  isSystem: false, description: "Other operating expenses" },
  { code: "7000", name: "Inventory Write-off",     type: "expense",   subtype: "inventory", normalBalance: "debit",  isSystem: false, description: "Damaged, expired, or written-off stock" },
] as const;

export async function seedAccounts(): Promise<void> {
  try {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(accountsTable);
    if (Number(row?.count ?? 0) > 0) return; // already seeded

    await db.insert(accountsTable).values(
      DEFAULT_ACCOUNTS.map(a => ({ ...a, isSystem: a.isSystem }))
    );
    console.log("[seed] Chart of Accounts seeded — 20 default accounts created");
  } catch (err) {
    console.error("[seed] Failed to seed accounts:", err);
  }
}
