import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";

const router = Router();

async function getOrCreateSettings() {
  let settings = await db.query.settingsTable.findFirst();
  if (!settings) {
    [settings] = await db.insert(settingsTable).values({}).returning();
  }
  return settings;
}

router.get("/settings", requireAuth, async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({ ...settings, taxRate: Number(settings.taxRate), createdAt: settings.createdAt?.toISOString(), updatedAt: settings.updatedAt?.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/settings", requireAuth, requireAdmin, async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    const update = { ...req.body };
    if (update.taxRate !== undefined) update.taxRate = String(update.taxRate);
    const [updated] = await db.update(settingsTable).set(update).where(sql`id = ${settings.id}`).returning();
    res.json({ ...updated, taxRate: Number(updated.taxRate), createdAt: updated.createdAt?.toISOString(), updatedAt: updated.updatedAt?.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
