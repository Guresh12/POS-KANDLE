import { useState, useRef } from "react";
import { useListProducts, useListCategories, useCreateProduct, useUpdateProduct, useDeleteProduct, useCreateCategory, getListProductsQueryKey, getListCategoriesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Edit2, Trash2, Package, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { Product, ProductInput } from "@workspace/api-client-react";
import { useCurrency } from "@/hooks/use-currency";

const EMPTY_FORM: ProductInput = {
  name: "", sku: "", barcode: "", brand: "", unit: "pcs",
  costPrice: 0, sellingPrice: 0, taxRate: 0, reorderLevel: 0,
  description: "", categoryId: null, imageUrl: "", isActive: true,
};

export default function Products() {
  const { fmt } = useCurrency();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductInput>(EMPTY_FORM);
  const [newCatDialog, setNewCatDialog] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products, isLoading } = useListProducts(
    { search: search || undefined, categoryId: categoryId ? Number(categoryId) : undefined, active: undefined },
    { query: { queryKey: getListProductsQueryKey({ search: search || undefined, categoryId: categoryId ? Number(categoryId) : undefined }) } }
  );
  const { data: categories } = useListCategories();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const createCategory = useCreateCategory();

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ name: p.name, sku: p.sku ?? "", barcode: p.barcode ?? "", brand: p.brand ?? "", unit: p.unit ?? "pcs", costPrice: p.costPrice, sellingPrice: p.sellingPrice, taxRate: p.taxRate, reorderLevel: p.reorderLevel, description: p.description ?? "", categoryId: p.categoryId ?? null, imageUrl: (p as any).imageUrl ?? "", isActive: p.isActive });
    setDialogOpen(true);
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const created = await createCategory.mutateAsync({ data: { name: newCatName.trim(), description: newCatDesc.trim() || undefined } });
      await queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
      setForm(f => ({ ...f, categoryId: (created as any).id }));
      setNewCatDialog(false);
      setNewCatName("");
      setNewCatDesc("");
      toast({ title: "Category created" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleImageUpload = async (file: File) => {
    const ext = file.name.split(".").pop();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    setImageUploading(true);
    try {
      const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      setForm(f => ({ ...f, imageUrl: data.publicUrl }));
    } catch (e: any) {
      toast({ title: "Image upload failed", description: e.message, variant: "destructive" });
    } finally {
      setImageUploading(false);
    }
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await updateProduct.mutateAsync({ id: editing.id, data: form });
        toast({ title: "Product updated" });
      } else {
        await createProduct.mutateAsync({ data: form });
        toast({ title: "Product created" });
      }
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Deactivate this product?")) return;
    try {
      await deleteProduct.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      toast({ title: "Product deactivated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const field = (key: keyof ProductInput) => ({
    value: String(form[key] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: ["costPrice","sellingPrice","taxRate","reorderLevel"].includes(key) ? Number(e.target.value) : e.target.value })),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your product catalog</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Product</Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search products..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={categoryId || "_all_"} onValueChange={v => setCategoryId(v === "_all_" ? "" : v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all_">All Categories</SelectItem>
            {categories?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : !products?.length ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p>No products found</p>
                </TableCell>
              </TableRow>
            ) : (
              products.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{p.sku ?? "—"}</TableCell>
                  <TableCell className="text-sm">{p.categoryName ?? "—"}</TableCell>
                  <TableCell className="text-right text-sm">{fmt(Number(p.costPrice))}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(Number(p.sellingPrice))}</TableCell>
                  <TableCell className="text-right text-sm">{p.currentStock ?? 0}</TableCell>
                  <TableCell><Badge variant={p.isActive ? "default" : "secondary"}>{p.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Product" : "New Product"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Name *</Label>
              <Input {...field("name")} placeholder="Product name" />
            </div>
            <div className="space-y-1.5">
              <Label>SKU</Label>
              <Input {...field("sku")} placeholder="e.g. SKU-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Barcode</Label>
              <Input {...field("barcode")} placeholder="Barcode" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.categoryId?.toString() ?? "_none_"} onValueChange={v => {
                if (v === "_create_") { setNewCatDialog(true); return; }
                setForm(f => ({ ...f, categoryId: v === "_none_" ? null : Number(v) }));
              }}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none_">None</SelectItem>
                  {categories?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  <SelectItem value="_create_" className="text-primary font-medium border-t mt-1">+ Create new category</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Brand</Label>
              <Input {...field("brand")} placeholder="Brand name" />
            </div>
            <div className="space-y-1.5">
              <Label>Cost Price *</Label>
              <Input {...field("costPrice")} type="number" min="0" step="0.01" />
            </div>
            <div className="space-y-1.5">
              <Label>Selling Price *</Label>
              <Input {...field("sellingPrice")} type="number" min="0" step="0.01" />
            </div>
            <div className="space-y-1.5">
              <Label>Tax Rate (%)</Label>
              <Input {...field("taxRate")} type="number" min="0" step="0.1" />
            </div>
            <div className="space-y-1.5">
              <Label>Reorder Level</Label>
              <Input {...field("reorderLevel")} type="number" min="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Input {...field("unit")} placeholder="pcs, kg, litre..." />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Product Image</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }}
              />
              <div className="flex items-center gap-3">
                {(form as any).imageUrl ? (
                  <div className="relative w-16 h-16 shrink-0">
                    <img src={(form as any).imageUrl} alt="Product" className="w-16 h-16 rounded-md object-cover border border-border" />
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, imageUrl: "" }))}
                      className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-md border-2 border-dashed border-border flex items-center justify-center text-muted-foreground shrink-0">
                    <Package className="w-6 h-6 opacity-40" />
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={imageUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {imageUploading ? "Uploading…" : (form as any).imageUrl ? "Replace image" : "Upload image"}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createProduct.isPending || updateProduct.isPending || !form.name}>
              {editing ? "Update" : "Create"} Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Quick create category dialog */}
      <Dialog open={newCatDialog} onOpenChange={setNewCatDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Category</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Category name" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={newCatDesc} onChange={e => setNewCatDesc(e.target.value)} placeholder="Optional description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewCatDialog(false); setNewCatName(""); setNewCatDesc(""); }}>Cancel</Button>
            <Button onClick={handleCreateCategory} disabled={createCategory.isPending || !newCatName.trim()}>
              {createCategory.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
