import { prisma as defaultPrisma } from "@/lib/prisma";
import { EventStatus, RegistrationStatus, Role, PrismaClient } from "@prisma/client";

export interface CategoryBreakdown {
  category: string;
  count: number;
}

export interface PlatformStats {
  totalEvents: number;
  totalUsers: number;
  totalRegistrations: number;
  events: {
    total: number;
    active: number;
    cancelled: number;
    upcoming: number;
    past: number;
    byCategory: CategoryBreakdown[];
  };
  users: {
    total: number;
    admins: number;
    organizers: number;
    participants: number;
    verified: number;
    suspended: number;
  };
  registrations: {
    total: number;
    confirmed: number;
    waitlisted: number;
    cancelled: number;
  };
  capacity: {
    totalCapacity: number;
    confirmedRegistrations: number;
    utilizationRate: number;
  };
  filter?: {
    startDate?: string;
    endDate?: string;
    category?: string;
  };
  asOf: string;
  cached?: boolean;
}

export interface GetPlatformStatsOptions {
  startDate?: string | Date;
  endDate?: string | Date;
  category?: string;
  client?: PrismaClient | any;
  now?: Date;
}

// In-memory cache for fallback when live aggregation times out (UC-17 Step 2a).
let cachedSnapshot: PlatformStats | null = null;

export function getCachedPlatformStats(): PlatformStats | null {
  return cachedSnapshot;
}

export function setCachedPlatformStats(stats: PlatformStats | null): void {
  cachedSnapshot = stats;
}

/**
 * Aggregates live database totals across events, users, and registrations (FR-010b / UC-17).
 * Optionally supports filtering by date range and event category.
 * If a selected date range has no activity, returns zero counts gracefully (UC-17 Step 3a).
 */
export async function getPlatformStats(
  options: GetPlatformStatsOptions = {}
): Promise<PlatformStats> {
  const db = options.client || defaultPrisma;
  const now = options.now || new Date();

  let parsedStart: Date | undefined;
  let parsedEnd: Date | undefined;

  if (options.startDate) {
    parsedStart = options.startDate instanceof Date ? options.startDate : new Date(options.startDate);
    if (isNaN(parsedStart.getTime())) {
      throw new Error("Invalid startDate format: must be a valid date or ISO string");
    }
  }

  if (options.endDate) {
    parsedEnd = options.endDate instanceof Date ? options.endDate : new Date(options.endDate);
    if (isNaN(parsedEnd.getTime())) {
      throw new Error("Invalid endDate format: must be a valid date or ISO string");
    }
  }

  if (parsedStart && parsedEnd && parsedStart.getTime() > parsedEnd.getTime()) {
    throw new Error("startDate must be before or equal to endDate");
  }

  // Build where filters
  const eventWhere: any = {};
  if (options.category) {
    eventWhere.category = options.category;
  }
  if (parsedStart || parsedEnd) {
    eventWhere.createdAt = {
      ...(parsedStart ? { gte: parsedStart } : {}),
      ...(parsedEnd ? { lte: parsedEnd } : {}),
    };
  }

  const userWhere: any = {};
  if (parsedStart || parsedEnd) {
    userWhere.createdAt = {
      ...(parsedStart ? { gte: parsedStart } : {}),
      ...(parsedEnd ? { lte: parsedEnd } : {}),
    };
  }

  const regWhere: any = {};
  if (options.category) {
    regWhere.event = { category: options.category };
  }
  if (parsedStart || parsedEnd) {
    regWhere.createdAt = {
      ...(parsedStart ? { gte: parsedStart } : {}),
      ...(parsedEnd ? { lte: parsedEnd } : {}),
    };
  }

  try {
    const [
      totalEvents,
      activeEvents,
      cancelledEvents,
      totalUsers,
      admins,
      organizers,
      participants,
      verifiedUsers,
      suspendedUsers,
      totalRegistrations,
      confirmedRegistrations,
      waitlistedRegistrations,
      cancelledRegistrations,
      eventsList,
    ] = await Promise.all([
      db.event.count({ where: eventWhere }),
      db.event.count({ where: { ...eventWhere, status: EventStatus.ACTIVE } }),
      db.event.count({ where: { ...eventWhere, status: EventStatus.CANCELLED } }),
      db.user.count({ where: userWhere }),
      db.user.count({ where: { ...userWhere, role: Role.ADMIN } }),
      db.user.count({ where: { ...userWhere, role: Role.ORGANIZER } }),
      db.user.count({ where: { ...userWhere, role: Role.PARTICIPANT } }),
      db.user.count({ where: { ...userWhere, verified: true } }),
      db.user.count({ where: { ...userWhere, suspended: true } }),
      db.registration.count({ where: regWhere }),
      db.registration.count({ where: { ...regWhere, status: RegistrationStatus.CONFIRMED } }),
      db.registration.count({ where: { ...regWhere, status: RegistrationStatus.WAITLISTED } }),
      db.registration.count({ where: { ...regWhere, status: RegistrationStatus.CANCELLED } }),
      db.event.findMany({
        where: eventWhere,
        select: { id: true, category: true, capacity: true, status: true, date: true },
      }),
    ]);

    // Calculate upcoming and past active events
    let upcoming = 0;
    let past = 0;
    let totalCapacity = 0;
    const catMap = new Map<string, number>();

    if (Array.isArray(eventsList)) {
      for (const e of eventsList) {
        if (e.status === EventStatus.ACTIVE) {
          totalCapacity += Number(e.capacity) || 0;
          const eventTime = e.date instanceof Date ? e.date.getTime() : new Date(e.date).getTime();
          if (eventTime >= now.getTime()) {
            upcoming++;
          } else {
            past++;
          }
        }
        const cat = e.category ? String(e.category).trim() : "Uncategorized";
        catMap.set(cat, (catMap.get(cat) || 0) + 1);
      }
    }

    const byCategory: CategoryBreakdown[] = Array.from(catMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    const utilizationRate =
      totalCapacity > 0
        ? Math.round((confirmedRegistrations / totalCapacity) * 1000) / 10
        : 0;

    const result: PlatformStats = {
      totalEvents,
      totalUsers,
      totalRegistrations,
      events: {
        total: totalEvents,
        active: activeEvents,
        cancelled: cancelledEvents,
        upcoming,
        past,
        byCategory,
      },
      users: {
        total: totalUsers,
        admins,
        organizers,
        participants,
        verified: verifiedUsers,
        suspended: suspendedUsers,
      },
      registrations: {
        total: totalRegistrations,
        confirmed: confirmedRegistrations,
        waitlisted: waitlistedRegistrations,
        cancelled: cancelledRegistrations,
      },
      capacity: {
        totalCapacity,
        confirmedRegistrations,
        utilizationRate,
      },
      filter:
        options.startDate || options.endDate || options.category
          ? {
              startDate: options.startDate ? (parsedStart?.toISOString()) : undefined,
              endDate: options.endDate ? (parsedEnd?.toISOString()) : undefined,
              category: options.category || undefined,
            }
          : undefined,
      asOf: now.toISOString(),
      cached: false,
    };

    // Cache the latest snapshot for fallback
    cachedSnapshot = result;

    return result;
  } catch (err) {
    // If live aggregation fails and we have a cached snapshot, fall back to it (UC-17 Step 2a).
    if (cachedSnapshot) {
      return {
        ...cachedSnapshot,
        cached: true,
      };
    }
    throw err;
  }
}
