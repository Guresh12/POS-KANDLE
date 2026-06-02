import { useState } from "react";
import { useListRestaurantTables, useListRestaurantOrders, useCreateRestaurantOrder, useUpdateRestaurantOrder, useListProducts, getListRestaurantTablesQueryKey, getListRestaurantOrdersQueryKey, getListProductsQueryKey } from "@workspace/api-client-react";
import type { RestaurantOrder, RestaurantTable } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, X, UtensilsCrossed, Clock, CheckCircle2, ChefHat } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCurrency } from "@/hooks/use-currency";

type OrderItem = { productId: number; productName: string; quantity: number; unitPrice: number };

const TABLE_STATUS_COLORS: Record<string, string> = {
  available: "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300",
  occupied: "bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300",
  reserved: "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300",
};

const ORDER_STATUS_ICONS: Record<string, React.ElementType> = {
  pending: Clock, preparing: ChefHat, ready: CheckCircle2, served: CheckCircle2,
};

const nextStatus: Record<string, string> = { pending: "preparing", preparing: "ready", ready: "served" };

export default function Restaurant() {
  const { fmt } = useCurrency();
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [newItemProductId, setNewItemProductId] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: tables } = useListRestaurantTables({
    query: { queryKey: getListRestaurantTablesQueryKey() }
  });
  const { data: orders, isLoading: ordersLoading } = useListRestaurantOrders(
    { status: "pending" },
    { query: { queryKey: getListRestaurantOrdersQueryKey({ status: "pending" }) } }
  );
  const { data: products } = useListProducts({ active: true }, {
    query: { queryKey: getListProductsQueryKey({ active: true }) }
  });
  const createOrder = useCreateRestaurantOrder();
  const updateOrder = useUpdateRestaurantOrder();

  const openOrderDialog = (tableId?: number) => {
    setSelectedTableId(tableId ?? null);
    setOrderItems([]);
    setOrderDialogOpen(true);
  };

  const addItem = () => {
    const product = products?.find(p => p.id === Number(newItemProductId));
    if (!product) return;
    setOrderItems(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) return prev.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + Number(newItemQty) } : i);
      return [...prev, { productId: product.id, productName: product.name, quantity: Number(newItemQty), unitPrice: Number(product.sellingPrice) }];
    });
    setNewItemProductId("");
    setNewItemQty("1");
  };

  const orderTotal = orderItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  const handleCreateOrder = async () => {
    if (orderItems.length === 0) {
      toast({ title: "Add items to the order", variant: "destructive" }); return;
    }
    try {
      await createOrder.mutateAsync({
        data: {
          tableId: selectedTableId ?? undefined,
          orderType: selectedTableId ? "dine_in" : "take_away",
          items: orderItems.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
        }
      });
      qc.invalidateQueries({ queryKey: getListRestaurantOrdersQueryKey() });
      qc.invalidateQueries({ queryKey: getListRestaurantTablesQueryKey() });
      setOrderDialogOpen(false);
      toast({ title: "Order placed" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleStatusUpdate = async (orderId: number, status: string) => {
    try {
      await updateOrder.mutateAsync({ id: orderId, data: { status: status as any } });
      qc.invalidateQueries({ queryKey: getListRestaurantOrdersQueryKey() });
      qc.invalidateQueries({ queryKey: getListRestaurantTablesQueryKey() });
      toast({ title: `Order marked as ${status}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Restaurant</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Table management and order tracking</p>
        </div>
        <Button onClick={() => openOrderDialog()}><Plus className="mr-2 h-4 w-4" />New Order</Button>
      </div>

      <Tabs defaultValue="tables">
        <TabsList>
          <TabsTrigger value="tables">Tables</TabsTrigger>
          <TabsTrigger value="orders">
            Active Orders
            {orders && orders.length > 0 && <Badge variant="secondary" className="ml-2 text-xs">{orders.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tables" className="mt-4">
          {!tables?.length ? (
            <div className="text-center py-16 text-muted-foreground">
              <UtensilsCrossed className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No tables configured</p>
              <p className="text-sm mt-1">Set up tables in Settings to manage restaurant seating</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {(tables as RestaurantTable[]).map(table => (
                <button
                  key={table.id}
                  className={`border-2 rounded-xl p-4 text-left transition-all hover:shadow-md ${TABLE_STATUS_COLORS[table.status] ?? TABLE_STATUS_COLORS.available}`}
                  onClick={() => table.status === "available" ? openOrderDialog(table.id) : undefined}
                >
                  <p className="font-bold text-lg">{table.name}</p>
                  <p className="text-xs mt-0.5">{table.capacity} seats</p>
                  <Badge variant="outline" className="mt-2 text-xs capitalize border-current">{table.status}</Badge>
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          {ordersLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3].map(i => <div key={i} className="h-48 bg-muted/50 rounded-xl animate-pulse" />)}
            </div>
          ) : !orders?.length ? (
            <div className="text-center py-16 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No active orders</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(orders as RestaurantOrder[]).map(order => {
                const Icon = ORDER_STATUS_ICONS[order.status] ?? Clock;
                const next = nextStatus[order.status];
                return (
                  <Card key={order.id} className="flex flex-col">
                    <div className={`px-4 py-3 rounded-t-lg flex items-center justify-between ${order.status === "pending" ? "bg-amber-50 dark:bg-amber-950/30" : order.status === "preparing" ? "bg-blue-50 dark:bg-blue-950/30" : "bg-green-50 dark:bg-green-950/30"}`}>
                      <div>
                        <p className="font-bold text-sm">Order #{order.id}</p>
                        {order.tableName && <p className="text-xs text-muted-foreground mt-0.5">{order.tableName}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize text-xs">{order.status}</Badge>
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                    <CardContent className="flex-1 p-4">
                      <div className="space-y-1.5">
                        {order.items?.map((item, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span>{item.quantity}× {item.productName}</span>
                            <span className="text-muted-foreground">{fmt(item.quantity * item.unitPrice)}</span>
                          </div>
                        ))}
                      </div>
                      {order.total !== undefined && (
                        <div className="mt-3 pt-3 border-t border-border flex justify-between font-semibold text-sm">
                          <span>Total</span>
                          <span>{fmt(Number(order.total))}</span>
                        </div>
                      )}
                    </CardContent>
                    {next && (
                      <div className="px-4 pb-4">
                        <Button size="sm" className="w-full capitalize" variant="outline" onClick={() => handleStatusUpdate(order.id, next)}>
                          Mark as {next}
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Order Dialog */}
      <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              New Order
              {selectedTableId && tables && ` — ${(tables as RestaurantTable[]).find(t => t.id === selectedTableId)?.name}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Select value={newItemProductId} onValueChange={v => setNewItemProductId(v)}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  {products?.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} — {fmt(Number(p.sellingPrice))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={newItemQty} onValueChange={setNewItemQty}>
                <SelectTrigger className="w-16"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5,6,7,8,9,10].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={addItem} disabled={!newItemProductId}><Plus className="h-4 w-4" /></Button>
            </div>

            <ScrollArea className="max-h-56">
              {orderItems.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-6">Add items to the order</p>
              ) : (
                <div className="space-y-2">
                  {orderItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-muted/40 rounded-md">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.quantity}× {item.productName}</p>
                      </div>
                      <span className="text-sm font-medium">{fmt(item.quantity * item.unitPrice)}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground shrink-0" onClick={() => setOrderItems(prev => prev.filter((_, j) => j !== i))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {orderItems.length > 0 && (
              <div className="flex justify-between font-semibold pt-2 border-t border-border text-sm">
                <span>Total</span>
                <span>{fmt(orderTotal)}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateOrder} disabled={createOrder.isPending || orderItems.length === 0}>
              {createOrder.isPending ? "Sending..." : "Place Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
