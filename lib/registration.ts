import { Prisma, RegistrationStatus, EventStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const DUPLICATE_REGISTRATION_ERROR = "Already registered for this event";
export const EVENT_CANCELLED_ERROR = "Cannot register for a cancelled event";
export const EVENT_NOT_FOUND_ERROR = "Event not found";
export const USER_NOT_FOUND_ERROR = "User not found";
export const USER_SUSPENDED_ERROR = "User account is suspended";
export const AUTH_REQUIRED_ERROR = "Authentication required";
export const EVENT_FULL_ERROR = "Event is full";

export interface RegisterResultRegistration {
  id: string;
  userId: string;
  eventId: string;
  status: string; // 'confirmed'
  rawStatus: RegistrationStatus;
  timestamp: Date;
  createdAt: Date;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  event?: {
    id: string;
    name: string;
    title?: string;
    date: Date;
    status: EventStatus | string;
    isCancelled: boolean;
  };
}

export interface RegisterResult {
  success: boolean;
  statusCode: number;
  registration?: RegisterResultRegistration;
  error?: string;
  remainingSeats?: number;
}

export type PrismaClientLike = any;

// In-memory mutex per event to serialize concurrent registrations for that event
const eventLocks = new Map<string, Promise<void>>();

export async function withEventLock<T>(eventId: string, fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const currentPromise = new Promise<void>((resolve) => {
    release = resolve;
  });

  const previousPromise = eventLocks.get(eventId) || Promise.resolve();
  eventLocks.set(eventId, currentPromise);

  try {
    await previousPromise;
  } catch {
    // Proceed even if previous promise had an error
  }

  try {
    return await fn();
  } finally {
    release!();
    if (eventLocks.get(eventId) === currentPromise) {
      eventLocks.delete(eventId);
    }
  }
}

export function clearEventLocks(): void {
  eventLocks.clear();
}

/**
 * Register a user for an event with duplicate prevention and capacity check.
 *
 * Implements FR-007 & FR-008:
 * - Valid registration creates exactly one record (user, event, timestamp, status).
 * - Second registration attempt for the same user+event is rejected (FR-007).
 * - Handles concurrent duplicate registrations atomically via DB-level unique constraint (P2002).
 * - Blocks registration for cancelled or non-existent events.
 * - Verifies remaining capacity before confirming; rejects when event is full (FR-008).
 * - Handles concurrent registration requests safely without exceeding capacity (FR-008).
 */
export async function registerForEvent(
  params: {
    userId?: string;
    userEmail?: string;
    eventId: string;
  },
  db: PrismaClientLike = prisma
): Promise<RegisterResult> {
  const { eventId, userId, userEmail } = params;

  if (!eventId || !eventId.trim()) {
    return {
      success: false,
      statusCode: 400,
      error: "Event ID is required",
    };
  }

  // 1. Authenticate user
  if (!userId && !userEmail) {
    return {
      success: false,
      statusCode: 401,
      error: AUTH_REQUIRED_ERROR,
    };
  }

  let user: { id: string; name: string; email: string; suspended: boolean } | null = null;
  if (userId) {
    user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, suspended: true },
    });
  } else if (userEmail) {
    user = await db.user.findUnique({
      where: { email: userEmail.toLowerCase().trim() },
      select: { id: true, name: true, email: true, suspended: true },
    });
  }

  if (!user) {
    return {
      success: false,
      statusCode: 404,
      error: USER_NOT_FOUND_ERROR,
    };
  }

  if (user.suspended) {
    return {
      success: false,
      statusCode: 403,
      error: USER_SUSPENDED_ERROR,
    };
  }

  const normalizedEventId = eventId.trim();

  return withEventLock(normalizedEventId, async () => {
    // 2. Validate Event
    const event = await db.event.findUnique({
      where: { id: normalizedEventId },
      select: { id: true, name: true, date: true, status: true, capacity: true },
    });

    if (!event) {
      return {
        success: false,
        statusCode: 404,
        error: EVENT_NOT_FOUND_ERROR,
      };
    }

    const isCancelled =
      event.status === EventStatus.CANCELLED ||
      event.status === "CANCELLED" ||
      (event as any).isCancelled === true;

    if (isCancelled) {
      return {
        success: false,
        statusCode: 400,
        error: EVENT_CANCELLED_ERROR,
      };
    }

    // 3. Pre-check for duplicate registration
    const existing = await db.registration.findUnique({
      where: {
        userId_eventId: {
          userId: user.id,
          eventId: event.id,
        },
      },
    });

    if (existing && existing.status !== RegistrationStatus.CANCELLED && existing.status !== "CANCELLED") {
      return {
        success: false,
        statusCode: 409,
        error: DUPLICATE_REGISTRATION_ERROR,
      };
    }

    // 4. Capacity check (FR-008)
    const eventCapacity = typeof event.capacity === "number" ? event.capacity : Infinity;

    let confirmedCount = 0;
    if (typeof db.registration?.count === "function") {
      confirmedCount = await db.registration.count({
        where: {
          eventId: event.id,
          status: RegistrationStatus.CONFIRMED,
        },
      });
    } else if (typeof db.registration?.findMany === "function") {
      const list = await db.registration.findMany({
        where: {
          eventId: event.id,
          status: RegistrationStatus.CONFIRMED,
        },
      });
      confirmedCount = list.filter(
        (r: any) => r.status === RegistrationStatus.CONFIRMED || r.status === "CONFIRMED"
      ).length;
    }

    if (confirmedCount >= eventCapacity) {
      return {
        success: false,
        statusCode: 400,
        error: EVENT_FULL_ERROR,
        remainingSeats: 0,
      };
    }

    // 5. If previously cancelled, reactivate the existing record
    if (existing) {
      try {
        const updated = await db.registration.update({
          where: { id: existing.id },
          data: {
            status: RegistrationStatus.CONFIRMED,
            updatedAt: new Date(),
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
            event: { select: { id: true, name: true, date: true, status: true, capacity: true } },
          },
        });

        const eventName = updated.event?.name ?? (updated.event as any)?.title ?? "";
        const eventCancelled =
          updated.event?.status === EventStatus.CANCELLED ||
          updated.event?.status === "CANCELLED" ||
          (updated.event as any)?.isCancelled === true;

        const remainingSeats = Math.max(0, eventCapacity - (confirmedCount + 1));

        return {
          success: true,
          statusCode: 201,
          remainingSeats,
          registration: {
            id: updated.id,
            userId: updated.userId,
            eventId: updated.eventId,
            status: "confirmed",
            rawStatus: updated.status,
            timestamp: updated.createdAt,
            createdAt: updated.createdAt,
            user: updated.user,
            event: updated.event
              ? {
                  id: updated.event.id,
                  name: eventName,
                  title: eventName,
                  date: updated.event.date,
                  status: updated.event.status,
                  isCancelled: eventCancelled,
                }
              : undefined,
          },
        };
      } catch (err: any) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return {
            success: false,
            statusCode: 409,
            error: DUPLICATE_REGISTRATION_ERROR,
          };
        }
        throw err;
      }
    }

    // 6. Create registration record (with DB-level unique constraint guard)
    try {
      const registration = await db.registration.create({
        data: {
          userId: user.id,
          eventId: event.id,
          status: RegistrationStatus.CONFIRMED,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          event: { select: { id: true, name: true, date: true, status: true, capacity: true } },
        },
      });

      const eventName = registration.event?.name ?? (registration.event as any)?.title ?? "";
      const eventCancelled =
        registration.event?.status === EventStatus.CANCELLED ||
        registration.event?.status === "CANCELLED" ||
        (registration.event as any)?.isCancelled === true;

      const remainingSeats = Math.max(0, eventCapacity - (confirmedCount + 1));

      return {
        success: true,
        statusCode: 201,
        remainingSeats,
        registration: {
          id: registration.id,
          userId: registration.userId,
          eventId: registration.eventId,
          status: "confirmed",
          rawStatus: registration.status,
          timestamp: registration.createdAt,
          createdAt: registration.createdAt,
          user: registration.user,
          event: registration.event
            ? {
                id: registration.event.id,
                name: eventName,
                title: eventName,
                date: registration.event.date,
                status: registration.event.status,
                isCancelled: eventCancelled,
              }
            : undefined,
        },
      };
    } catch (err: any) {
      // Catch database-level unique constraint violation (concurrent requests)
      if (
        (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") ||
        err?.code === "P2002" ||
        err?.message?.includes("Unique constraint failed") ||
        err?.message?.includes("duplicate key")
      ) {
        return {
          success: false,
          statusCode: 409,
          error: DUPLICATE_REGISTRATION_ERROR,
        };
      }
      throw err;
    }
  });
}

