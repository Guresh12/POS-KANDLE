import { useGetDashboardSummary, useGetTopProducts, useGetRecentTransactions, useGetLowStockAlerts } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, DollarSign, ShoppingCart, AlertTriangle, Users, Package } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { useGetSalesSummary } from "@workspace/api-client-react";
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
  const { data: summary, isLoading: sumLoading } = useGetDashboardSummary();
  const { data: topProducts, isLoading: topLoading } = useGetTopProducts({ limit: 8 });
  const { data: recent, isLoading: recentLoading } = useGetRecentTransactions({ limit: 6 });
  const { data: lowStock } = useGetLowStockAlerts();
  const { data: salesSummary } = useGetSalesSummary({ period: "month" });

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
            <CardTitle className="text-base">Recent Transactions</CardTitle>
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
                  <div key={txn.id} className="px-6 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{txn.saleNumber}</p>
                      <p className="text-xs text-muted-foreground">{txn.customerName}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">{fmt(txn.total)}</p>
                      <Badge variant={txn.status === "completed" ? "default" : "secondary"} className="text-xs mt-0.5">{txn.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
