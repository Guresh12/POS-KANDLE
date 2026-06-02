import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, categoriesTable, inventoryTable } from "@workspace/db";
import { eq, ilike, and, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/requireAuth";

const router = Router();

router.get("/products", requireAuth, async (req, res) => {
  try {
    const { search, categoryId, active } = req.query;
    const conditions = [];
    if (search) conditions.push(ilike(productsTable.name, `%${search}%`));
    if (categoryId) conditions.push(eq(productsTable.categoryId, Number(categoryId)));
    if (active !== undefined) conditions.push(eq(productsTable.isActive, active === "true"));

    const rows = await db.select({
      id: productsTable.id,
      name: productsTable.name,
      sku: productsTable.sku,
      barcode: productsTable.barcode,
      categoryId: productsTable.categoryId,
      categoryName: categoriesTable.name,
      brand: productsTable.brand,
      unit: productsTable.unit,
      costPrice: productsTable.costPrice,
      sellingPrice: productsTable.sellingPrice,
      taxRate: productsTable.taxRate,
      reorderLevel: productsTable.reorderLevel,
      description: productsTable.description,
      imageUrl: productsTable.imageUrl,
      isActive: productsTable.isActive,
      createdAt: productsTable.createdAt,
      updatedAt: productsTable.updatedAt,
      currentStock: sql<number>`coalesce(sum(inventory.quantity::numeric), 0)`,
    })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .leftJoin(inventoryTable, eq(productsTable.id, inventoryTable.productId))
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(productsTable.id, categoriesTable.name)
      .orderBy(productsTable.name);

    res.json(rows.map(p => ({
      ...p,
      costPrice: Number(p.costPrice),
      sellingPrice: Number(p.sellingPrice),
      taxRate: Number(p.taxRate),
      reorderLevel: Number(p.reorderLevel),
      currentStock: Number(p.currentStock),
      createdAt: p.createdAt?.toISOString(),
      updatedAt: p.updatedAt?.toISOString(),
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/products", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, sellingPrice, costPrice, ...rest } = req.body;
    if (!name || sellingPrice === undefined || costPrice === undefined) {
      return res.status(400).json({ error: "name, sellingPrice, costPrice required" });
    }
    const [product] = await db.insert(productsTable).values({ name, sellingPrice: String(sellingPrice), costPrice: String(costPrice), ...rest }).returning();
    res.status(201).json({ ...product, costPrice: Number(product.costPrice), sellingPrice: Number(product.sellingPrice), taxRate: Number(product.taxRate), reorderLevel: Number(product.reorderLevel), currentStock: null, createdAt: product.createdAt?.toISOString(), updatedAt: product.updatedAt?.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/products/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [product] = await db.select({
      id: productsTable.id,
      name: productsTable.name,
      sku: productsTable.sku,
      barcode: productsTable.barcode,
      categoryId: productsTable.categoryId,
      categoryName: categoriesTable.name,
      brand: productsTable.brand,
      unit: productsTable.unit,
      costPrice: productsTable.costPrice,
      sellingPrice: productsTable.sellingPrice,
      taxRate: productsTable.taxRate,
      reorderLevel: productsTable.reorderLevel,
      description: productsTable.description,
      imageUrl: productsTable.imageUrl,
      isActive: productsTable.isActive,
      createdAt: productsTable.createdAt,
      updatedAt: productsTable.updatedAt,
      currentStock: sql<number>`coalesce(sum(inventory.quantity::numeric), 0)`,
    })
      .from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .leftJoin(inventoryTable, eq(productsTable.id, inventoryTable.productId))
      .where(eq(productsTable.id, id))
      .groupBy(productsTable.id, categoriesTable.name);

    if (!product) return res.status(404).json({ error: "Not found" });
    res.json({ ...product, costPrice: Number(product.costPrice), sellingPrice: Number(product.sellingPrice), taxRate: Number(product.taxRate), reorderLevel: Number(product.reorderLevel), currentStock: Number(product.currentStock), createdAt: product.createdAt?.toISOString(), updatedAt: product.updatedAt?.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/products/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const update = { ...req.body };
    if (update.sellingPrice !== undefined) update.sellingPrice = String(update.sellingPrice);
    if (update.costPrice !== undefined) update.costPrice = String(update.costPrice);
    if (update.taxRate !== undefined) update.taxRate = String(update.taxRate);
    if (update.reorderLevel !== undefined) update.reorderLevel = String(update.reorderLevel);
    const [updated] = await db.update(productsTable).set(update).where(eq(productsTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json({ ...updated, costPrice: Number(updated.costPrice), sellingPrice: Number(updated.sellingPrice), taxRate: Number(updated.taxRate), reorderLevel: Number(updated.reorderLevel), currentStock: null, createdAt: updated.createdAt?.toISOString(), updatedAt: updated.updatedAt?.toISOString() });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/products/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.update(productsTable).set({ isActive: false }).where(eq(productsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
