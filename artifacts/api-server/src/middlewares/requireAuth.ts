import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { createPublicKey } from "crypto";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET ?? "";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";

// Fetch Supabase JWKS once and cache the public key
let _supabaseKeyPromise: Promise<string> | null = null;

function getSupabasePublicKey(): Promise<string> {
  if (!_supabaseKeyPromise) {
    _supabaseKeyPromise = (async () => {
      const url = `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`JWKS fetch failed: ${resp.status}`);
      const { keys } = (await resp.json()) as { keys: object[] };
      const pub = createPublicKey({ key: keys[0] as Parameters<typeof createPublicKey>[0], format: "jwk" });
      return pub.export({ type: "spki", format: "pem" }) as string;
    })().catch((err) => {
      _supabaseKeyPromise = null; // allow retry on next request
      throw err;
    });
  }
  return _supabaseKeyPromise;
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const decoded = jwt.decode(token, { complete: true }) as { payload: Record<string, unknown> } | null;
    if (!decoded?.payload) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    const payload = decoded.payload;
    let user;

    const isSupabaseToken =
      typeof payload.iss === "string" && payload.iss.includes("supabase");

    if (isSupabaseToken) {
      const publicKey = await getSupabasePublicKey();
      const verified = jwt.verify(token, publicKey, { algorithms: ["ES256", "RS256"] }) as Record<string, unknown>;
      const supabaseId = verified.sub as string;

      user = await db.query.usersTable.findFirst({
        where: eq(usersTable.supabaseId, supabaseId),
      });

      if (!user) {
        // Auto-provision Supabase user on first login
        const email = (verified.email ?? (verified.user_metadata as any)?.email ?? "") as string;
        const name = ((verified.user_metadata as any)?.full_name ?? (verified.user_metadata as any)?.name ?? null) as string | null;
        const [created] = await db
          .insert(usersTable)
          .values({ supabaseId, email, name, role: "admin", isActive: true })
          .onConflictDoNothing()
          .returning();
        user = created ?? await db.query.usersTable.findFirst({ where: eq(usersTable.supabaseId, supabaseId) });
      }
    } else {
      // Server-issued PIN JWT
      const verified = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
      const userId = verified.userId as number;
      user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
    }

    if (!user?.isActive) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    (req as any).dbUser = user;
    next();
  } catch (err: any) {
    console.error("[requireAuth] failed:", err?.message);
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).dbUser;
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
};
