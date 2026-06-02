import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

const startTime = Date.now();

router.get("/healthz", async (_req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  try {
    await db.execute(sql`SELECT 1`);
    res.json({
      status: "ok",
      uptime: uptimeSeconds,
      db: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: "error",
      uptime: uptimeSeconds,
      db: "unreachable",
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