/**
 * Retrieve current capacity metrics for an event.
 *
 * Implements FR-008:
 * - Calculates confirmed registrations count
 * - Calculates remaining seats
 * - Flags whether event is full
 */
export async function getEventCapacity(
  eventId: string,
  db: PrismaClientLike = prisma
): Promise<{
  capacity: number;
  confirmedCount: number;
  remainingSeats: number;
  isFull: boolean;
} | null> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, capacity: true, status: true },
  });

  if (!event) return null;

  let confirmedCount = 0;
  if (typeof db.registration?.count === "function") {
    confirmedCount = await db.registration.count({
      where: {
        eventId: event.id,
        status: RegistrationStatus.CONFIRMED,
      },
    });
  } else if (typeof db.registration?.findMany === "function") {
    const list = await db.registration.findMany({
      where: {
        eventId: event.id,
        status: RegistrationStatus.CONFIRMED,
      },
    });
    confirmedCount = list.filter(
      (r: any) => r.status === RegistrationStatus.CONFIRMED || r.status === "CONFIRMED"
    ).length;
  }

  const capacity = typeof event.capacity === "number" ? event.capacity : 0;
  const remainingSeats = Math.max(0, capacity - confirmedCount);
  const isFull = remainingSeats <= 0;

  return {
    capacity,
    confirmedCount,
    remainingSeats,
    isFull,
  };
}

