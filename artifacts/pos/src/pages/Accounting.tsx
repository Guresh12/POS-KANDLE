import { useState } from "react";
import { useCurrency } from "@/hooks/use-currency";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import {
  useListAccounts, useCreateAccount,
  useListJournalEntries, useGetJournalEntry, useReverseJournalEntry,
  useGetTrialBalance, useGetBalanceSheet, useGetIncomeStatement,
  useGetArAging, useGetApAging,
  useGetCurrentDrawer, useOpenCashDrawer, useCloseCashDrawer,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BookOpen, DollarSign, FileText, TrendingUp, Scale,
  Plus, RotateCcw, CreditCard, Wallet,
} from "lucide-react";

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function AccountTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    asset:     "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    liability: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    equity:    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    revenue:   "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    expense:   "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${colors[type] ?? "bg-muted text-muted-foreground"}`}>
      {type}
    </span>
  );
}

// ─── sub-panels ───────────────────────────────────────────────────────────────

function ChartOfAccounts() {
  const { fmt } = useCurrency();
  const { data: accounts, isLoading } = useListAccounts();
  const createAccount = useCreateAccount();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", type: "asset", subtype: "", description: "" });

  const handleCreate = async () => {
    if (!form.code || !form.name) return toast({ title: "Code and name required", variant: "destructive" });
    try {
      await createAccount.mutateAsync({ data: form });
      setOpen(false);
      setForm({ code: "", name: "", type: "asset", subtype: "", description: "" });
      toast({ title: "Account created" });
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  if (isLoading) return <div className="py-10 text-center text-muted-foreground">Loading accounts…</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{accounts?.length ?? 0} accounts</p>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-3.5 w-3.5" />New Account</Button>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-24">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Subtype</TableHead>
              <TableHead className="text-right">Normal Balance</TableHead>
              <TableHead className="text-right">Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts?.map(acc => (
              <TableRow key={acc.id} className="text-sm">
                <TableCell className="font-mono font-medium">{acc.code}</TableCell>
                <TableCell>{acc.name}</TableCell>
                <TableCell><AccountTypeBadge type={acc.type} /></TableCell>
                <TableCell className="text-muted-foreground capitalize">{acc.subtype ?? "—"}</TableCell>
                <TableCell className="text-right capitalize text-muted-foreground">{acc.normalBalance ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Badge variant={acc.isActive ? "outline" : "secondary"} className="text-xs">
                    {acc.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>New Account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Code *</Label>
                <Input placeholder="e.g. 1050" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Type *</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["asset", "liability", "equity", "revenue", "expense"].map(t => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input placeholder="Account name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Subtype</Label>
              <Input placeholder="e.g. current, fixed" value={form.subtype} onChange={e => setForm(f => ({ ...f, subtype: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input placeholder="Optional" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createAccount.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Journal Entries ──────────────────────────────────────────────────────────

function JournalEntries() {
  const { fmt } = useCurrency();
  const [params, setParams] = useState({ startDate: "", endDate: "", sourceModule: "", limit: 50, offset: 0 });
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data: entries, isLoading } = useListJournalEntries(params);
  const { data: detail, isLoading: detailLoading } = useGetJournalEntry(detailId!, {
    query: { enabled: detailId !== null },
  });
  const reverseEntry = useReverseJournalEntry();
  const { toast } = useToast();
  const qc = useQueryClient();

  const handleReverse = async (id: number) => {
    try {
      await reverseEntry.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: ["journalEntries"] });
      toast({ title: "Entry reversed" });
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" className="h-8 text-xs w-36" value={params.startDate} onChange={e => setParams(p => ({ ...p, startDate: e.target.value, offset: 0 }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" className="h-8 text-xs w-36" value={params.endDate} onChange={e => setParams(p => ({ ...p, endDate: e.target.value, offset: 0 }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Module</Label>
          <Select value={params.sourceModule || "_all_"} onValueChange={v => setParams(p => ({ ...p, sourceModule: v === "_all_" ? "" : v, offset: 0 }))}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all_">All modules</SelectItem>
              {["sales", "purchases", "expenses", "customers", "inventory"].map(m => (
                <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-muted-foreground">Loading…</div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Entry #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!entries?.length ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No journal entries found</TableCell></TableRow>
              ) : entries.map(e => (
                <TableRow key={e.id} className="text-sm">
                  <TableCell className="font-mono text-xs">{e.entryNumber}</TableCell>
                  <TableCell>{fmtDate(e.date)}</TableCell>
                  <TableCell className="max-w-xs truncate">{e.description}</TableCell>
                  <TableCell>
                    {e.sourceModule && <Badge variant="outline" className="text-xs capitalize">{e.sourceModule}</Badge>}
                  </TableCell>
                  <TableCell>
                    {e.isReversed
                      ? <Badge variant="secondary" className="text-xs">Reversed</Badge>
                      : <Badge variant="outline" className="text-xs text-green-700 border-green-300">Posted</Badge>}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDetailId(e.id)}>
                      View
                    </Button>
                    {!e.isReversed && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-orange-600" onClick={() => handleReverse(e.id)} disabled={reverseEntry.isPending}>
                        <RotateCcw className="h-3 w-3 mr-1" />Reverse
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Entry Detail Dialog */}
      <Dialog open={detailId !== null} onOpenChange={open => { if (!open) setDetailId(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Journal Entry {detail?.entryNumber}
              {detail?.isReversed && <Badge variant="secondary" className="ml-2 text-xs">Reversed</Badge>}
            </DialogTitle>
          </DialogHeader>
          {detailLoading || !detail ? (
            <div className="py-8 text-center text-muted-foreground">Loading…</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Date:</span> {fmtDate(detail.date)}</div>
                <div><span className="text-muted-foreground">Module:</span> <span className="capitalize">{detail.sourceModule ?? "—"}</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">Description:</span> {detail.description}</div>
                {detail.sourceRef && <div className="col-span-2"><span className="text-muted-foreground">Ref:</span> {detail.sourceRef}</div>}
              </div>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 text-xs">
                      <TableHead>Code</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.lines.map((line, i) => (
                      <TableRow key={i} className="text-sm">
                        <TableCell className="font-mono text-xs">{line.accountCode}</TableCell>
                        <TableCell>{line.accountName}</TableCell>
                        <TableCell className="text-right font-medium">{line.debit > 0 ? fmt(line.debit) : "—"}</TableCell>
                        <TableCell className="text-right font-medium text-muted-foreground">{line.credit > 0 ? fmt(line.credit) : "—"}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-semibold text-sm">
                      <TableCell colSpan={2} className="text-right">Totals</TableCell>
                      <TableCell className="text-right">{fmt(detail.totalDebit)}</TableCell>
                      <TableCell className="text-right">{fmt(detail.totalCredit)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Trial Balance ────────────────────────────────────────────────────────────

function TrialBalancePanel() {
  const { fmt } = useCurrency();
  const [params, setParams] = useState({ startDate: "", endDate: "" });
  const { data, isLoading } = useGetTrialBalance(params);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" className="h-8 text-xs w-36" value={params.startDate} onChange={e => setParams(p => ({ ...p, startDate: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" className="h-8 text-xs w-36" value={params.endDate} onChange={e => setParams(p => ({ ...p, endDate: e.target.value }))} />
        </div>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-muted-foreground">Loading…</div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Account Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Total Debit</TableHead>
                <TableHead className="text-right">Total Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data?.data?.length ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No data</TableCell></TableRow>
              ) : data.data.map(row => (
                <TableRow key={row.id} className="text-sm">
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell><AccountTypeBadge type={row.type} /></TableCell>
                  <TableCell className="text-right">{row.totalDebit > 0 ? fmt(row.totalDebit) : "—"}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{row.totalCredit > 0 ? fmt(row.totalCredit) : "—"}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(row.balance)}</TableCell>
                </TableRow>
              ))}
              {data && (
                <TableRow className="bg-muted/30 font-bold">
                  <TableCell colSpan={3} className="text-right">Grand Totals</TableCell>
                  <TableCell className="text-right">{fmt(data.grandTotalDebit)}</TableCell>
                  <TableCell className="text-right">{fmt(data.grandTotalCredit)}</TableCell>
                  <TableCell className="text-right">
                    {Math.abs(data.grandTotalDebit - data.grandTotalCredit) < 0.01 ? (
                      <span className="text-green-600">Balanced ✓</span>
                    ) : (
                      <span className="text-destructive">Out of balance!</span>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Balance Sheet ────────────────────────────────────────────────────────────

function BalanceSheetPanel() {
  const { fmt } = useCurrency();
  const [asOf, setAsOf] = useState("");
  const { data, isLoading } = useGetBalanceSheet({ asOf: asOf || undefined });

  const Section = ({ title, accounts, total, className = "" }: { title: string; accounts: any[]; total: number; className?: string }) => (
    <div className={className}>
      <h3 className="font-semibold text-sm mb-2 uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-1">
        {accounts.map((acc, i) => (
          <div key={i} className="flex justify-between text-sm px-2">
            <span className="text-muted-foreground">{acc.code} — {acc.name}</span>
            <span className="font-medium">{fmt(acc.balance)}</span>
          </div>
        ))}
        <div className="flex justify-between text-sm font-bold border-t pt-1 px-2 mt-1">
          <span>Total {title}</span>
          <span>{fmt(total)}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">As of date</Label>
          <Input type="date" className="h-8 text-xs w-40" value={asOf} onChange={e => setAsOf(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-muted-foreground">Loading…</div>
      ) : !data ? null : (
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Assets</CardTitle></CardHeader>
            <CardContent>
              <Section title="Assets" accounts={data.assets} total={data.totalAssets} />
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Liabilities</CardTitle></CardHeader>
              <CardContent>
                <Section title="Liabilities" accounts={data.liabilities} total={data.totalLiabilities} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Equity</CardTitle></CardHeader>
              <CardContent>
                <Section title="Equity" accounts={data.equity} total={data.totalEquity} />
                <div className="flex justify-between text-sm px-2 mt-2">
                  <span className="text-muted-foreground">Net Income</span>
                  <span className={`font-medium ${data.netIncome >= 0 ? "text-green-600" : "text-destructive"}`}>{fmt(data.netIncome)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {data && (
        <Card className={data.isBalanced ? "border-green-300" : "border-destructive"}>
          <CardContent className="py-3 px-4">
            <div className="flex justify-between items-center text-sm font-semibold">
              <span>Total Assets</span><span>{fmt(data.totalAssets)}</span>
            </div>
            <div className="flex justify-between items-center text-sm font-semibold mt-1">
              <span>Total Liabilities + Equity</span><span>{fmt(data.totalLiabilities + data.totalEquity + data.netIncome)}</span>
            </div>
            <div className="mt-2 text-center text-sm font-bold">
              {data.isBalanced
                ? <span className="text-green-600">Balance Sheet is Balanced ✓</span>
                : <span className="text-destructive">Balance Sheet is NOT balanced — investigate journal entries</span>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Income Statement ─────────────────────────────────────────────────────────

function IncomeStatementPanel() {
  const { fmt } = useCurrency();
  const [params, setParams] = useState({ startDate: "", endDate: "" });
  const { data, isLoading } = useGetIncomeStatement(params);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" className="h-8 text-xs w-36" value={params.startDate} onChange={e => setParams(p => ({ ...p, startDate: e.target.value }))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" className="h-8 text-xs w-36" value={params.endDate} onChange={e => setParams(p => ({ ...p, endDate: e.target.value }))} />
        </div>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-muted-foreground">Loading…</div>
      ) : !data ? null : (
        <div className="max-w-lg space-y-4">
          <div className="space-y-1">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Revenue</h3>
            {data.revenue.map((r, i) => (
              <div key={i} className="flex justify-between text-sm px-2">
                <span className="text-muted-foreground">{r.name}</span>
                <span>{fmt(r.balance)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold border-t pt-1 px-2">
              <span>Total Revenue</span><span>{fmt(data.totalRevenue)}</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-sm px-2 text-muted-foreground">
              <span>Cost of Goods Sold</span><span>({fmt(data.cogs)})</span>
            </div>
            <div className="flex justify-between text-sm font-bold border-t pt-1 px-2">
              <span>Gross Profit</span>
              <span className={data.grossProfit >= 0 ? "text-green-600" : "text-destructive"}>{fmt(data.grossProfit)}</span>
            </div>
            <div className="text-xs text-right pr-2 text-muted-foreground">Gross Margin: {data.grossMargin.toFixed(1)}%</div>
          </div>

          <div className="space-y-1">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Operating Expenses</h3>
            {data.expenses.map((e, i) => (
              <div key={i} className="flex justify-between text-sm px-2">
                <span className="text-muted-foreground">{e.name}</span>
                <span>({fmt(e.balance)})</span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold border-t pt-1 px-2">
              <span>Total Expenses</span><span>({fmt(data.operatingExpenses)})</span>
            </div>
          </div>

          <Card className={data.netIncome >= 0 ? "border-green-300" : "border-destructive"}>
            <CardContent className="py-3 px-4">
              <div className="flex justify-between font-bold">
                <span>Net {data.netIncome >= 0 ? "Profit" : "Loss"}</span>
                <span className={data.netIncome >= 0 ? "text-green-600 text-lg" : "text-destructive text-lg"}>{fmt(data.netIncome)}</span>
              </div>
              <div className="text-xs text-muted-foreground text-right mt-1">Net Margin: {data.netMargin.toFixed(1)}%</div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── AR/AP Aging ──────────────────────────────────────────────────────────────

function ArAgingPanel() {
  const { fmt } = useCurrency();
  const { data, isLoading } = useGetArAging();
  return <AgingTable fmt={fmt} data={data} isLoading={isLoading} rows={data?.customers} emptyLabel="receivables" />;
}

function ApAgingPanel() {
  const { fmt } = useCurrency();
  const { data, isLoading } = useGetApAging();
  return <AgingTable fmt={fmt} data={data} isLoading={isLoading} rows={data?.suppliers} emptyLabel="payables" />;
}

function AgingPanel({ type }: { type: "ar" | "ap" }) {
  return type === "ar" ? <ArAgingPanel /> : <ApAgingPanel />;
}

function AgingTable({ fmt, data, isLoading, rows, emptyLabel }: {
  fmt: (n: number) => string;
  data: any;
  isLoading: boolean;
  rows: any[] | undefined;
  emptyLabel: string;
}) {
  const bucketLabel: Record<string, string> = {
    current: "Current (0-30d)",
    "31-60": "31-60 days",
    "61-90": "61-90 days",
    "90+": "90+ days",
  };

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="py-10 text-center text-muted-foreground">Loading…</div>
      ) : (
        <>
          {data?.buckets && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(data.buckets).map(([bucket, amount]) => (
                <Card key={bucket}>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground">{bucketLabel[bucket] ?? bucket}</p>
                    <p className={`text-lg font-bold mt-1 ${bucket === "90+" ? "text-destructive" : bucket === "61-90" ? "text-orange-500" : "text-foreground"}`}>
                      {fmt(amount)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Bucket</TableHead>
                  <TableHead className="text-right">Days Outstanding</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!rows?.length ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No outstanding {emptyLabel}</TableCell></TableRow>
                ) : rows.map(row => (
                  <TableRow key={row.id} className="text-sm">
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">{row.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={row.bucket === "90+" ? "destructive" : row.bucket === "61-90" ? "secondary" : "outline"} className="text-xs">
                        {bucketLabel[row.bucket] ?? row.bucket}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{row.daysOutstanding}d</TableCell>
                    <TableCell className="text-right font-medium">{fmt(row.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {data && (
            <div className="text-right text-sm font-semibold">
              Total Outstanding: <span className="text-primary ml-2">{fmt(data.totalOutstanding)}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Cash Drawer ──────────────────────────────────────────────────────────────

function CashDrawerPanel() {
  const { fmt } = useCurrency();
  const selectedBranchId = useAppStore(s => s.selectedBranchId);
  const { data: current, isLoading: currentLoading } = useGetCurrentDrawer();
  const openDrawer = useOpenCashDrawer();
  const closeDrawer = useCloseCashDrawer();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [openingBalance, setOpeningBalance] = useState("0");
  const [closeForm, setCloseForm] = useState({ actualBalance: "", notes: "" });
  const [closeOpen, setCloseOpen] = useState(false);

  const handleOpen = async () => {
    try {
      await openDrawer.mutateAsync({ data: { branchId: selectedBranchId ?? undefined, openingBalance: Number(openingBalance) } });
      qc.invalidateQueries({ queryKey: ["cashDrawer"] });
      toast({ title: "Cash drawer opened" });
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  const handleClose = async () => {
    if (!current) return;
    try {
      await closeDrawer.mutateAsync({ id: current.id, data: { actualBalance: Number(closeForm.actualBalance), notes: closeForm.notes } });
      qc.invalidateQueries({ queryKey: ["cashDrawer"] });
      setCloseOpen(false);
      toast({ title: "Cash drawer closed" });
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  if (currentLoading) return <div className="py-10 text-center text-muted-foreground">Loading…</div>;

  const isOpen = current?.status === "open";

  return (
    <div className="space-y-6 max-w-lg">
      <Card className={isOpen ? "border-green-400" : "border-muted"}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Cash Drawer Status
            <Badge variant={isOpen ? "outline" : "secondary"} className={isOpen ? "text-green-700 border-green-400" : ""}>
              {isOpen ? "Open" : "Closed"}
            </Badge>
          </CardTitle>
        </CardHeader>
        {isOpen && current && (
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Opened at</span>
              <span>{fmtDate(current.openedAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Opening Balance</span>
              <span className="font-medium">{fmt(current.openingBalance)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expected Balance</span>
              <span className="font-semibold text-primary">{fmt(current.expectedBalance)}</span>
            </div>
          </CardContent>
        )}
      </Card>

      {!isOpen ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Opening Cash Balance</Label>
            <Input type="number" min="0" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} className="w-48" />
          </div>
          <Button onClick={handleOpen} disabled={openDrawer.isPending}>
            <CreditCard className="mr-2 h-4 w-4" />Open Cash Drawer
          </Button>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setCloseOpen(true)} className="text-orange-600 border-orange-300 hover:bg-orange-50">
          Close Cash Drawer & Reconcile
        </Button>
      )}

      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Close Cash Drawer</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            {current && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Opening Balance</span>
                  <span>{fmt(current.openingBalance)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Expected Balance</span>
                  <span className="text-primary">{fmt(current.expectedBalance)}</span>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Actual Cash Count</Label>
              <Input
                type="number" min="0"
                value={closeForm.actualBalance}
                onChange={e => setCloseForm(f => ({ ...f, actualBalance: e.target.value }))}
                placeholder={current ? fmt(current.expectedBalance) : "0"}
              />
              {closeForm.actualBalance && current && (
                <div className={`text-xs font-medium ${Number(closeForm.actualBalance) - current.expectedBalance >= 0 ? "text-green-600" : "text-destructive"}`}>
                  Variance: {fmt(Number(closeForm.actualBalance) - current.expectedBalance)}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={closeForm.notes} onChange={e => setCloseForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseOpen(false)}>Cancel</Button>
            <Button onClick={handleClose} disabled={closeDrawer.isPending || !closeForm.actualBalance}>
              Close Drawer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Accounting() {
  const { fmt } = useCurrency();
  const { data: trialBalance } = useGetTrialBalance({});
  const { data: incomeStatement } = useGetIncomeStatement({});
  const { data: arAging } = useGetArAging();
  const { data: apAging } = useGetApAging();
  const { data: current } = useGetCurrentDrawer();

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="h-3.5 w-3.5" />Net Income
            </div>
            <p className={`text-2xl font-bold ${(incomeStatement?.netIncome ?? 0) >= 0 ? "text-green-600" : "text-destructive"}`}>
              {fmt(incomeStatement?.netIncome ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <DollarSign className="h-3.5 w-3.5" />Total Revenue
            </div>
            <p className="text-2xl font-bold">{fmt(incomeStatement?.totalRevenue ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <FileText className="h-3.5 w-3.5" />AR Outstanding
            </div>
            <p className="text-2xl font-bold text-orange-500">{fmt(arAging?.totalOutstanding ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Scale className="h-3.5 w-3.5" />AP Outstanding
            </div>
            <p className="text-2xl font-bold text-red-500">{fmt(apAging?.totalOutstanding ?? 0)}</p>
          </CardContent>
        </Card>
      </div>

      {current?.status === "open" && (
        <Card className="border-green-300 bg-green-50/50 dark:bg-green-950/10">
          <CardContent className="py-3 px-4 flex items-center justify-between text-sm">
            <span className="font-medium text-green-700 dark:text-green-400">Cash drawer is open — Expected balance: {fmt(current.expectedBalance)}</span>
            <Badge variant="outline" className="text-green-700 border-green-400">Live</Badge>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="chart">
        <ScrollArea className="w-full">
          <TabsList className="flex w-max min-w-full">
            <TabsTrigger value="chart" className="gap-1.5"><BookOpen className="h-3.5 w-3.5" />Chart of Accounts</TabsTrigger>
            <TabsTrigger value="journal" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Journal Entries</TabsTrigger>
            <TabsTrigger value="trial" className="gap-1.5"><Scale className="h-3.5 w-3.5" />Trial Balance</TabsTrigger>
            <TabsTrigger value="bs" className="gap-1.5"><Scale className="h-3.5 w-3.5" />Balance Sheet</TabsTrigger>
            <TabsTrigger value="pnl" className="gap-1.5"><TrendingUp className="h-3.5 w-3.5" />P&amp;L</TabsTrigger>
            <TabsTrigger value="ar" className="gap-1.5"><DollarSign className="h-3.5 w-3.5" />AR Aging</TabsTrigger>
            <TabsTrigger value="ap" className="gap-1.5"><DollarSign className="h-3.5 w-3.5" />AP Aging</TabsTrigger>
            <TabsTrigger value="drawer" className="gap-1.5"><Wallet className="h-3.5 w-3.5" />Cash Drawer</TabsTrigger>
          </TabsList>
        </ScrollArea>

        <TabsContent value="chart" className="mt-4"><ChartOfAccounts /></TabsContent>
        <TabsContent value="journal" className="mt-4"><JournalEntries /></TabsContent>
        <TabsContent value="trial" className="mt-4"><TrialBalancePanel /></TabsContent>
        <TabsContent value="bs" className="mt-4"><BalanceSheetPanel /></TabsContent>
        <TabsContent value="pnl" className="mt-4"><IncomeStatementPanel /></TabsContent>
        <TabsContent value="ar" className="mt-4"><AgingPanel type="ar" /></TabsContent>
        <TabsContent value="ap" className="mt-4"><AgingPanel type="ap" /></TabsContent>
        <TabsContent value="drawer" className="mt-4"><CashDrawerPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
