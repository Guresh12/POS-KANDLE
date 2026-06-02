import { useState } from "react";
import { useListPurchases, useCreatePurchase, useUpdatePurchase, getListPurchasesQueryKey, useListSuppliers, useListBranches, useListProducts, getListProductsQueryKey } from "@workspace/api-client-react";
import type { PurchaseInput, PurchaseStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, X, ShoppingBag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";

type ItemDraft = { productId: number; productName: string; quantity: number; unitCost: number; totalCost: number };

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary", received: "default", partial: "outline", paid: "default",
};

export default function Purchases() {
  const { fmt } = useCurrency();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [form, setForm] = useState({ supplierId: "", branchId: "", invoiceNumber: "", notes: "" });
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [newItem, setNewItem] = useState({ productId: "", quantity: "1", unitCost: "" });
  const { toast } = useToast();
  const qc = useQueryClient();

  const filterParams = { status: statusFilter as PurchaseStatus || undefined };
  const { data: purchases, isLoading } = useListPurchases(filterParams, {
    query: { queryKey: getListPurchasesQueryKey(filterParams) }
  });
  const { data: suppliers } = useListSuppliers();
  const { data: branches } = useListBranches();
  const { data: products } = useListProducts({ active: true }, {
    query: { queryKey: getListProductsQueryKey({ active: true }) }
  });
  const create = useCreatePurchase();
  const update = useUpdatePurchase();

  const openCreate = () => {
    setForm({ supplierId: "", branchId: "", invoiceNumber: "", notes: "" });
    setItems([]);
    setNewItem({ productId: "", quantity: "1", unitCost: "" });
    setDialogOpen(true);
  };

  const addItem = () => {
    const product = products?.find(p => p.id === Number(newItem.productId));
    if (!product || !newItem.quantity) return;
    const qty = Number(newItem.quantity);
    const cost = Number(newItem.unitCost) || Number(product.costPrice);
    setItems(prev => [...prev, { productId: product.id, productName: product.name, quantity: qty, unitCost: cost, totalCost: qty * cost }]);
    setNewItem({ productId: "", quantity: "1", unitCost: "" });
  };

  const total = items.reduce((s, i) => s + i.totalCost, 0);

  const handleSave = async () => {
    if (!form.supplierId || items.length === 0) {
      toast({ title: "Select a supplier and add at least one item", variant: "destructive" }); return;
    }
    try {
      const data: PurchaseInput = {
        supplierId: Number(form.supplierId),
        branchId: form.branchId ? Number(form.branchId) : undefined,
        invoiceNumber: form.invoiceNumber || undefined,
        notes: form.notes || undefined,
        items: items.map(i => ({ productId: i.productId, quantity: i.quantity, unitCost: i.unitCost, totalCost: i.totalCost })),
      };
      await create.mutateAsync({ data });
      qc.invalidateQueries({ queryKey: getListPurchasesQueryKey() });
      setDialogOpen(false);
      toast({ title: "Purchase order created" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleMarkReceived = async (id: number) => {
    try {
      await update.mutateAsync({ id, data: { status: "received" } });
      qc.invalidateQueries({ queryKey: getListPurchasesQueryKey() });
      toast({ title: "Purchase marked as received" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Purchases</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Purchase orders and supplier invoices</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New Purchase Order</Button>
      </div>

      <Select value={statusFilter || "_all_"} onValueChange={v => setStatusFilter(v === "_all_" ? "" : v)}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all_">All Statuses</SelectItem>
          {["pending","received","partial","paid"].map(s => (
            <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
            ) : !purchases?.length ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
                  <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No purchase orders yet</p>
                </TableCell>
              </TableRow>
            ) : purchases.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium text-sm">{p.invoiceNumber ?? `PO-${p.id}`}</TableCell>
                <TableCell className="text-sm">{p.supplierName}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="text-right font-semibold text-sm">{fmt(Number(p.totalAmount))}</TableCell>
                <TableCell className="text-right text-sm text-green-600">{fmt(Number(p.paidAmount))}</TableCell>
                <TableCell className="text-right text-sm text-destructive">{fmt(Number(p.balanceDue ?? 0))}</TableCell>
                <TableCell><Badge variant={STATUS_COLORS[p.status] ?? "secondary"} className="capitalize">{p.status}</Badge></TableCell>
                <TableCell>
                  {p.status === "pending" && (
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleMarkReceived(p.id)}>
                      Mark Received
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Supplier *</Label>
                <Select value={form.supplierId} onValueChange={v => setForm(f => ({ ...f, supplierId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>{suppliers?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Branch</Label>
                <Select value={form.branchId} onValueChange={v => setForm(f => ({ ...f, branchId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>{branches?.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Invoice Number</Label>
                <Input value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} placeholder="e.g. INV-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Items</Label>
              <div className="flex gap-2">
                <Select value={newItem.productId} onValueChange={v => {
                  const p = products?.find(x => x.id === Number(v));
                  setNewItem(n => ({ ...n, productId: v, unitCost: String(p?.costPrice ?? "") }));
                }}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>{products?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="w-20" type="number" min="1" placeholder="Qty" value={newItem.quantity} onChange={e => setNewItem(n => ({ ...n, quantity: e.target.value }))} />
                <Input className="w-24" type="number" min="0" step="0.01" placeholder="Cost" value={newItem.unitCost} onChange={e => setNewItem(n => ({ ...n, unitCost: e.target.value }))} />
                <Button variant="outline" onClick={addItem} disabled={!newItem.productId}><Plus className="h-4 w-4" /></Button>
              </div>

              {items.length > 0 && (
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="py-2">Product</TableHead>
                        <TableHead className="py-2 text-right">Qty</TableHead>
                        <TableHead className="py-2 text-right">Unit Cost</TableHead>
                        <TableHead className="py-2 text-right">Total</TableHead>
                        <TableHead className="w-8 py-2"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm py-2">{item.productName}</TableCell>
                          <TableCell className="text-right text-sm py-2">{item.quantity}</TableCell>
                          <TableCell className="text-right text-sm py-2">{fmt(item.unitCost)}</TableCell>
                          <TableCell className="text-right text-sm py-2 font-medium">{fmt(item.totalCost)}</TableCell>
                          <TableCell className="py-2">
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setItems(prev => prev.filter((_, j) => j !== i))}>
                              <X className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-semibold">
                        <TableCell colSpan={3} className="py-2 text-sm">Total</TableCell>
                        <TableCell className="text-right py-2">{fmt(total)}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={create.isPending || !form.supplierId || items.length === 0}>
              {create.isPending ? "Creating..." : "Create Purchase Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
