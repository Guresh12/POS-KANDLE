import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";

const router = Router();

function formatUser(u: any) {
  const { pinHash: _pin, supabaseId: _sid, ...safe } = u;
  return {
    ...safe,
    createdAt: u.createdAt?.toISOString(),
    updatedAt: u.updatedAt?.toISOString(),
  };
}

router.get("/users/me", requireAuth, async (req, res) => {
  try {
    const user = (req as any).dbUser;
    if (!user) return res.status(404).json({ error: "Not found" });
    const branch = user.branchId
      ? await db.query.branchesTable.findFirst({ where: eq(branchesTable.id, user.branchId) })
      : null;
    res.json(formatUser({ ...user, branchName: branch?.name }));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        role: usersTable.role,
        branchId: usersTable.branchId,
        branchName: branchesTable.name,
        isActive: usersTable.isActive,
        createdAt: usersTable.createdAt,
        hasPin: usersTable.pinHash,
      })
      .from(usersTable)
      .leftJoin(branchesTable, eq(usersTable.branchId, branchesTable.id))
      .orderBy(usersTable.email);

    res.json(
      rows.map((u) => ({
        ...u,
        hasPin: u.hasPin !== null,
        createdAt: (u.createdAt as any)?.toISOString?.() ?? u.createdAt,
      })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { email, name, role, branchId, pin } = req.body;
    if (!email || !role) {
      return res.status(400).json({ error: "email and role required" });
    }

    let pinHash: string | undefined;
    if (pin !== undefined) {
      if (!/^\d{4}$/.test(String(pin))) {
        return res.status(400).json({ error: "PIN must be exactly 4 digits" });
      }
      pinHash = await bcrypt.hash(String(pin), 10);
    }

    const [user] = await db
      .insert(usersTable)
      .values({ email: String(email).toLowerCase().trim(), name, role, branchId, pinHash })
      .returning();

    res.status(201).json(formatUser(user));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { role, branchId, isActive, pin } = req.body;

    const updates: Record<string, unknown> = {};
    if (role !== undefined) updates.role = role;
    if (branchId !== undefined) updates.branchId = branchId;
    if (isActive !== undefined) updates.isActive = isActive;

    if (pin !== undefined) {
      if (!/^\d{4}$/.test(String(pin))) {
        return res.status(400).json({ error: "PIN must be exactly 4 digits" });
      }
      updates.pinHash = await bcrypt.hash(String(pin), 10);
    }

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(formatUser(updated));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.update(usersTable).set({ isActive: false }).where(eq(usersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
