import { useState } from "react";
import { useGetSalesReport, useGetProfitLossReport, useGetInventoryReport, useListExpenses, useListBranches, getListExpensesQueryKey } from "@workspace/api-client-react";
import type { Expense } from "@workspace/api-client-react";
import { useCurrency } from "@/hooks/use-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, BarChart2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = ["#2563eb","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316"];

function today() { return new Date().toISOString().split("T")[0]; }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; }

export default function Reports() {
  const { fmt } = useCurrency();
  const [branchId, setBranchId] = useState("");
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(today());

  const { data: salesReport, isLoading: salesLoading } = useGetSalesReport({
    branchId: branchId ? Number(branchId) : undefined,
    startDate: dateFrom,
    endDate: dateTo,
  });
  const { data: plReport, isLoading: plLoading } = useGetProfitLossReport({
    startDate: dateFrom,
    endDate: dateTo,
  });
  const { data: inventoryReport } = useGetInventoryReport({
    branchId: branchId ? Number(branchId) : undefined,
  });
  const { data: expenses } = useListExpenses(
    { startDate: dateFrom, endDate: dateTo },
    { query: { queryKey: getListExpensesQueryKey({ startDate: dateFrom, endDate: dateTo }) } }
  );
  const { data: branches } = useListBranches();

  const totalExpenses = expenses?.reduce((s, e) => s + Number(e.amount), 0) ?? 0;

  const expensesByCategory = Object.values(
    ((expenses ?? []) as Expense[]).reduce((acc: Record<string, { category: string; amount: number; count: number }>, e) => {
      const key = e.categoryName ?? "other";
      if (!acc[key]) acc[key] = { category: key, amount: 0, count: 0 };
      acc[key].amount += Number(e.amount);
      acc[key].count++;
      return acc;
    }, {})
  ).map(r => ({ ...r, percentage: totalExpenses > 0 ? (r.amount / totalExpenses) * 100 : 0 }));

  const summaryCards = [
    { label: "Total Revenue", value: salesReport?.totalRevenue, icon: DollarSign, color: "text-blue-600 dark:text-blue-400" },
    { label: "Gross Profit", value: plReport?.grossProfit, icon: TrendingUp, color: "text-green-600 dark:text-green-400" },
    { label: "Total Expenses", value: totalExpenses, icon: TrendingDown, color: "text-destructive" },
    { label: "Net Profit", value: plReport?.netProfit, icon: BarChart2, color: Number(plReport?.netProfit ?? 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Financial and operational analytics</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 h-8 text-sm" />
        </div>
        <Select value={branchId || "_all_"} onValueChange={v => setBranchId(v === "_all_" ? "" : v)}>
          <SelectTrigger className="w-44 h-8 text-sm">
            <SelectValue placeholder="All Branches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all_">All Branches</SelectItem>
            {branches?.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  {value === undefined ? (
                    <Skeleton className="h-7 w-24 mt-1.5" />
                  ) : (
                    <p className={`text-xl font-bold mt-1 ${color}`}>{fmt(Number(value))}</p>
                  )}
                </div>
                <Icon className={`h-8 w-8 opacity-20 ${color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="pl">Profit & Loss</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>

        {/* Sales Tab */}
        <TabsContent value="sales" className="mt-4 space-y-4">
          {salesLoading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : salesReport ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">Total Revenue</p>
                    <p className="text-2xl font-bold mt-1">{fmt(Number(salesReport.totalRevenue ?? 0))}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground">Total Sales</p>
                    <p className="text-2xl font-bold mt-1">{salesReport.totalSales ?? 0}</p>
                  </CardContent>
                </Card>
              </div>
              {salesReport.data.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Sales Data</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={salesReport.data.slice(0, 30).map((d, i) => ({ ...d as any, _idx: i }))} barSize={18}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d ? d.slice(5) : String(d)} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => fmt(v, 0)} />
                        <Tooltip />
                        <Bar dataKey="revenue" fill="#2563eb" radius={[4,4,0,0]} name="Revenue" />
                        <Bar dataKey="total" fill="#2563eb" radius={[4,4,0,0]} name="Total" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No sales data for this period</CardContent></Card>
          )}
        </TabsContent>

        {/* Profit & Loss Tab */}
        <TabsContent value="pl" className="mt-4">
          {plLoading ? <Skeleton className="h-64 w-full rounded-lg" /> : plReport ? (
            <Card>
              <CardHeader><CardTitle className="text-base">Profit & Loss Statement</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: "Revenue", value: plReport.revenue, color: "text-green-600 dark:text-green-400" },
                  { label: "Cost of Goods Sold", value: plReport.costOfGoods, color: "text-destructive" },
                  { label: "Gross Profit", value: plReport.grossProfit, color: plReport.grossProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive" },
                  ...(plReport.grossMargin !== undefined ? [{ label: "Gross Margin", value: `${plReport.grossMargin.toFixed(1)}%`, color: "text-muted-foreground", isString: true }] : []),
                  { label: "Expenses", value: plReport.expenses, color: "text-destructive" },
                  { label: "Net Profit", value: plReport.netProfit, color: plReport.netProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive", bold: true },
                  ...(plReport.netMargin !== undefined ? [{ label: "Net Margin", value: `${plReport.netMargin.toFixed(1)}%`, color: "text-muted-foreground", isString: true }] : []),
                ].map(({ label, value, color, bold, isString }) => (
                  <div key={label} className={`flex justify-between py-2.5 border-b border-border/50 last:border-0 ${bold ? "font-bold text-base" : "text-sm"}`}>
                    <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
                    <span className={color}>{isString ? String(value) : fmt(Number(value))}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No data for this period</CardContent></Card>
          )}
        </TabsContent>

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                Inventory Valuation
                {inventoryReport?.totalValue !== undefined && (
                  <span className="text-xl font-bold">{fmt(Number(inventoryReport.totalValue))}</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!inventoryReport?.data?.length ? (
                <p className="text-center py-12 text-muted-foreground">No inventory data</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(inventoryReport.data[0] ?? {}).map(k => (
                        <TableHead key={k} className="capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryReport.data.map((row, i) => (
                      <TableRow key={i}>
                        {Object.values(row as Record<string, unknown>).map((v, j) => (
                          <TableCell key={j} className="text-sm">
                            {typeof v === "number" ? (String(Object.keys(row as Record<string, unknown>)[j]).toLowerCase().includes("price") || String(Object.keys(row as Record<string, unknown>)[j]).toLowerCase().includes("value") || String(Object.keys(row as Record<string, unknown>)[j]).toLowerCase().includes("amount") || String(Object.keys(row as Record<string, unknown>)[j]).toLowerCase().includes("cost") ? fmt(Number(v)) : String(v)) : String(v ?? "—")}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Expenses Tab */}
        <TabsContent value="expenses" className="mt-4 space-y-4">
          {expensesByCategory.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">By Category</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expensesByCategory.sort((a, b) => b.amount - a.amount).map((c, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-sm capitalize">{c.category.replace("_", " ")}</TableCell>
                          <TableCell className="text-right text-sm">{c.count}</TableCell>
                          <TableCell className="text-right text-sm">{fmt(c.amount)}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{c.percentage.toFixed(1)}%</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell colSpan={2} className="text-sm">Total</TableCell>
                        <TableCell className="text-right">{fmt(totalExpenses)}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Breakdown</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={expensesByCategory} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={75}>
                        {expensesByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} />
                      <Legend formatter={(v: string) => v.replace("_", " ")} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No expense data for this period</CardContent></Card>
          )}
          {expenses && expenses.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">All Expenses</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(expenses as Expense[]).map(e => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs text-muted-foreground">{new Date(e.date).toLocaleDateString()}</TableCell>
                        <TableCell className="font-medium text-sm">{e.description}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs capitalize">{e.categoryName ?? "other"}</Badge></TableCell>
                        <TableCell className="text-right font-medium text-sm">{fmt(Number(e.amount))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
