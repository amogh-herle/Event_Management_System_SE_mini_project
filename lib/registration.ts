import { Prisma, RegistrationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const DUPLICATE_REGISTRATION_ERROR = "Already registered for this event";
export const EVENT_CANCELLED_ERROR = "Cannot register for a cancelled event";
export const EVENT_NOT_FOUND_ERROR = "Event not found";
export const USER_NOT_FOUND_ERROR = "User not found";
export const USER_SUSPENDED_ERROR = "User account is suspended";
export const AUTH_REQUIRED_ERROR = "Authentication required";

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
    title: string;
    date: Date;
    isCancelled: boolean;
  };
}

export interface RegisterResult {
  success: boolean;
  statusCode: number;
  registration?: RegisterResultRegistration;
  error?: string;
}

export type PrismaClientLike = any;

/**
 * Register a user for an event with duplicate prevention.
 *
 * Implements FR-007:
 * - Valid registration creates exactly one record (user, event, timestamp, status).
 * - Second registration attempt for the same user+event is rejected.
 * - Handles concurrent duplicate registrations atomically via DB-level unique constraint (P2002).
 * - Blocks registration for cancelled or non-existent events.
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

  // 2. Validate Event
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, title: true, date: true, isCancelled: true },
  });

  if (!event) {
    return {
      success: false,
      statusCode: 404,
      error: EVENT_NOT_FOUND_ERROR,
    };
  }

  if (event.isCancelled) {
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

  if (existing) {
    if (existing.status !== RegistrationStatus.CANCELLED) {
      return {
        success: false,
        statusCode: 409,
        error: DUPLICATE_REGISTRATION_ERROR,
      };
    }

    // If previously cancelled, reactivate the existing record
    try {
      const updated = await db.registration.update({
        where: { id: existing.id },
        data: {
          status: RegistrationStatus.CONFIRMED,
          updatedAt: new Date(),
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          event: { select: { id: true, title: true, date: true, isCancelled: true } },
        },
      });

      return {
        success: true,
        statusCode: 201,
        registration: {
          id: updated.id,
          userId: updated.userId,
          eventId: updated.eventId,
          status: "confirmed",
          rawStatus: updated.status,
          timestamp: updated.createdAt,
          createdAt: updated.createdAt,
          user: updated.user,
          event: updated.event,
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

  // 4. Create registration record (with DB-level unique constraint guard)
  try {
    const registration = await db.registration.create({
      data: {
        userId: user.id,
        eventId: event.id,
        status: RegistrationStatus.CONFIRMED,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        event: { select: { id: true, title: true, date: true, isCancelled: true } },
      },
    });

    return {
      success: true,
      statusCode: 201,
      registration: {
        id: registration.id,
        userId: registration.userId,
        eventId: registration.eventId,
        status: "confirmed",
        rawStatus: registration.status,
        timestamp: registration.createdAt,
        createdAt: registration.createdAt,
        user: registration.user,
        event: registration.event,
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
      event: { select: { id: true, title: true, date: true, isCancelled: true } },
    },
  });

  if (!reg || reg.status === RegistrationStatus.CANCELLED) {
    return { registered: false, registration: null };
  }

  return {
    registered: true,
    registration: {
      id: reg.id,
      userId: reg.userId,
      eventId: reg.eventId,
      status: reg.status === RegistrationStatus.CONFIRMED ? "confirmed" : reg.status.toLowerCase(),
      timestamp: reg.createdAt,
      createdAt: reg.createdAt,
      event: reg.event,
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
      event: { select: { id: true, title: true, date: true, isCancelled: true } },
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return registrations.map((r: any) => ({
    id: r.id,
    userId: r.userId,
    eventId: r.eventId,
    status: typeof r.status === "string" ? r.status.toLowerCase() : String(r.status).toLowerCase(),
    rawStatus: r.status,
    timestamp: r.createdAt,
    createdAt: r.createdAt,
    event: r.event,
    user: r.user,
  }));
}
