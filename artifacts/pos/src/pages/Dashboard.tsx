import { useState } from "react";
import { useGetDashboardSummary, useGetTopProducts, useGetRecentTransactions, useGetLowStockAlerts, useGetSalesSummary, useGetSale } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { TrendingUp, DollarSign, AlertTriangle, Users, Printer, Receipt } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useCurrency } from "@/hooks/use-currency";

function StatCard({ title, value, icon: Icon, sub, loading }: { title: string; value: string; icon: any; sub?: string; loading?: boolean }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {loading ? <Skeleton className="h-8 w-28 mt-1" /> : <p className="text-2xl font-bold mt-1">{value}</p>}
            {sub && !loading && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { fmt } = useCurrency();
  const [receiptSaleId, setReceiptSaleId] = useState<number | null>(null);
  const { data: summary, isLoading: sumLoading } = useGetDashboardSummary();
  const { data: topProducts, isLoading: topLoading } = useGetTopProducts({ limit: 8 });
  const { data: recent, isLoading: recentLoading } = useGetRecentTransactions({ limit: 6 });
  const { data: lowStock } = useGetLowStockAlerts();
  const { data: salesSummary } = useGetSalesSummary({ period: "month" });
  const { data: receiptSale, isLoading: receiptLoading } = useGetSale(
    receiptSaleId ?? 0,
    { query: { enabled: !!receiptSaleId, queryKey: ["sale", receiptSaleId] } }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Business overview and key metrics</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Today's Revenue" value={sumLoading ? "" : fmt(summary?.todayRevenue ?? 0)} icon={DollarSign} sub={`${summary?.todaySales ?? 0} sales`} loading={sumLoading} />
        <StatCard title="Month Revenue" value={sumLoading ? "" : fmt(summary?.monthRevenue ?? 0)} icon={TrendingUp} sub={`${summary?.monthSales ?? 0} sales`} loading={sumLoading} />
        <StatCard title="Net Profit" value={sumLoading ? "" : fmt(summary?.totalProfit ?? 0)} icon={TrendingUp} loading={sumLoading} />
        <StatCard title="Debtors" value={sumLoading ? "" : fmt(summary?.outstandingDebtors ?? 0)} icon={Users} sub="Outstanding" loading={sumLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sales Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Sales This Month</CardTitle>
          </CardHeader>
          <CardContent>
            {!salesSummary?.dailyBreakdown ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={[...salesSummary.dailyBreakdown].reverse()} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt(v, 0)} />
                  <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={l => `Date: ${l}`} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Low Stock Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Low Stock
              {lowStock && lowStock.length > 0 && <Badge variant="destructive" className="ml-auto">{lowStock.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!lowStock?.length ? (
              <p className="text-muted-foreground text-sm px-6 pb-6">All stock levels are healthy.</p>
            ) : (
              <div className="divide-y divide-border">
                {lowStock.slice(0, 6).map(item => (
                  <div key={item.productId} className="px-6 py-3 flex justify-between items-center">
                    <div>
                      <p className="font-medium text-sm">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">{item.sku ?? "—"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-destructive text-sm">{item.currentStock}</p>
                      <p className="text-xs text-muted-foreground">min {item.reorderLevel}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Products</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {topLoading ? (
              <div className="space-y-3 px-6 pb-6">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : !topProducts?.length ? (
              <p className="text-muted-foreground text-sm px-6 pb-6">No sales data yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {topProducts.slice(0, 6).map((p, i) => (
                  <div key={p.productId} className="px-6 py-3 flex items-center gap-3">
                    <span className="text-muted-foreground text-sm w-5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{p.productName}</p>
                      <p className="text-xs text-muted-foreground">{p.totalQuantity} units sold</p>
                    </div>
                    <span className="font-semibold text-sm">{fmt(p.totalRevenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Recent Transactions
              <Receipt className="h-4 w-4 text-muted-foreground ml-auto" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentLoading ? (
              <div className="space-y-3 px-6 pb-6">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : !recent?.length ? (
              <p className="text-muted-foreground text-sm px-6 pb-6">No transactions yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {recent.map(txn => (
                  <div key={txn.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{txn.saleNumber}</p>
                      <p className="text-xs text-muted-foreground">{txn.customerName}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-sm">{fmt(txn.total)}</p>
                      <Badge variant={txn.status === "completed" ? "default" : "secondary"} className="text-xs mt-0.5">{txn.status}</Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                      title="View receipt"
                      onClick={() => setReceiptSaleId(txn.id)}
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Receipt Dialog */}
      <Dialog open={!!receiptSaleId} onOpenChange={open => { if (!open) setReceiptSaleId(null); }}>
        <DialogContent className="sm:max-w-sm print:shadow-none print:border-none">
          <DialogHeader>
            <DialogTitle className="text-center">Receipt</DialogTitle>
          </DialogHeader>
          {receiptLoading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-5 w-full" />)}
            </div>
          ) : receiptSale ? (
            <div className="space-y-3 text-sm">
              <div className="text-center space-y-0.5">
                <p className="font-bold text-base">SwiftPOS</p>
                <p className="text-muted-foreground text-xs">{new Date((receiptSale as any).createdAt).toLocaleString()}</p>
                <p className="font-mono text-xs text-muted-foreground">{(receiptSale as any).saleNumber}</p>
                {(receiptSale as any).customerName && (
                  <p className="text-xs text-muted-foreground">Customer: {(receiptSale as any).customerName}</p>
                )}
              </div>
              <Separator />
              <div className="space-y-1.5">
                {(receiptSale as any).items?.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">{item.quantity} × {fmt(item.unitPrice)}</p>
                    </div>
                    <span className="font-medium shrink-0">{fmt(item.total)}</span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span><span>{fmt(Number((receiptSale as any).subtotal ?? 0))}</span>
                </div>
                {Number((receiptSale as any).taxAmount) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax</span><span>{fmt(Number((receiptSale as any).taxAmount))}</span>
                  </div>
                )}
                {Number((receiptSale as any).discountAmount) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Discount</span><span>-{fmt(Number((receiptSale as any).discountAmount))}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-1 border-t">
                  <span>Total</span><span>{fmt(Number((receiptSale as any).total))}</span>
                </div>
                {(receiptSale as any).payments?.[0] && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Payment ({(receiptSale as any).payments[0].method.replace("_", " ")})</span>
                    <span>{fmt(Number((receiptSale as any).payments[0].amount))}</span>
                  </div>
                )}
              </div>
              <Separator />
              <p className="text-center text-xs text-muted-foreground">Thank you for your purchase!</p>
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
              <Printer className="h-3.5 w-3.5" />Print
            </Button>
            <Button size="sm" onClick={() => setReceiptSaleId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
