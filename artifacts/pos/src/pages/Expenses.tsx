import { useState } from "react";
import { useListExpenses, useCreateExpense, useUpdateExpense, useDeleteExpense, useListBranches, useListExpenseCategories, getListExpensesQueryKey } from "@workspace/api-client-react";
import type { ExpenseInput, Expense } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit2, Trash2, Receipt } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/hooks/use-currency";
import { Card, CardContent } from "@/components/ui/card";

type ExpenseForm = {
  description: string;
  amount: string;
  date: string;
  categoryId: string;
  branchId: string;
  reference: string;
};

const EMPTY: ExpenseForm = {
  description: "",
  amount: "",
  date: new Date().toISOString().split("T")[0],
  categoryId: "",
  branchId: "",
  reference: "",
};

export default function Expenses() {
  const { fmt } = useCurrency();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ExpenseForm>(EMPTY);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: expenses, isLoading } = useListExpenses(
    {},
    { query: { queryKey: getListExpensesQueryKey({}) } }
  );
  const { data: branches } = useListBranches();
  const { data: categories } = useListExpenseCategories();
  const create = useCreateExpense();
  const update = useUpdateExpense();
  const del = useDeleteExpense();

  const totalAmount = expenses?.reduce((s, e) => s + Number(e.amount), 0) ?? 0;

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY);
    setDialogOpen(true);
  };
  const openEdit = (e: Expense) => {
    setEditingId(e.id);
    setForm({
      description: e.description,
      amount: String(e.amount),
      date: e.date?.split("T")[0] ?? new Date().toISOString().split("T")[0],
      categoryId: String(e.categoryId ?? ""),
      branchId: String(e.branchId ?? ""),
      reference: e.reference ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.description || !form.amount) {
      toast({ title: "Fill required fields", variant: "destructive" }); return;
    }
    try {
      const data: ExpenseInput = {
        description: form.description,
        amount: Number(form.amount),
        date: form.date,
        categoryId: form.categoryId ? Number(form.categoryId) : undefined,
        branchId: form.branchId ? Number(form.branchId) : undefined,
        reference: form.reference || undefined,
      };
      if (editingId) {
        await update.mutateAsync({ id: editingId, data });
        toast({ title: "Expense updated" });
      } else {
        await create.mutateAsync({ data });
        toast({ title: "Expense recorded" });
      }
      qc.invalidateQueries({ queryKey: getListExpensesQueryKey() });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this expense?")) return;
    try {
      await del.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: getListExpensesQueryKey() });
      toast({ title: "Expense deleted" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const sf = (key: keyof ExpenseForm) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [key]: e.target.value })),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track business expenses</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Expense</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold mt-1">{fmt(totalAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Count</p>
            <p className="text-2xl font-bold mt-1">{expenses?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Average</p>
            <p className="text-2xl font-bold mt-1">{fmt(expenses?.length ? totalAmount / expenses.length : 0)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
              ))
            ) : !expenses?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                  <Receipt className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="font-medium">No expenses recorded</p>
                </TableCell>
              </TableRow>
            ) : (expenses as Expense[]).map(e => (
              <TableRow key={e.id}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(e.date).toLocaleDateString()}
                </TableCell>
                <TableCell className="font-medium text-sm">{e.description}</TableCell>
                <TableCell>
                  {e.categoryName
                    ? <Badge variant="outline" className="text-xs capitalize">{e.categoryName}</Badge>
                    : <span className="text-muted-foreground text-xs">—</span>
                  }
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{e.reference ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold text-sm">{fmt(Number(e.amount))}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(e)}><Edit2 className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId ? "Edit Expense" : "Record Expense"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Input {...sf("description")} placeholder="e.g. Office rent May 2026" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Amount *</Label>
                <Input {...sf("amount")} type="number" min="0" step="0.01" placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Date *</Label>
                <Input {...sf("date")} type="date" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.categoryId || "_none_"} onValueChange={v => setForm(p => ({ ...p, categoryId: v === "_none_" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none_">None</SelectItem>
                  {categories?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Select value={form.branchId || "_none_"} onValueChange={v => setForm(p => ({ ...p, branchId: v === "_none_" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none_">None</SelectItem>
                  {branches?.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference</Label>
              <Input {...sf("reference")} placeholder="e.g. Invoice #123" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={create.isPending || update.isPending || !form.description || !form.amount}>
              {editingId ? "Update" : "Save"} Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
