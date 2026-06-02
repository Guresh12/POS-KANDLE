import { Router } from "express";
import { db } from "@workspace/db";
import { branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";

const router = Router();

router.get("/branches", requireAuth, async (req, res) => {
  try {
    const branches = await db.select().from(branchesTable).orderBy(branchesTable.name);
    res.json(branches.map(b => ({ ...b, createdAt: b.createdAt.toISOString(), updatedAt: b.updatedAt?.toISOString() })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/branches", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, address, phone, email } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const [branch] = await db.insert(branchesTable).values({ name, address, phone, email }).returning();
    res.status(201).json({ ...branch, createdAt: branch.createdAt.toISOString(), updatedAt: branch.updatedAt?.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/branches/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const branch = await db.query.branchesTable.findFirst({ where: eq(branchesTable.id, id) });
    if (!branch) return res.status(404).json({ error: "Not found" });
    res.json({ ...branch, createdAt: branch.createdAt.toISOString(), updatedAt: branch.updatedAt?.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/branches/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, address, phone, email, isActive } = req.body;
    const [updated] = await db.update(branchesTable).set({ name, address, phone, email, isActive }).where(eq(branchesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt?.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/branches/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.update(branchesTable).set({ isActive: false }).where(eq(branchesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
