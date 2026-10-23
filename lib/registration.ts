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
  status: string; // 'confirmed' | 'cancelled' | 'waitlisted' | ...
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
    date: Date;
    status: EventStatus | string;
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

function isEventCancelled(status: EventStatus | string): boolean {
  return status === EventStatus.CANCELLED || status === "CANCELLED";
}

function toApiStatus(status: RegistrationStatus | string): string {
  return typeof status === "string" ? status.toLowerCase() : String(status).toLowerCase();
}

function formatRegistration(reg: {
  id: string;
  userId: string;
  eventId: string;
  status: RegistrationStatus;
  createdAt: Date;
  user?: { id: string; name: string; email: string } | null;
  event?: { id: string; name: string; date: Date; status: EventStatus | string } | null;
}): RegisterResultRegistration {
  return {
    id: reg.id,
    userId: reg.userId,
    eventId: reg.eventId,
    status: toApiStatus(reg.status),
    rawStatus: reg.status,
    timestamp: reg.createdAt,
    createdAt: reg.createdAt,
    user: reg.user ?? undefined,
    event: reg.event
      ? { id: reg.event.id, name: reg.event.name, date: reg.event.date, status: reg.event.status }
      : undefined,
  };
}

// In-memory mutex per event: a fast, same-process guard that avoids most
// transaction retries. It is NOT a correctness guarantee on its own — it
// does nothing across multiple server instances/processes — so the actual
// duplicate/capacity invariants are enforced at the database level below
// (unique constraint + a serializable transaction).
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
 * Runs `fn` inside a SERIALIZABLE transaction when the given db client
 * supports transactions (the real Prisma client does; test mocks don't).
 * This is what actually makes duplicate-prevention and capacity-checking
 * safe across multiple server processes/instances, not the in-memory lock
 * above. A serialization conflict (P2034) means another process won the
 * race for the same row/seat; retrying once is safe since the loser simply
 * re-reads fresh state.
 */
async function withSerializableTransaction<T>(
  db: PrismaClientLike,
  fn: (tx: PrismaClientLike) => Promise<T>
): Promise<T> {
  if (typeof db.$transaction !== "function") {
    return fn(db);
  }

  const run = () =>
    db.$transaction((tx: PrismaClientLike) => fn(tx), {
      isolation: Prisma.TransactionIsolationLevel.Serializable,
    });

  try {
    return await run();
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      return run();
    }
    throw err;
  }
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
 * - Handles concurrent registration requests safely without exceeding capacity (FR-008),
 *   including across multiple server processes (SERIALIZABLE transaction, not just an
 *   in-process lock).
 *
 * `userId` must come from a verified identity (a real session or the demo role claim
 * resolved by lib/auth.ts) — callers must never pass through a client-supplied id/email
 * as-is, or any caller could register/act as any other user.
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

  return withEventLock(normalizedEventId, () =>
    withSerializableTransaction(db, async (tx) => {
      // 2. Validate Event
      const event = await tx.event.findUnique({
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

      if (isEventCancelled(event.status)) {
        return {
          success: false,
          statusCode: 400,
          error: EVENT_CANCELLED_ERROR,
        };
      }

      // 3. Pre-check for duplicate registration
      const existing = await tx.registration.findUnique({
        where: {
          userId_eventId: {
            userId: user.id,
            eventId: event.id,
          },
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          event: { select: { id: true, name: true, date: true, status: true } },
        },
      });

      if (existing && existing.status !== RegistrationStatus.CANCELLED && existing.status !== "CANCELLED") {
        return {
          success: false,
          statusCode: 409,
          error: DUPLICATE_REGISTRATION_ERROR,
          registration: formatRegistration(existing),
        };
      }

      // 4. Capacity check (FR-008)
      const eventCapacity = typeof event.capacity === "number" ? event.capacity : Infinity;

      let confirmedCount = 0;
      if (typeof tx.registration?.count === "function") {
        confirmedCount = await tx.registration.count({
          where: {
            eventId: event.id,
            status: RegistrationStatus.CONFIRMED,
          },
        });
      } else if (typeof tx.registration?.findMany === "function") {
        const list = await tx.registration.findMany({
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

      const remainingSeats = Math.max(0, eventCapacity - (confirmedCount + 1));

      // 5. If previously cancelled, reactivate the existing record; otherwise create one.
      // Both paths are covered by the DB-level unique constraint: `update` can't race
      // with another `update` on the same row (same transaction/lock), and `create`
      // falls back to the P2002 catch below for the truly-new-row race.
      try {
        const saved = existing
          ? await tx.registration.update({
              where: { id: existing.id },
              data: { status: RegistrationStatus.CONFIRMED, updatedAt: new Date() },
              include: {
                user: { select: { id: true, name: true, email: true } },
                event: { select: { id: true, name: true, date: true, status: true } },
              },
            })
          : await tx.registration.create({
              data: {
                userId: user.id,
                eventId: event.id,
                status: RegistrationStatus.CONFIRMED,
              },
              include: {
                user: { select: { id: true, name: true, email: true } },
                event: { select: { id: true, name: true, date: true, status: true } },
              },
            });

        return {
          success: true,
          statusCode: 201,
          remainingSeats,
          registration: formatRegistration(saved),
        };
      } catch (err: any) {
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
    })
  );
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
      user: { select: { id: true, name: true, email: true } },
      event: { select: { id: true, name: true, date: true, status: true } },
    },
  });

  if (!reg || reg.status === RegistrationStatus.CANCELLED || reg.status === "CANCELLED") {
    return { registered: false, registration: null };
  }

  return {
    registered: true,
    registration: formatRegistration(reg),
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

  return registrations.map((r: any) => formatRegistration(r));
}
