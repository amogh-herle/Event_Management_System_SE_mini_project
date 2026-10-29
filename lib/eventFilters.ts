import type { Prisma } from "@prisma/client";

/**
 * FR-006b: search events by name and filter by category, date, or venue.
 *
 * Filters arrive as untrusted query-string values, so everything is trimmed,
 * length-capped, and validated here; anything empty or invalid is simply
 * dropped (treated as "no filter") rather than erroring. Matching is done
 * with Prisma's own `contains`/`equals` operators, which are parameterized,
 * so user input never reaches the SQL text; LIKE wildcards in the input are
 * escaped so they match literally (see escapeLikePattern).
 */

export const MAX_FILTER_LENGTH = 100;

export interface EventFilters {
  /** Case-insensitive partial match on the event name only. */
  q?: string;
  /** Case-insensitive exact match on the category. */
  category?: string;
  /** Calendar day, YYYY-MM-DD (events are stored at UTC midnight). */
  date?: string;
  /** Case-insensitive partial match on the venue. */
  venue?: string;
}

function cleanText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, MAX_FILTER_LENGTH);
  return trimmed ? trimmed : undefined;
}

function cleanDate(value: string | null | undefined): string | undefined {
  const text = cleanText(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  // Rejects impossible dates like 2026-02-30, which Date would roll over.
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) return undefined;
  return text;
}

export function parseEventFilters(params: URLSearchParams): EventFilters {
  const filters: EventFilters = {};
  const q = cleanText(params.get("q"));
  const category = cleanText(params.get("category"));
  const date = cleanDate(params.get("date"));
  const venue = cleanText(params.get("venue"));
  if (q) filters.q = q;
  if (category) filters.category = category;
  if (date) filters.date = date;
  if (venue) filters.venue = venue;
  return filters;
}

export function hasEventFilters(filters: EventFilters): boolean {
  return Boolean(filters.q || filters.category || filters.date || filters.venue);
}

function dayRange(date: string): { gte: Date; lt: Date } {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { gte: start, lt: end };
}

/**
 * On Postgres, Prisma's case-insensitive `contains` and `equals` compile to
 * ILIKE without escaping the pattern, so a user typing "%" or "_" would
 * match everything. Escape them (and the escape character itself) so they
 * are matched literally.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Prisma where-clause fragment for the given filters (empty object when none). */
export function buildEventFilterWhere(filters: EventFilters): Prisma.EventWhereInput {
  const where: Prisma.EventWhereInput = {};
  if (filters.q) where.name = { contains: escapeLikePattern(filters.q), mode: "insensitive" };
  if (filters.category) {
    where.category = { equals: escapeLikePattern(filters.category), mode: "insensitive" };
  }
  if (filters.venue) where.venue = { contains: escapeLikePattern(filters.venue), mode: "insensitive" };
  if (filters.date) where.date = dayRange(filters.date);
  return where;
}

/**
 * Same semantics as buildEventFilterWhere, for the in-memory fallback list
 * (used when the database is unreachable). Missing fields never match a
 * filter on that field, and never throw.
 */
export function matchesEventFilters(
  event: { name?: string | null; category?: string | null; venue?: string | null; date?: string | Date | null },
  filters: EventFilters
): boolean {
  const lower = (v: string | null | undefined) => (v ?? "").toLowerCase();
  if (filters.q && !lower(event.name).includes(filters.q.toLowerCase())) return false;
  if (filters.category && lower(event.category) !== filters.category.toLowerCase()) return false;
  if (filters.venue && !lower(event.venue).includes(filters.venue.toLowerCase())) return false;
  if (filters.date) {
    if (!event.date) return false;
    const d = new Date(event.date);
    if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== filters.date) return false;
  }
  return true;
}
