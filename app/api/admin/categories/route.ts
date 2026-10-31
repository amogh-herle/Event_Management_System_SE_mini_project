import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  findCategoryWithName,
  isUniqueViolation,
  parseCategoryBody,
  toAdminCategory,
} from "@/lib/categories";

// GET /api/admin/categories — FR-006c: admin views every category and how
// many events use it.
export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ categories: await Promise.all(categories.map(toAdminCategory)) });
  } catch (err) {
    console.error("[admin/categories] failed to list categories:", err);
    return NextResponse.json({ error: "Failed to load categories" }, { status: 500 });
  }
}

// POST /api/admin/categories — FR-006c: admin adds a category.
//   Body: { name }
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = await parseCategoryBody(request);
  if (parsed.error !== undefined) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { name } = parsed;

  try {
    const existing = await findCategoryWithName(name);
    if (existing) {
      return NextResponse.json(
        { error: `A category named "${existing.name}" already exists` },
        { status: 409 }
      );
    }

    const created = await prisma.category.create({ data: { name } });
    return NextResponse.json({ category: await toAdminCategory(created) }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 });
    }
    console.error("[admin/categories] failed to create category:", err);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
