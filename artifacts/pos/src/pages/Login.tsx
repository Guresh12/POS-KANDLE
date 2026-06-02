import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Delete } from "lucide-react";

// ── PIN Keypad ────────────────────────────────────────────────────────────────

function PinDots({ value }: { value: string }) {
  return (
    <div className="flex gap-3 justify-center my-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`w-4 h-4 rounded-full border-2 transition-all ${
            i < value.length
              ? "bg-primary border-primary"
              : "border-muted-foreground/40"
          }`}
        />
      ))}
    </div>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

function PinKeypad({ onComplete }: { onComplete: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  function handleKey(key: string) {
    setError("");
    if (key === "del") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) {
      onComplete(next);
      // Reset after a brief visual delay
      setTimeout(() => setPin(""), 300);
    }
  }

  return (
    <div className="flex flex-col items-center">
      <PinDots value={pin} />
      {error && <p className="text-sm text-destructive mb-2">{error}</p>}
      <div className="grid grid-cols-3 gap-3 w-56">
        {KEYS.map((key, i) =>
          key === "" ? (
            <div key={i} />
          ) : (
            <Button
              key={key}
              variant={key === "del" ? "outline" : "secondary"}
              size="lg"
              className="h-14 text-xl font-semibold"
              onClick={() => handleKey(key)}
              type="button"
            >
              {key === "del" ? <Delete className="h-5 w-5" /> : key}
            </Button>
          ),
        )}
      </div>
    </div>
  );
}

// ── Admin Login Form ──────────────────────────────────────────────────────────

function AdminLoginForm() {
  const { adminLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await adminLogin(email, password);
    } catch (err: any) {
      setError(err.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="admin@yourstore.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in…" : "Sign In"}
      </Button>
    </form>
  );
}

// ── Cashier PIN Form ──────────────────────────────────────────────────────────

function CashierPinForm() {
  const { posLogin } = useAuth();
  const [email, setEmail] = useState("");
  const [pinReady, setPinReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleEmailNext(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim()) setPinReady(true);
  }

  async function handlePinComplete(pin: string) {
    if (!email.trim()) return;
    setError("");
    setLoading(true);
    try {
      await posLogin(email.trim(), pin);
    } catch (err: any) {
      setError(err.message ?? "Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  if (!pinReady) {
    return (
      <form onSubmit={handleEmailNext} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="cashier-email">Your Email</Label>
          <Input
            id="cashier-email"
            type="email"
            placeholder="cashier@yourstore.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <Button type="submit" className="w-full">
          Continue
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-center text-muted-foreground">
        Enter your 4-digit PIN for <strong>{email}</strong>
      </p>
      {loading && <p className="text-sm text-center text-muted-foreground">Signing in…</p>}
      {error && <p className="text-sm text-center text-destructive">{error}</p>}
      <PinKeypad onComplete={handlePinComplete} />
      <Button
        variant="ghost"
        size="sm"
        className="w-full mt-2 text-muted-foreground"
        onClick={() => { setError(""); setPinReady(false); }}
      >
        ← Back
      </Button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="bg-card rounded-2xl border border-border shadow-xl w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-2xl mb-3">
            S
          </div>
          <h1 className="text-2xl font-bold tracking-tight">SwiftPOS</h1>
          <p className="text-sm text-muted-foreground mt-1">Cloud Point of Sale</p>
        </div>

        <Tabs defaultValue="admin">
          <TabsList className="w-full mb-6">
            <TabsTrigger value="admin" className="flex-1">
              Manager / Admin
            </TabsTrigger>
            <TabsTrigger value="cashier" className="flex-1">
              Cashier
            </TabsTrigger>
          </TabsList>

          <TabsContent value="admin">
            <AdminLoginForm />
          </TabsContent>

          <TabsContent value="cashier">
            <CashierPinForm />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
