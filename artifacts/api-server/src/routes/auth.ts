import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? "";

router.post("/auth/pos-login", async (req: Request, res: Response) => {
  const { email, pin } = req.body;

  if (!email || !pin) {
    res.status(400).json({ error: "Email and PIN are required" });
    return;
  }

  if (!/^\d{4}$/.test(String(pin))) {
    res.status(400).json({ error: "PIN must be exactly 4 digits" });
    return;
  }

  try {
    const user = await db.query.usersTable.findFirst({
      where: eq(usersTable.email, String(email).toLowerCase().trim()),
    });

    if (!user || !user.isActive || !user.pinHash) {
      res.status(401).json({ error: "Invalid email or PIN" });
      return;
    }

    const valid = await bcrypt.compare(String(pin), user.pinHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or PIN" });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: "8h", issuer: "swiftpos" },
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        branchId: user.branchId,
        createdAt: user.createdAt?.toISOString(),
      },
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
