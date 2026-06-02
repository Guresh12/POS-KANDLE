import { type ReactNode } from "react";
import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

import { Layout } from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import POS from "@/pages/POS";
import Products from "@/pages/Products";
import Inventory from "@/pages/Inventory";
import Customers from "@/pages/Customers";
import Suppliers from "@/pages/Suppliers";
import Purchases from "@/pages/Purchases";
import Expenses from "@/pages/Expenses";
import Reports from "@/pages/Reports";
import Restaurant from "@/pages/Restaurant";
import Settings from "@/pages/Settings";
import Accounting from "@/pages/Accounting";
import NotFound from "@/pages/not-found";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const queryClient = new QueryClient();

// What page each role lands on after login
function defaultPath(role: string): string {
  if (role === "cashier" || role === "sales") return "/pos";
  return "/dashboard";
}

// Route-level access map — mirrors NAV_ITEMS in Layout.tsx
const ROUTE_ROLES: Record<string, string[]> = {
  "/dashboard":  ["admin", "manager"],
  "/pos":        ["admin", "manager", "sales", "cashier"],
  "/products":   ["admin", "manager", "sales"],
  "/inventory":  ["admin", "manager"],
  "/customers":  ["admin", "manager", "sales"],
  "/suppliers":  ["admin", "manager"],
  "/purchases":  ["admin", "manager"],
  "/expenses":   ["admin", "manager"],
  "/reports":    ["admin", "manager"],
  "/restaurant": ["admin", "manager"],
  "/accounting": ["admin", "manager"],
  "/settings":   ["admin"],
};

function RoleGuard({ path, children }: { path: string; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  const allowed = ROUTE_ROLES[path] ?? [];
  if (!allowed.includes(user.role)) {
    return <Redirect to={defaultPath(user.role)} />;
  }
  return <>{children}</>;
}

function ProtectedApp() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  // "/" redirects to the correct landing page for this role
  const landing = defaultPath(user?.role ?? "");

  return (
    <Layout>
      <Switch>
        <Route path="/" component={() => <Redirect to={landing} />} />
        <Route path="/dashboard"  component={() => <RoleGuard path="/dashboard"><Dashboard /></RoleGuard>} />
        <Route path="/pos"        component={() => <RoleGuard path="/pos"><POS /></RoleGuard>} />
        <Route path="/products"   component={() => <RoleGuard path="/products"><Products /></RoleGuard>} />
        <Route path="/inventory"  component={() => <RoleGuard path="/inventory"><Inventory /></RoleGuard>} />
        <Route path="/customers"  component={() => <RoleGuard path="/customers"><Customers /></RoleGuard>} />
        <Route path="/suppliers"  component={() => <RoleGuard path="/suppliers"><Suppliers /></RoleGuard>} />
        <Route path="/purchases"  component={() => <RoleGuard path="/purchases"><Purchases /></RoleGuard>} />
        <Route path="/expenses"   component={() => <RoleGuard path="/expenses"><Expenses /></RoleGuard>} />
        <Route path="/reports"    component={() => <RoleGuard path="/reports"><Reports /></RoleGuard>} />
        <Route path="/restaurant" component={() => <RoleGuard path="/restaurant"><Restaurant /></RoleGuard>} />
        <Route path="/accounting" component={() => <RoleGuard path="/accounting"><Accounting /></RoleGuard>} />
        <Route path="/settings"   component={() => <RoleGuard path="/settings"><Settings /></RoleGuard>} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light">
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ProtectedApp />
            </AuthProvider>
          </QueryClientProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
