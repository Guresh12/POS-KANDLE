import { useState } from "react";
import { useListInventory, useListInventoryTransactions, useCreateInventoryTransaction, useListBranches, useListProducts, getListInventoryQueryKey, getListInventoryTransactionsQueryKey, getListProductsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, Boxes } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";

const TX_TYPES = ["stock_in","stock_out","adjustment","transfer_out","damaged","return"];

export default function Inventory() {
  const { fmt } = useCurrency();
  const [branchId, setBranchId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ productId: "", branchId: "", type: "stock_in", quantityChanged: "", notes: "", reference: "" });
  const { toast } = useToast();
  const qc = useQueryClient();

  const params = { branchId: branchId ? Number(branchId) : undefined };

  const { data: inventory, isLoading } = useListInventory(params, {
    query: { queryKey: getListInventoryQueryKey(params) }
  });
  const { data: transactions, isLoading: txLoading } = useListInventoryTransactions(params, {
    query: { queryKey: getListInventoryTransactionsQueryKey(params) }
  });
  const { data: branches } = useListBranches();
  const { data: products } = useListProducts({ active: true }, {
    query: { queryKey: getListProductsQueryKey({ active: true }) }
  });
  const createTxn = useCreateInventoryTransaction();

  const handleSubmit = async () => {
    if (!form.productId || !form.branchId || !form.quantityChanged) return;
    try {
      await createTxn.mutateAsync({
        data: {
          productId: Number(form.productId),
          branchId: Number(form.branchId),
          type: form.type as any,
          quantityChanged: Number(form.quantityChanged),
          notes: form.notes || undefined,
          reference: form.reference || undefined,
        }
      });
      qc.invalidateQueries({ queryKey: getListInventoryQueryKey() });
      qc.invalidateQueries({ queryKey: getListInventoryTransactionsQueryKey() });
      setDialogOpen(false);
      setForm({ productId: "", branchId: "", type: "stock_in", quantityChanged: "", notes: "", reference: "" });
      toast({ title: "Inventory updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const txBadge = (type: string): "default" | "destructive" | "secondary" | "outline" => {
    if (["stock_in","purchase","transfer_in","return"].includes(type)) return "default";
    if (["stock_out","sale","damaged"].includes(type)) return "destructive";
    return "secondary";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track stock levels and movements</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />Stock Adjustment
        </Button>
      </div>

      <Select value={branchId || "_all_"} onValueChange={v => setBranchId(v === "_all_" ? "" : v)}>
        <SelectTrigger className="w-52">
          <SelectValue placeholder="All Branches" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all_">All Branches</SelectItem>
          {branches?.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Tabs defaultValue="levels">
        <TabsList>
          <TabsTrigger value="levels">Stock Levels</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="levels" className="mt-4">
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Reorder</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  ))
                ) : !inventory?.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                      <Boxes className="h-10 w-10 mx-auto mb-3 opacity-20" />
                      <p className="font-medium">No inventory records</p>
                      <p className="text-sm mt-1">Add stock to get started</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  inventory.map((item, i) => {
                    const low = Number(item.quantity) <= Number(item.reorderLevel);
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{item.sku ?? "—"}</TableCell>
                        <TableCell className="text-sm">{item.branchName}</TableCell>
                        <TableCell className={`text-right font-semibold ${low ? "text-destructive" : ""}`}>{item.quantity}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{item.reorderLevel}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(Number(item.totalValue))}</TableCell>
                        <TableCell><Badge variant={low ? "destructive" : "outline"}>{low ? "Low" : "OK"}</Badge></TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Before</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">After</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  ))
                ) : !transactions?.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No transactions yet</TableCell>
                  </TableRow>
                ) : (
                  transactions.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(t.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell className="font-medium text-sm">{t.productName}</TableCell>
                      <TableCell className="text-sm">{t.branchName}</TableCell>
                      <TableCell><Badge variant={txBadge(t.type)} className="text-xs capitalize">{t.type.replace(/_/g, " ")}</Badge></TableCell>
                      <TableCell className="text-right text-sm">{t.quantityBefore}</TableCell>
                      <TableCell className={`text-right text-sm font-semibold ${Number(t.quantityChanged) > 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                        {Number(t.quantityChanged) > 0 ? "+" : ""}{t.quantityChanged}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">{t.quantityAfter}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.reference ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Stock Adjustment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Product *</Label>
              <Select value={form.productId} onValueChange={v => setForm(f => ({ ...f, productId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>{products?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Branch *</Label>
              <Select value={form.branchId} onValueChange={v => setForm(f => ({ ...f, branchId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>{branches?.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Transaction Type *</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TX_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity *</Label>
              <Input type="number" min="0" value={form.quantityChanged} onChange={e => setForm(f => ({ ...f, quantityChanged: e.target.value }))} placeholder="Enter quantity" />
            </div>
            <div className="space-y-1.5">
              <Label>Reference</Label>
              <Input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="e.g. PO-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional note" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createTxn.isPending || !form.productId || !form.branchId || !form.quantityChanged}>
              {createTxn.isPending ? "Saving..." : "Save Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
