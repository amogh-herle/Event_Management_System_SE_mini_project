import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  countEventsUsingCategory,
  eventsUsingCategory,
  findCategoryWithName,
  isNotFound,
  isUniqueViolation,
  parseCategoryBody,
  toAdminCategory,
} from "@/lib/categories";

// PATCH /api/admin/categories/[id] — FR-006c: admin renames a category.
//   Body: { name }
// Every event using the category is updated to the new name in the same
// transaction, so listings, filters, and the event forms all show the new
// name immediately. Events stay linked; registrations are untouched.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
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
    const category = await prisma.category.findUnique({ where: { id: params.id } });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // A case-only change of its own name (e.g. "music" → "Music") is allowed.
    const duplicate = await findCategoryWithName(name, category.id);
    if (duplicate) {
      return NextResponse.json(
        { error: `A category named "${duplicate.name}" already exists` },
        { status: 409 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const renamed = await tx.category.update({ where: { id: category.id }, data: { name } });
      await tx.event.updateMany({
        where: eventsUsingCategory(category),
        data: { category: name, categoryId: category.id },
      });
      return renamed;
    });

    return NextResponse.json({ category: await toAdminCategory(updated) });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 });
    }
    if (isNotFound(err)) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    console.error("[admin/categories/:id] failed to rename category:", err);
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
  }
}

// DELETE /api/admin/categories/[id] — FR-006c: admin removes a category.
// Only allowed when no event (active or cancelled) uses it; otherwise the
// admin is told to rename it instead. Events are never deleted or altered.
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const category = await prisma.category.findUnique({ where: { id: params.id } });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const inUse = await countEventsUsingCategory(category);
    if (inUse > 0) {
      return NextResponse.json(
        {
          error: `"${category.name}" is used by ${inUse} event${inUse === 1 ? "" : "s"} and can't be removed. Rename it instead, or remove it once no events use it.`,
          eventCount: inUse,
        },
        { status: 409 }
      );
    }

    await prisma.category.delete({ where: { id: category.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isNotFound(err)) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    console.error("[admin/categories/:id] failed to delete category:", err);
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}
