import { useState } from "react";
import { useListCustomers, useGetCustomer, useCreateCustomer, useUpdateCustomer, useDeleteCustomer, getListCustomersQueryKey } from "@workspace/api-client-react";
import type { CustomerInput, Customer, CustomerDetail } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, Edit2, Trash2, Eye, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";

const EMPTY: CustomerInput = { name: "", phone: "", email: "", address: "" };

export default function Customers() {
  const { fmt } = useCurrency();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CustomerInput>(EMPTY);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: customers, isLoading } = useListCustomers({ search: search || undefined }, {
    query: { queryKey: getListCustomersQueryKey({ search: search || undefined }) }
  });
  const { data: customerDetail } = useGetCustomer(viewId!, {
    query: { enabled: viewId !== null, queryKey: ["customer", viewId] }
  });

  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const del = useDeleteCustomer();

  const openCreate = () => { setEditingId(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (c: Customer | CustomerDetail) => {
    setEditingId(c.id);
    setForm({ name: c.name, phone: c.phone ?? "", email: c.email ?? "", address: c.address ?? "" });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, data: form });
        toast({ title: "Customer updated" });
      } else {
        await create.mutateAsync({ data: form });
        toast({ title: "Customer created" });
      }
      qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this customer?")) return;
    try {
      await del.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      toast({ title: "Customer deleted" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const f = (key: keyof CustomerInput) => ({
    value: String(form[key] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [key]: e.target.value })),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your customer accounts</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Customer</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search customers..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
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
            ) : !customers?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No customers yet</p>
                </TableCell>
              </TableRow>
            ) : (customers as Customer[]).map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.phone ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.email ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground truncate max-w-xs">{c.address ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <span className={Number(c.balance ?? 0) > 0 ? "text-destructive font-semibold" : "text-muted-foreground text-sm"}>
                    {fmt(Number(c.balance ?? 0))}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewId(c.id)}><Eye className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Edit2 className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
          <DialogHeader><DialogTitle>{editingId ? "Edit Customer" : "New Customer"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Name *</Label><Input {...f("name")} placeholder="Full name" /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input {...f("phone")} placeholder="+1 234 567 8900" /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input {...f("email")} type="email" placeholder="email@example.com" /></div>
            <div className="space-y-1.5"><Label>Address</Label><Input {...f("address")} placeholder="Street address" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={create.isPending || update.isPending || !form.name}>
              {editingId ? "Update" : "Create"} Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={viewId !== null} onOpenChange={open => !open && setViewId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{customerDetail?.name ?? "Customer Details"}</DialogTitle>
          </DialogHeader>
          {customerDetail && (
            <Tabs defaultValue="info">
              <TabsList>
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="transactions">
                  Transactions
                  {customerDetail.transactions?.length > 0 && <span className="ml-1.5 text-xs">({customerDetail.transactions.length})</span>}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="info" className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: "Balance", value: fmt(Number(customerDetail.balance)), highlight: Number(customerDetail.balance) > 0 },
                    { label: "Total Purchases", value: fmt(Number(customerDetail.totalPurchases ?? 0)) },
                    { label: "Phone", value: customerDetail.phone ?? "—" },
                    { label: "Email", value: customerDetail.email ?? "—" },
                    { label: "Address", value: customerDetail.address ?? "—" },
                  ].map(({ label, value, highlight }) => (
                    <div key={label} className="bg-muted/50 rounded p-3">
                      <p className="text-xs text-muted-foreground mb-1">{label}</p>
                      <p className={`font-medium text-sm ${highlight ? "text-destructive font-bold" : ""}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="transactions" className="mt-4">
                {!customerDetail.transactions?.length ? (
                  <p className="text-muted-foreground text-sm text-center py-8">No transactions yet</p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {(customerDetail as CustomerDetail).transactions.map((t, i) => (
                      <div key={i} className="flex justify-between items-center p-3 bg-muted/30 rounded text-sm">
                        <div>
                          <p className="font-medium capitalize">{t.type.replace("_", " ")}</p>
                          {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}
                          <p className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</p>
                        </div>
                        <span className={`font-semibold ${Number(t.amount) >= 0 ? "text-destructive" : "text-green-600"}`}>
                          {Number(t.amount) >= 0 ? "+" : ""}{fmt(Math.abs(Number(t.amount)))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { if (customerDetail) { openEdit(customerDetail); setViewId(null); } }}>
              <Edit2 className="mr-2 h-3.5 w-3.5" />Edit
            </Button>
            <Button onClick={() => setViewId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
