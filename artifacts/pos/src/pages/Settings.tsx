import { useState, useEffect } from "react";
import { useListBranches, useCreateBranch, useUpdateBranch, useListCategories, useCreateCategory, useUpdateCategory, useDeleteCategory, useGetSettings, useUpdateSettings, useListUsers, useCreateUser, useUpdateUser, getListBranchesQueryKey, getListCategoriesQueryKey, getListUsersQueryKey } from "@workspace/api-client-react";
import type { BranchInput, CategoryInput, SettingsUpdate, UserInput, User, Branch, Category } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, Edit2, Trash2, Building2, Tag, Users, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

const CURRENCIES = ["USD","EUR","GBP","GHS","KES","NGN","ZAR","UGX","TZS","RWF","ETB","MAD","EGP","XOF"];
const TIMEZONES = ["UTC","Africa/Accra","Africa/Lagos","Africa/Nairobi","Africa/Cairo","Africa/Johannesburg","America/New_York","America/Chicago","America/Los_Angeles","Europe/London","Europe/Paris","Asia/Dubai","Asia/Kolkata","Asia/Singapore"];

export default function Settings() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [branchDialog, setBranchDialog] = useState(false);
  const [editBranchId, setEditBranchId] = useState<number | null>(null);
  const [branchForm, setBranchForm] = useState<BranchInput>({ name: "", address: "", phone: "", email: "" });

  const [catDialog, setCatDialog] = useState(false);
  const [editCatId, setEditCatId] = useState<number | null>(null);
  const [catForm, setCatForm] = useState<CategoryInput>({ name: "", description: "" });

  const [settingsForm, setSettingsForm] = useState<SettingsUpdate>({});
  const [settingsDirty, setSettingsDirty] = useState(false);

  const [userDialog, setUserDialog] = useState(false);
  const [userForm, setUserForm] = useState<UserInput & { pin?: string }>({ email: "", name: "", role: "cashier", branchId: null, pin: "" });
  const [pinDialog, setPinDialog] = useState<{ userId: number; name: string } | null>(null);
  const [newPin, setNewPin] = useState("");

  const { data: branches, isLoading: branchLoading } = useListBranches();
  const { data: categories, isLoading: catLoading } = useListCategories();
  const { data: settings } = useGetSettings();
  const { data: users, isLoading: usersLoading } = useListUsers();

  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const updateSettings = useUpdateSettings();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  useEffect(() => {
    if (settings && !settingsDirty) {
      setSettingsForm({
        businessName: settings.businessName ?? "",
        currency: settings.currency ?? "USD",
        timezone: settings.timezone ?? "UTC",
        taxRate: settings.taxRate ?? 0,
        receiptFooter: settings.receiptFooter ?? "",
        businessType: settings.businessType ?? "",
      });
    }
  }, [settings, settingsDirty]);

  const handleSaveSettings = async () => {
    try {
      await updateSettings.mutateAsync({ data: settingsForm });
      setSettingsDirty(false);
      toast({ title: "Settings saved" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const sf = <K extends keyof SettingsUpdate>(key: K, val: SettingsUpdate[K]) => {
    setSettingsForm(p => ({ ...p, [key]: val }));
    setSettingsDirty(true);
  };

  const openCreateBranch = () => {
    setEditBranchId(null);
    setBranchForm({ name: "", address: "", phone: "", email: "" });
    setBranchDialog(true);
  };
  const openEditBranch = (b: Branch) => {
    setEditBranchId(b.id);
    setBranchForm({ name: b.name, address: b.address ?? "", phone: b.phone ?? "", email: b.email ?? "" });
    setBranchDialog(true);
  };
  const handleSaveBranch = async () => {
    try {
      if (editBranchId) await updateBranch.mutateAsync({ id: editBranchId, data: branchForm });
      else await createBranch.mutateAsync({ data: branchForm });
      qc.invalidateQueries({ queryKey: getListBranchesQueryKey() });
      setBranchDialog(false);
      toast({ title: editBranchId ? "Branch updated" : "Branch created" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const openCreateCat = () => { setEditCatId(null); setCatForm({ name: "", description: "" }); setCatDialog(true); };
  const openEditCat = (c: Category) => { setEditCatId(c.id); setCatForm({ name: c.name, description: c.description ?? "" }); setCatDialog(true); };
  const handleSaveCat = async () => {
    try {
      if (editCatId) await updateCategory.mutateAsync({ id: editCatId, data: catForm });
      else await createCategory.mutateAsync({ data: catForm });
      qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
      setCatDialog(false);
      toast({ title: editCatId ? "Category updated" : "Category created" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };
  const handleDeleteCat = async (id: number) => {
    if (!confirm("Delete this category?")) return;
    try {
      await deleteCategory.mutateAsync({ id });
      qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
      toast({ title: "Category deleted" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleRoleChange = async (userId: number, role: string) => {
    try {
      await updateUser.mutateAsync({ id: userId, data: { role: role as any } });
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: "User role updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleToggleActive = async (u: User) => {
    try {
      await updateUser.mutateAsync({ id: u.id, data: { isActive: !u.isActive } });
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: u.isActive ? "User deactivated" : "User activated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleCreateUser = async () => {
    try {
      const data: UserInput = {
        email: userForm.email.toLowerCase().trim(),
        name: userForm.name || undefined,
        role: userForm.role,
        branchId: userForm.branchId ?? null,
        ...(userForm.pin ? { pin: userForm.pin } : {}),
      };
      await createUser.mutateAsync({ data });
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setUserDialog(false);
      setUserForm({ email: "", name: "", role: "cashier", branchId: null, pin: "" });
      toast({ title: "User created" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleSetPin = async () => {
    if (!pinDialog) return;
    if (!/^\d{4}$/.test(newPin)) {
      toast({ title: "PIN must be exactly 4 digits", variant: "destructive" });
      return;
    }
    try {
      await updateUser.mutateAsync({ id: pinDialog.userId, data: { pin: newPin } });
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setPinDialog(null);
      setNewPin("");
      toast({ title: "PIN updated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure your business</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="general"><Globe className="h-3.5 w-3.5 mr-1.5" />General</TabsTrigger>
          <TabsTrigger value="branches"><Building2 className="h-3.5 w-3.5 mr-1.5" />Branches</TabsTrigger>
          <TabsTrigger value="categories"><Tag className="h-3.5 w-3.5 mr-1.5" />Categories</TabsTrigger>
          <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1.5" />Users & Roles</TabsTrigger>
        </TabsList>

        {/* General */}
        <TabsContent value="general" className="mt-5 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Business Information</CardTitle>
              <CardDescription>Basic details about your business</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Business Name</Label>
                <Input value={settingsForm.businessName ?? ""} onChange={e => sf("businessName", e.target.value)} placeholder="Your Business Name" />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={settingsForm.currency ?? "USD"} onValueChange={v => sf("currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Timezone</Label>
                <Select value={settingsForm.timezone ?? "UTC"} onValueChange={v => sf("timezone", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIMEZONES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Default Tax Rate (%)</Label>
                <Input type="number" min="0" step="0.1" value={settingsForm.taxRate ?? 0} onChange={e => sf("taxRate", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Business Type</Label>
                <Select value={settingsForm.businessType ?? "retail"} onValueChange={v => sf("businessType", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["retail","restaurant","wholesale","service","pharmacy","supermarket"].map(t => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Receipt Footer</Label>
                <Input value={settingsForm.receiptFooter ?? ""} onChange={e => sf("receiptFooter", e.target.value)} placeholder="Thank you for your business!" />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={!settingsDirty || updateSettings.isPending}>
              {updateSettings.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </TabsContent>

        {/* Branches */}
        <TabsContent value="branches" className="mt-5">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-semibold">Branches</h3>
              <p className="text-sm text-muted-foreground">Manage your business locations</p>
            </div>
            <Button size="sm" onClick={openCreateBranch}><Plus className="mr-2 h-4 w-4" />Add Branch</Button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branchLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  ))
                ) : !branches?.length ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No branches yet</TableCell></TableRow>
                ) : (branches as Branch[]).map(b => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{b.phone ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{b.email ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-xs">{b.address ?? "—"}</TableCell>
                    <TableCell><Badge variant={b.isActive ? "default" : "secondary"}>{b.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditBranch(b)}><Edit2 className="h-3.5 w-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Categories */}
        <TabsContent value="categories" className="mt-5">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-semibold">Product Categories</h3>
              <p className="text-sm text-muted-foreground">Organise your product catalog</p>
            </div>
            <Button size="sm" onClick={openCreateCat}><Plus className="mr-2 h-4 w-4" />Add Category</Button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 3 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  ))
                ) : !categories?.length ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-10 text-muted-foreground">No categories yet</TableCell></TableRow>
                ) : (categories as Category[]).map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.description ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditCat(c)}><Edit2 className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteCat(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Users */}
        <TabsContent value="users" className="mt-5">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-semibold">Users & Roles</h3>
              <p className="text-sm text-muted-foreground">Manage team access and cashier PINs</p>
            </div>
            <Button size="sm" onClick={() => setUserDialog(true)}><Plus className="mr-2 h-4 w-4" />Add User</Button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>PIN</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  ))
                ) : !users?.length ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No users yet</TableCell></TableRow>
                ) : (users as User[]).map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.branchName ?? "All"}</TableCell>
                    <TableCell>
                      <Select value={u.role} onValueChange={v => handleRoleChange(u.id, v)}>
                        <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="sales">Sales</SelectItem>
                          <SelectItem value="cashier">Cashier</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => { setPinDialog({ userId: u.id, name: u.name ?? u.email }); setNewPin(""); }}
                      >
                        {u.hasPin ? "Change PIN" : "Set PIN"}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Switch checked={u.isActive} onCheckedChange={() => handleToggleActive(u)} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <Badge variant={u.isActive ? "default" : "secondary"} className="text-xs">
                        {u.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Branch Dialog */}
      <Dialog open={branchDialog} onOpenChange={setBranchDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editBranchId ? "Edit Branch" : "New Branch"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Name *</Label><Input value={branchForm.name} onChange={e => setBranchForm(p => ({ ...p, name: e.target.value }))} placeholder="Branch name" /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={branchForm.phone ?? ""} onChange={e => setBranchForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input value={branchForm.email ?? ""} onChange={e => setBranchForm(p => ({ ...p, email: e.target.value }))} type="email" /></div>
            <div className="space-y-1.5"><Label>Address</Label><Input value={branchForm.address ?? ""} onChange={e => setBranchForm(p => ({ ...p, address: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBranchDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveBranch} disabled={createBranch.isPending || updateBranch.isPending || !branchForm.name}>
              {editBranchId ? "Update" : "Create"} Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editCatId ? "Edit Category" : "New Category"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Name *</Label><Input value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))} placeholder="Category name" /></div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={catForm.description ?? ""} onChange={e => setCatForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveCat} disabled={createCategory.isPending || updateCategory.isPending || !catForm.name}>
              {editCatId ? "Update" : "Create"} Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={userDialog} onOpenChange={setUserDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" value={userForm.email} onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))} placeholder="user@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={userForm.name ?? ""} onChange={e => setUserForm(p => ({ ...p, name: e.target.value }))} placeholder="Full name" />
            </div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select value={userForm.role} onValueChange={v => setUserForm(p => ({ ...p, role: v as UserInput["role"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Select value={userForm.branchId?.toString() ?? "none"} onValueChange={v => setUserForm(p => ({ ...p, branchId: v === "none" ? null : Number(v) }))}>
                <SelectTrigger><SelectValue placeholder="All branches" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All branches</SelectItem>
                  {(branches as Branch[] ?? []).map(b => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>PIN (4 digits, for cashier login)</Label>
              <Input
                type="password"
                maxLength={4}
                value={userForm.pin ?? ""}
                onChange={e => setUserForm(p => ({ ...p, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                placeholder="Optional — set now or later"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateUser} disabled={createUser.isPending || !userForm.email || !userForm.role}>
              {createUser.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set / Change PIN Dialog */}
      <Dialog open={!!pinDialog} onOpenChange={open => { if (!open) { setPinDialog(null); setNewPin(""); } }}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>{pinDialog?.name ? `PIN for ${pinDialog.name}` : "Set PIN"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Enter a 4-digit PIN the cashier will use to log in.</p>
            <div className="space-y-1.5">
              <Label>New PIN *</Label>
              <Input
                type="password"
                maxLength={4}
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="4 digits"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPinDialog(null); setNewPin(""); }}>Cancel</Button>
            <Button onClick={handleSetPin} disabled={updateUser.isPending || newPin.length !== 4}>
              {updateUser.isPending ? "Saving..." : "Save PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
