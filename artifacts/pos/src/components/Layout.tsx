import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useTheme } from "./ThemeProvider";
import { useGetCurrentUser, useListBranches } from "@workspace/api-client-react";
import { useAppStore } from "@/lib/store";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Users,
  Truck,
  ShoppingBag,
  Receipt,
  BarChart3,
  UtensilsCrossed,
  BookOpen,
  Settings,
  LogOut,
  Moon,
  Sun,
  Menu
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

type Role = "admin" | "manager" | "sales" | "cashier";

const NAV_ITEMS: { href: string; label: string; icon: React.ElementType; roles: Role[] }[] = [
  { href: "/dashboard",  label: "Dashboard",      icon: LayoutDashboard, roles: ["admin", "manager"] },
  { href: "/pos",        label: "Point of Sale",   icon: ShoppingCart,    roles: ["admin", "manager", "sales", "cashier"] },
  { href: "/products",   label: "Products",        icon: Package,         roles: ["admin", "manager", "sales"] },
  { href: "/inventory",  label: "Inventory",       icon: Boxes,           roles: ["admin", "manager"] },
  { href: "/customers",  label: "Customers",       icon: Users,           roles: ["admin", "manager", "sales"] },
  { href: "/suppliers",  label: "Suppliers",       icon: Truck,           roles: ["admin", "manager"] },
  { href: "/purchases",  label: "Purchases",       icon: ShoppingBag,     roles: ["admin", "manager"] },
  { href: "/expenses",   label: "Expenses",        icon: Receipt,         roles: ["admin", "manager"] },
  { href: "/reports",    label: "Reports",         icon: BarChart3,       roles: ["admin", "manager"] },
  { href: "/restaurant", label: "Restaurant",      icon: UtensilsCrossed, roles: ["admin", "manager"] },
  { href: "/accounting", label: "Accounting",      icon: BookOpen,        roles: ["admin", "manager"] },
  { href: "/settings",   label: "Settings",        icon: Settings,        roles: ["admin"] },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const { logout } = useAuth();

  const { data: user, isLoading: userLoading } = useGetCurrentUser();
  const { data: branches } = useListBranches();

  const { setUser, selectedBranchId, setSelectedBranchId } = useAppStore();

  useEffect(() => {
    if (user) {
      setUser(user);
      if (!selectedBranchId && user.branchId) {
        setSelectedBranchId(user.branchId);
      } else if (!selectedBranchId && branches && branches.length > 0) {
        setSelectedBranchId(branches[0].id);
      }
    }
  }, [user, branches, selectedBranchId, setUser, setSelectedBranchId]);

  if (userLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const userRole = (user?.role ?? "") as Role;
  const navItems = NAV_ITEMS.filter(item => item.roles.includes(userRole));

  const NavLinks = () => (
    <>
      {navItems.map((item) => {
        const isActive = location.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href}>
            <Button
              variant={isActive ? "secondary" : "ghost"}
              className={`w-full justify-start ${isActive ? "font-semibold" : "font-normal text-muted-foreground"}`}
            >
              <item.icon className="mr-2 h-5 w-5" />
              {item.label}
            </Button>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold">S</div>
          <span className="font-bold text-xl tracking-tight">SwiftPOS</span>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <nav className="space-y-1 px-2">
            <NavLinks />
          </nav>
        </div>
        <div className="p-4 border-t border-border space-y-1">
          <div className="px-2 py-1.5">
            <p className="text-sm font-medium leading-none">{user?.name || user?.email}</p>
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">{user?.role}</p>
          </div>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={logout}>
            <LogOut className="mr-2 h-5 w-5" />
            Sign Out
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <div className="p-4 border-b flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold">S</div>
                  <span className="font-bold text-xl tracking-tight">SwiftPOS</span>
                </div>
                <div className="py-4">
                  <nav className="space-y-1 px-2">
                    <NavLinks />
                  </nav>
                </div>
              </SheetContent>
            </Sheet>

            <h1 className="text-xl font-semibold hidden sm:block">
              {navItems.find(i => location.startsWith(i.href))?.label || "SwiftPOS"}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {branches && branches.length > 0 && (
              <Select
                value={selectedBranchId?.toString()}
                onValueChange={(v) => setSelectedBranchId(parseInt(v, 10))}
              >
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue placeholder="Select Branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map(b => (
                    <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </Button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto bg-background p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
