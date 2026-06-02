import { useState, useCallback } from "react";
import { useListProducts, useListHeldSales, useCreateSale, useUpdateSale, useListCustomers, getListProductsQueryKey, getListHeldSalesQueryKey, type SaleDetail } from "@workspace/api-client-react";
import { useCartStore, useAppStore } from "@/lib/store";
import { useCurrency } from "@/hooks/use-currency";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ShoppingCart, Plus, Minus, Trash2, CreditCard, Clock, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

type PaymentMethod = "cash" | "mobile_money" | "card" | "bank_transfer" | "credit";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "credit", label: "Credit (Debt)" },
];

export default function POS() {
  const [searchTerm, setSearchTerm] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountTendered, setAmountTendered] = useState("");
  const [discountInput, setDiscountInput] = useState("0");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [completedSale, setCompletedSale] = useState<SaleDetail | null>(null);
  const [changeGiven, setChangeGiven] = useState(0);

  const selectedBranchId = useAppStore(s => s.selectedBranchId);
  const { fmt, symbol } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useListProducts(
    { search: searchTerm || undefined, active: true },
    { query: { queryKey: getListProductsQueryKey({ search: searchTerm || undefined, active: true }) } }
  );

  const { data: heldSales } = useListHeldSales({
    query: { queryKey: getListHeldSalesQueryKey() }
  });

  const { data: customers } = useListCustomers();

  const { items, addItem, removeItem, updateQuantity, clearCart, setGlobalDiscount, globalDiscount } = useCartStore();

  const subtotal = items.reduce((s, i) => s + i.sellingPrice * i.cartQuantity, 0);
  const taxAmount = items.reduce((s, i) => s + (i.sellingPrice * i.cartQuantity * (i.taxRate ?? 0)) / 100, 0);
  const discount = Number(discountInput) || 0;
  const total = Math.max(0, subtotal + taxAmount - discount);
  const tendered = Number(amountTendered) || 0;
  const change = Math.max(0, tendered - total);

  const createSale = useCreateSale();
  const updateSale = useUpdateSale();

  const handleCheckout = useCallback(async () => {
    if (!selectedBranchId) {
      toast({ title: "Select a branch first", variant: "destructive" });
      return;
    }
    if (items.length === 0) return;
    if (paymentMethod !== "credit" && tendered < total) {
      toast({ title: "Amount tendered is less than total", variant: "destructive" });
      return;
    }
    try {
      const sale = await createSale.mutateAsync({
        data: {
          branchId: selectedBranchId,
          customerId: selectedCustomerId ?? undefined,
          discountAmount: discount,
          status: "completed",
          items: items.map(i => ({
            productId: i.id,
            quantity: i.cartQuantity,
            unitPrice: i.sellingPrice,
            discountAmount: 0,
          })),
          payments: [{
            amount: paymentMethod === "credit" ? total : tendered,
            method: paymentMethod,
          }],
        }
      });
      const chg = paymentMethod !== "credit" ? Math.max(0, tendered - total) : 0;
      clearCart();
      setPaymentOpen(false);
      setAmountTendered("");
      setDiscountInput("0");
      setSelectedCustomerId(null);
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      setChangeGiven(chg);
      setCompletedSale(sale);
    } catch (e: any) {
      toast({ title: "Failed to complete sale", description: e?.message, variant: "destructive" });
    }
  }, [items, selectedBranchId, paymentMethod, tendered, total, discount, selectedCustomerId, createSale, clearCart, queryClient, toast]);

  const handleHold = useCallback(async () => {
    if (!selectedBranchId || items.length === 0) return;
    try {
      await createSale.mutateAsync({
        data: {
          branchId: selectedBranchId,
          status: "held",
          items: items.map(i => ({ productId: i.id, quantity: i.cartQuantity, unitPrice: i.sellingPrice, discountAmount: 0 })),
          payments: [],
        }
      });
      clearCart();
      queryClient.invalidateQueries({ queryKey: getListHeldSalesQueryKey() });
      toast({ title: "Sale held" });
    } catch (e: any) {
      toast({ title: "Failed to hold sale", description: e?.message, variant: "destructive" });
    }
  }, [items, selectedBranchId, createSale, clearCart, queryClient, toast]);

  const handleResume = useCallback(async (saleId: number) => {
    const held = heldSales?.find(s => s.id === saleId);
    if (!held) return;
    await updateSale.mutateAsync({ id: saleId, data: { status: "voided" } });
    setHeldOpen(false);
    toast({ title: "Sale resumed (reload items manually from the held sale)" });
  }, [heldSales, updateSale, toast]);

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 -m-4 md:-m-6 p-4 md:p-6 bg-muted/30">
      {/* Left: Products */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products or scan barcode..."
              className="pl-9 bg-background shadow-sm h-12 text-base"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
          <Button variant="outline" className="h-12 gap-2" onClick={() => setHeldOpen(true)}>
            <Clock className="h-4 w-4" />
            Held
            {heldSales && heldSales.length > 0 && <Badge variant="secondary">{heldSales.length}</Badge>}
          </Button>
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
            </div>
          ) : !products?.length ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
              <Search className="h-12 w-12 opacity-20" />
              <p className="text-sm">{searchTerm ? "No products match your search" : "No products found"}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-4">
              {products.map(product => (
                <Card
                  key={product.id}
                  className="cursor-pointer hover:border-primary hover:shadow-md transition-all active:scale-[0.98] select-none"
                  onClick={() => addItem(product)}
                >
                  <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                    <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-lg">
                      {product.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="w-full">
                      <h3 className="font-semibold text-sm line-clamp-2 leading-tight">{product.name}</h3>
                      {product.sku && <p className="text-muted-foreground text-xs mt-0.5">{product.sku}</p>}
                    </div>
                    <div className="font-bold text-primary text-base">{fmt(Number(product.sellingPrice))}</div>
                    {product.currentStock !== null && product.currentStock !== undefined && (
                      <Badge variant={Number(product.currentStock) > 0 ? "outline" : "destructive"} className="text-xs">
                        {Number(product.currentStock) > 0 ? `${product.currentStock} in stock` : "Out of stock"}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right: Cart */}
      <div className="w-96 bg-background rounded-lg border border-border shadow-sm flex flex-col shrink-0">
        <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Current Sale
          </h2>
          {items.length > 0 && (
            <Badge variant="secondary">{items.reduce((s, i) => s + i.cartQuantity, 0)} items</Badge>
          )}
        </div>

        {/* Customer */}
        <div className="px-4 pt-3 pb-2 border-b border-border">
          <Select value={selectedCustomerId?.toString() ?? "_walkin_"} onValueChange={v => setSelectedCustomerId(v === "_walkin_" ? null : Number(v))}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Walk-in Customer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_walkin_">Walk-in Customer</SelectItem>
              {customers?.map(c => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.name} {Number(c.balance) > 0 ? `(owes ${fmt(Number(c.balance))})` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="flex-1">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-center gap-2 opacity-50">
              <ShoppingCart className="h-10 w-10" />
              <p className="text-sm">Add products to begin</p>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {items.map(item => (
                <div key={item.id} className="flex flex-col gap-1.5 p-3 bg-muted/30 rounded-md border border-border/50">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-medium text-sm leading-tight flex-1">{item.name}</span>
                    <span className="font-semibold text-sm shrink-0">{fmt(item.sellingPrice * item.cartQuantity)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{fmt(Number(item.sellingPrice))} each</span>
                    <div className="flex items-center gap-1 bg-background rounded border border-border p-0.5">
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                        if (item.cartQuantity > 1) updateQuantity(item.id, item.cartQuantity - 1);
                        else removeItem(item.id);
                      }}>
                        <Minus className="h-2.5 w-2.5" />
                      </Button>
                      <span className="w-7 text-center text-xs font-medium">{item.cartQuantity}</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => updateQuantity(item.id, item.cartQuantity + 1)}>
                        <Plus className="h-2.5 w-2.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-4 border-t border-border bg-muted/10 space-y-3">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{fmt(subtotal)}</span>
            </div>
            {taxAmount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span>{fmt(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-muted-foreground">
              <span>Discount</span>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-xs">{symbol}</span>
                <Input
                  className="h-6 w-16 text-xs text-right p-1"
                  value={discountInput}
                  onChange={e => setDiscountInput(e.target.value)}
                  type="number"
                  min="0"
                />
              </div>
            </div>
            <div className="flex justify-between font-bold text-base pt-1.5 border-t border-border/60">
              <span>Total</span>
              <span>{fmt(total)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="text-destructive hover:bg-destructive/10 hover:text-destructive text-sm" onClick={clearCart} disabled={items.length === 0}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Void
            </Button>
            <Button variant="secondary" className="text-sm" onClick={handleHold} disabled={items.length === 0 || createSale.isPending}>
              <Clock className="mr-1.5 h-3.5 w-3.5" />
              Hold
            </Button>
          </div>

          <Button size="lg" className="w-full text-base h-12" disabled={items.length === 0} onClick={() => setPaymentOpen(true)}>
            <CreditCard className="mr-2 h-4 w-4" />
            Pay {fmt(total)}
          </Button>
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Complete Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
              {taxAmount > 0 && <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{fmt(taxAmount)}</span></div>}
              {discount > 0 && <div className="flex justify-between text-muted-foreground"><span>Discount</span><span>-{fmt(discount)}</span></div>}
              <div className="flex justify-between font-bold text-lg pt-1 border-t border-border"><span>Total</span><span>{fmt(total)}</span></div>
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map(m => (
                  <Button key={m.value} variant={paymentMethod === m.value ? "default" : "outline"} size="sm" className="justify-start text-xs" onClick={() => setPaymentMethod(m.value)}>
                    {m.label}
                  </Button>
                ))}
              </div>
            </div>

            {paymentMethod !== "credit" && (
              <div className="space-y-2">
                <Label>Amount Tendered</Label>
                <Input
                  type="number"
                  placeholder={fmt(total)}
                  value={amountTendered}
                  onChange={e => setAmountTendered(e.target.value)}
                  className="text-lg h-12 font-medium"
                  autoFocus
                />
                {tendered > 0 && tendered >= total && (
                  <div className="flex justify-between text-sm font-medium bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 p-2 rounded">
                    <span>Change</span>
                    <span>{fmt(change)}</span>
                  </div>
                )}
              </div>
            )}
            {paymentMethod === "credit" && selectedCustomerId && (
              <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 p-3 rounded">
                {fmt(total)} will be added to the customer's balance.
              </div>
            )}
            {paymentMethod === "credit" && !selectedCustomerId && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded">
                Select a customer above to use credit payment.
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCheckout}
              disabled={
                createSale.isPending ||
                (paymentMethod !== "credit" && tendered < total) ||
                (paymentMethod === "credit" && !selectedCustomerId)
              }
              className="flex-1"
            >
              {createSale.isPending ? "Processing..." : "Complete Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog open={!!completedSale} onOpenChange={open => { if (!open) setCompletedSale(null); }}>
        <DialogContent className="sm:max-w-sm print:shadow-none print:border-none">
          <DialogHeader>
            <DialogTitle className="text-center">Sale Receipt</DialogTitle>
          </DialogHeader>
          {completedSale && (
            <div className="space-y-3 text-sm">
              <div className="text-center space-y-0.5">
                <p className="font-bold text-base">SwiftPOS</p>
                <p className="text-muted-foreground text-xs">
                  {new Date(completedSale.createdAt).toLocaleString()}
                </p>
                <p className="font-mono text-xs text-muted-foreground">{completedSale.saleNumber}</p>
              </div>
              <Separator />
              <div className="space-y-1.5">
                {completedSale.items.map((item, i) => (
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
                  <span>Subtotal</span><span>{fmt(Number(completedSale.subtotal ?? 0))}</span>
                </div>
                {Number(completedSale.taxAmount) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax</span><span>{fmt(Number(completedSale.taxAmount))}</span>
                  </div>
                )}
                {Number(completedSale.discountAmount) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Discount</span><span>-{fmt(Number(completedSale.discountAmount))}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-1 border-t">
                  <span>Total</span><span>{fmt(Number(completedSale.total))}</span>
                </div>
                {completedSale.payments?.[0] && (
                  <>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Payment ({completedSale.payments[0].method.replace("_", " ")})</span>
                      <span>{fmt(Number(completedSale.payments[0].amount))}</span>
                    </div>
                    {changeGiven > 0 && (
                      <div className="flex justify-between font-semibold text-green-600 dark:text-green-400">
                        <span>Change</span><span>{fmt(changeGiven)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
              <Separator />
              <p className="text-center text-xs text-muted-foreground">Thank you for your purchase!</p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
              <Printer className="h-3.5 w-3.5" />Print
            </Button>
            <Button size="sm" onClick={() => setCompletedSale(null)}>New Sale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Held Sales Dialog */}
      <Dialog open={heldOpen} onOpenChange={setHeldOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Held Sales</DialogTitle>
          </DialogHeader>
          {!heldSales?.length ? (
            <p className="text-muted-foreground text-sm text-center py-6">No held sales</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {heldSales.map(sale => (
                <div key={sale.id} className="flex items-center justify-between p-3 bg-muted/30 rounded border border-border">
                  <div>
                    <p className="font-medium text-sm">{sale.saleNumber}</p>
                    <p className="text-xs text-muted-foreground">{fmt(Number(sale.total))}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleResume(sale.id)}>
                    Resume
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
