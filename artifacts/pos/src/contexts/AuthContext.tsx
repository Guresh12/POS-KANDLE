import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

if (API_URL) {
  setBaseUrl(API_URL);
}

export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  role: string;
  branchId: number | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Admin login via Supabase (email + password) */
  adminLogin: (email: string, password: string) => Promise<void>;
  /** Cashier login via 4-digit PIN */
  posLogin: (email: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PIN_TOKEN_KEY = "swiftpos_pin_token";
const PIN_USER_KEY = "swiftpos_pin_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore Supabase session or stored PIN token on mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Check Supabase session first
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.access_token) {
        setAuthTokenGetter(() => session.access_token);
        // Fetch the DB user from /api/users/me
        try {
          const resp = await fetch(`${API_URL ?? ""}/api/users/me`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (resp.ok && !cancelled) {
            const dbUser = await resp.json();
            setUser(dbUser);
          }
        } catch {
          // ignore – will retry on next render
        }
        if (!cancelled) setIsLoading(false);
        return;
      }

      // Check stored PIN token
      const pinToken = localStorage.getItem(PIN_TOKEN_KEY);
      const pinUserRaw = localStorage.getItem(PIN_USER_KEY);
      if (pinToken && pinUserRaw) {
        try {
          const pinUser = JSON.parse(pinUserRaw) as AuthUser;
          setAuthTokenGetter(() => pinToken);
          if (!cancelled) setUser(pinUser);
        } catch {
          localStorage.removeItem(PIN_TOKEN_KEY);
          localStorage.removeItem(PIN_USER_KEY);
        }
      }

      if (!cancelled) setIsLoading(false);
    }

    init();

    // Listen for Supabase auth state changes (token refresh, sign-out)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_OUT") {
          setAuthTokenGetter(null);
          setUser(null);
          return;
        }

        if (session?.access_token) {
          setAuthTokenGetter(() => session.access_token);
        }
      },
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const adminLogin = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);

    const token = data.session.access_token;
    setAuthTokenGetter(() => token);

    // Fetch DB user (auto-provisioned by requireAuth on first call)
    const resp = await fetch(`${API_URL ?? ""}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error("Failed to fetch user profile");

    const dbUser = await resp.json();
    setUser(dbUser);
  }, []);

  const posLogin = useCallback(async (email: string, pin: string) => {
    const resp = await fetch(`${API_URL ?? ""}/api/auth/pos-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, pin }),
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(body.error ?? "Login failed");
    }

    const { token, user: pinUser } = await resp.json();
    localStorage.setItem(PIN_TOKEN_KEY, token);
    localStorage.setItem(PIN_USER_KEY, JSON.stringify(pinUser));
    setAuthTokenGetter(() => token);
    setUser(pinUser);
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(PIN_TOKEN_KEY);
    localStorage.removeItem(PIN_USER_KEY);
    setAuthTokenGetter(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        adminLogin,
        posLogin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
