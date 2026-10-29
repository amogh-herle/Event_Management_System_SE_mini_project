import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { categorySchema } from "@/lib/validation";

/**
 * FR-006c: admin category management helpers.
 *
 * Events keep their category in two places: the `category` name string
 * (used for display, filtering, and emails) and an optional `categoryId`
 * link. An event "uses" a category if either one points at it — the link
 * can be null when the category upsert during event creation was skipped.
 */

export interface AdminCategory {
  id: string;
  name: string;
  createdAt: string;
  eventCount: number;
}

export function eventsUsingCategory(category: { id: string; name: string }): Prisma.EventWhereInput {
  return { OR: [{ categoryId: category.id }, { category: category.name }] };
}

export async function countEventsUsingCategory(category: { id: string; name: string }): Promise<number> {
  return prisma.event.count({ where: eventsUsingCategory(category) });
}

/**
 * Case-insensitive duplicate check done in JS rather than with Prisma's
 * `mode: "insensitive"`, which compiles to ILIKE on Postgres and would treat
 * "%" or "_" in a name as wildcards. The category list is small.
 */
export async function findCategoryWithName(name: string, excludeId?: string) {
  const all = await prisma.category.findMany({ select: { id: true, name: true } });
  const wanted = name.toLowerCase();
  return all.find((c) => c.id !== excludeId && c.name.toLowerCase() === wanted) ?? null;
}

export async function toAdminCategory(category: { id: string; name: string; createdAt: Date }): Promise<AdminCategory> {
  return {
    id: category.id,
    name: category.name,
    createdAt: category.createdAt.toISOString(),
    eventCount: await countEventsUsingCategory(category),
  };
}

/** Parses `{ name }` from a request body; returns the cleaned name or an error message. */
export async function parseCategoryBody(
  request: Request
): Promise<{ name: string; error?: undefined } | { name?: undefined; error: string }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: "Invalid request body" };
  }
  const parsed = categorySchema.safeParse(body);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid category name" };
  }
  return { name: parsed.data.name };
}

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export function isNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025";
}
