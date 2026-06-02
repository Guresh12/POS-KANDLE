import { useState } from "react";
import { useListSuppliers, useGetSupplier, useCreateSupplier, useUpdateSupplier, useDeleteSupplier, getListSuppliersQueryKey } from "@workspace/api-client-react";
import type { SupplierInput, Supplier } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Edit2, Trash2, Truck, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const EMPTY: SupplierInput = { name: "", phone: "", email: "", address: "" };

export default function Suppliers() {
  const { fmt } = useCurrency();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SupplierInput>(EMPTY);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: suppliers, isLoading } = useListSuppliers(
    { search: search || undefined },
    { query: { queryKey: getListSuppliersQueryKey({ search: search || undefined }) } }
  );
  const { data: supplierDetail } = useGetSupplier(viewId!, {
    query: { enabled: viewId !== null, queryKey: ["supplier", viewId] }
  });

  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const del = useDeleteSupplier();

  const openCreate = () => { setEditingId(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (s: Supplier) => {
    setEditingId(s.id);
    setForm({ name: s.name, phone: s.phone ?? "", email: s.email ?? "", address: s.address ?? "" });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, data: form });
        toast({ title: "Supplier updated" });
      } else {
        await create.mutateAsync({ data: form });
        toast({ title: "Supplier created" });
      }
      qc.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this supplier?")) return;
    try {
      await del.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
      toast({ title: "Supplier deleted" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const f = (key: keyof SupplierInput) => ({
    value: String(form[key] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [key]: e.target.value })),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Suppliers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your supplier database</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Supplier</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search suppliers..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Address</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="w-28"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
            ) : !suppliers?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                  <Truck className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No suppliers yet</p>
                </TableCell>
              </TableRow>
            ) : (suppliers as Supplier[]).map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.phone ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.email ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground truncate max-w-xs">{s.address ?? "—"}</TableCell>
                <TableCell className="text-right text-sm font-medium">
                  {Number(s.balance ?? 0) > 0 ? (
                    <span className="text-destructive">{fmt(Number(s.balance))}</span>
                  ) : (
                    <span className="text-muted-foreground">$0.00</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewId(s.id)}><Eye className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Edit2 className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId ? "Edit Supplier" : "New Supplier"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Name *</Label><Input {...f("name")} placeholder="Supplier company name" /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input {...f("phone")} placeholder="+1 234 567 8900" /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input {...f("email")} type="email" placeholder="email@supplier.com" /></div>
            <div className="space-y-1.5"><Label>Address</Label><Input {...f("address")} placeholder="Street address" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={create.isPending || update.isPending || !form.name}>
              {editingId ? "Update" : "Create"} Supplier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={viewId !== null} onOpenChange={open => !open && setViewId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{supplierDetail?.name ?? "Supplier Details"}</DialogTitle>
          </DialogHeader>
          {supplierDetail && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: "Phone", value: supplierDetail.phone ?? "—" },
                  { label: "Email", value: supplierDetail.email ?? "—" },
                  { label: "Address", value: supplierDetail.address ?? "—" },
                  { label: "Balance", value: fmt(Number(supplierDetail.balance ?? 0)) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-muted/50 rounded p-3">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <p className="font-medium text-sm">{value}</p>
                  </div>
                ))}
              </div>
              {supplierDetail.transactions && supplierDetail.transactions.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Transactions</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {supplierDetail.transactions.map((t, i) => (
                      <div key={i} className="flex justify-between text-sm p-2 bg-muted/30 rounded">
                        <span className="text-muted-foreground text-xs">{new Date(t.createdAt).toLocaleDateString()}</span>
                        <span className="capitalize">{t.type.replace("_", " ")}{t.notes ? ` — ${t.notes}` : ""}</span>
                        <span className={Number(t.amount) >= 0 ? "text-destructive" : "text-green-600"}>{fmt(Number(t.amount))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { if (supplierDetail) { openEdit(supplierDetail as unknown as Supplier); setViewId(null); } }}>
              <Edit2 className="mr-2 h-3.5 w-3.5" />Edit
            </Button>
            <Button onClick={() => setViewId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
