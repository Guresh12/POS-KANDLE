import { useState } from "react";
import { useListPurchases, useCreatePurchase, useUpdatePurchase, getListPurchasesQueryKey, useListSuppliers, useCreateSupplier, getListSuppliersQueryKey, useListBranches, useListProducts, useCreateProduct, getListProductsQueryKey, useListCategories, getListCategoriesQueryKey } from "@workspace/api-client-react";
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
  const [newSupplierDialog, setNewSupplierDialog] = useState(false);
  const [newSupplierForm, setNewSupplierForm] = useState({ name: "", phone: "", email: "", address: "" });
  const [newProductDialog, setNewProductDialog] = useState(false);
  const [newProductForm, setNewProductForm] = useState({ name: "", costPrice: "", sellingPrice: "", unit: "pcs", categoryId: "" });
  const { toast } = useToast();
  const qc = useQueryClient();

  const filterParams = { status: statusFilter as PurchaseStatus || undefined };
  const { data: purchases, isLoading } = useListPurchases(filterParams, {
    query: { queryKey: getListPurchasesQueryKey(filterParams) }
  });
  const { data: suppliers } = useListSuppliers();
  const createSupplier = useCreateSupplier();
  const { data: branches } = useListBranches();
  const { data: products } = useListProducts({ active: true }, {
    query: { queryKey: getListProductsQueryKey({ active: true }) }
  });
  const { data: categories } = useListCategories();
  const create = useCreatePurchase();
  const update = useUpdatePurchase();
  const createProduct = useCreateProduct();

  const openCreate = () => {
    setForm({ supplierId: "", branchId: "", invoiceNumber: "", notes: "" });
    setItems([]);
    setNewItem({ productId: "", quantity: "1", unitCost: "" });
    setDialogOpen(true);
  };

  const handleCreateSupplier = async () => {
    if (!newSupplierForm.name.trim()) return;
    try {
      const created = await createSupplier.mutateAsync({ data: { name: newSupplierForm.name.trim(), phone: newSupplierForm.phone || undefined, email: newSupplierForm.email || undefined, address: newSupplierForm.address || undefined } });
      await qc.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
      setForm(f => ({ ...f, supplierId: String((created as any).id) }));
      setNewSupplierDialog(false);
      setNewSupplierForm({ name: "", phone: "", email: "", address: "" });
      toast({ title: "Supplier created" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleCreateProduct = async () => {
    if (!newProductForm.name.trim() || !newProductForm.costPrice) return;
    try {
      const created = await createProduct.mutateAsync({
        data: {
          name: newProductForm.name.trim(),
          costPrice: Number(newProductForm.costPrice),
          sellingPrice: Number(newProductForm.sellingPrice) || Number(newProductForm.costPrice),
          unit: newProductForm.unit || "pcs",
          categoryId: newProductForm.categoryId ? Number(newProductForm.categoryId) : null,
          sku: "", barcode: "", brand: "", taxRate: 0, reorderLevel: 0, description: "", isActive: true,
        }
      });
      await qc.invalidateQueries({ queryKey: getListProductsQueryKey({ active: true }) });
      const cost = Number(newProductForm.costPrice);
      setNewItem(n => ({ ...n, productId: String((created as any).id), unitCost: String(cost) }));
      setNewProductDialog(false);
      setNewProductForm({ name: "", costPrice: "", sellingPrice: "", unit: "pcs", categoryId: "" });
      toast({ title: "Product created" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
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
                <Select value={form.supplierId} onValueChange={v => {
                  if (v === "_create_") { setNewSupplierDialog(true); return; }
                  setForm(f => ({ ...f, supplierId: v }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    {suppliers?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    <SelectItem value="_create_" className="text-primary font-medium border-t mt-1">+ Create new supplier</SelectItem>
                  </SelectContent>
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
                  if (v === "_create_") { setNewProductDialog(true); return; }
                  const p = products?.find(x => x.id === Number(v));
                  setNewItem(n => ({ ...n, productId: v, unitCost: String(p?.costPrice ?? "") }));
                }}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    {products?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                    <SelectItem value="_create_" className="text-primary font-medium border-t mt-1">+ Create new product</SelectItem>
                  </SelectContent>
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
      {/* Quick create product dialog */}
      <Dialog open={newProductDialog} onOpenChange={setNewProductDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Product</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={newProductForm.name} onChange={e => setNewProductForm(f => ({ ...f, name: e.target.value }))} placeholder="Product name" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cost Price *</Label>
                <Input type="number" min="0" step="0.01" value={newProductForm.costPrice} onChange={e => setNewProductForm(f => ({ ...f, costPrice: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Selling Price</Label>
                <Input type="number" min="0" step="0.01" value={newProductForm.sellingPrice} onChange={e => setNewProductForm(f => ({ ...f, sellingPrice: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input value={newProductForm.unit} onChange={e => setNewProductForm(f => ({ ...f, unit: e.target.value }))} placeholder="pcs, kg…" />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={newProductForm.categoryId || "_none_"} onValueChange={v => setNewProductForm(f => ({ ...f, categoryId: v === "_none_" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none_">None</SelectItem>
                    {categories?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewProductDialog(false); setNewProductForm({ name: "", costPrice: "", sellingPrice: "", unit: "pcs", categoryId: "" }); }}>Cancel</Button>
            <Button onClick={handleCreateProduct} disabled={createProduct.isPending || !newProductForm.name.trim() || !newProductForm.costPrice}>
              {createProduct.isPending ? "Creating..." : "Create Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick create supplier dialog */}
      <Dialog open={newSupplierDialog} onOpenChange={setNewSupplierDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Supplier</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={newSupplierForm.name} onChange={e => setNewSupplierForm(f => ({ ...f, name: e.target.value }))} placeholder="Supplier name" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={newSupplierForm.phone} onChange={e => setNewSupplierForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone number" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={newSupplierForm.email} onChange={e => setNewSupplierForm(f => ({ ...f, email: e.target.value }))} placeholder="Email address" />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input value={newSupplierForm.address} onChange={e => setNewSupplierForm(f => ({ ...f, address: e.target.value }))} placeholder="Address" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewSupplierDialog(false); setNewSupplierForm({ name: "", phone: "", email: "", address: "" }); }}>Cancel</Button>
            <Button onClick={handleCreateSupplier} disabled={createSupplier.isPending || !newSupplierForm.name.trim()}>
              {createSupplier.isPending ? "Creating..." : "Create Supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