/**
 * Check if a user is currently registered for an event.
 */
export async function checkUserRegistration(
  userId: string,
  eventId: string,
  db: PrismaClientLike = prisma
) {
  const reg = await db.registration.findUnique({
    where: {
      userId_eventId: {
        userId,
        eventId,
      },
    },
    include: {
      event: { select: { id: true, name: true, date: true, status: true } },
    },
  });

  if (!reg || reg.status === RegistrationStatus.CANCELLED || reg.status === "CANCELLED") {
    return { registered: false, registration: null };
  }

  const eventName = reg.event?.name ?? (reg.event as any)?.title ?? "";
  const eventCancelled =
    reg.event?.status === EventStatus.CANCELLED ||
    reg.event?.status === "CANCELLED" ||
    (reg.event as any)?.isCancelled === true;

  return {
    registered: true,
    registration: {
      id: reg.id,
      userId: reg.userId,
      eventId: reg.eventId,
      status: reg.status === RegistrationStatus.CONFIRMED ? "confirmed" : reg.status.toLowerCase(),
      timestamp: reg.createdAt,
      createdAt: reg.createdAt,
      event: reg.event
        ? {
            id: reg.event.id,
            name: eventName,
            title: eventName,
            date: reg.event.date,
            status: reg.event.status,
            isCancelled: eventCancelled,
          }
        : undefined,
    },
  };
}

/**
 * List registrations filtered by userId or eventId.
 */
export async function listRegistrations(
  filter: { userId?: string; eventId?: string },
  db: PrismaClientLike = prisma
) {
  const where: any = {};
  if (filter.userId) where.userId = filter.userId;
  if (filter.eventId) where.eventId = filter.eventId;

  const registrations = await db.registration.findMany({
    where,
    include: {
      event: { select: { id: true, name: true, date: true, status: true } },
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return registrations.map((r: any) => {
    const eventName = r.event?.name ?? r.event?.title ?? "";
    const eventCancelled =
      r.event?.status === EventStatus.CANCELLED ||
      r.event?.status === "CANCELLED" ||
      r.event?.isCancelled === true;

    return {
      id: r.id,
      userId: r.userId,
      eventId: r.eventId,
      status: typeof r.status === "string" ? r.status.toLowerCase() : String(r.status).toLowerCase(),
      rawStatus: r.status,
      timestamp: r.createdAt,
      createdAt: r.createdAt,
      event: r.event
        ? {
            id: r.event.id,
            name: eventName,
            title: eventName,
            date: r.event.date,
            status: r.event.status,
            isCancelled: eventCancelled,
          }
        : undefined,
      user: r.user,
    };
  });
}
