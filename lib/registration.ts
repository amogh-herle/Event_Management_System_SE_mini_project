import { Prisma, RegistrationStatus, EventStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  waitlistPromotionEmail,
  registrationConfirmationEmail,
  registrationCancellationEmail,
  eventReminderEmail,
} from "@/lib/emailTemplates";
import { sendMail } from "@/lib/mailer";

export const DUPLICATE_REGISTRATION_ERROR = "Already registered for this event";
export const EVENT_CANCELLED_ERROR = "Cannot register for a cancelled event";
export const EVENT_NOT_FOUND_ERROR = "Event not found";
export const USER_NOT_FOUND_ERROR = "User not found";
export const USER_SUSPENDED_ERROR = "User account is suspended";
export const AUTH_REQUIRED_ERROR = "Authentication required";
export const EVENT_FULL_ERROR = "Event is full";
export const ALREADY_WAITLISTED_ERROR = "Already on the waitlist for this event";
export const EVENT_NOT_FULL_ERROR = "Event has available seats; waitlist is only available when capacity is reached";
export const REGISTRATION_NOT_FOUND_ERROR = "Registration not found";
export const CANNOT_CANCEL_CANCELLED_EVENT_ERROR = "Cannot cancel registration for a cancelled event";

export interface RegisterResultRegistration {
  id: string;
  userId: string;
  eventId: string;
  status: string; // 'confirmed' | 'cancelled' | 'waitlisted' | ...
  rawStatus: RegistrationStatus;
  timestamp: Date;
  createdAt: Date;
  waitlistPosition?: number;
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
    time?: string;
    venue?: string;
    category?: string;
    capacity?: number;
  };
}

export interface RegisterResult {
  success: boolean;
  statusCode: number;
  registration?: RegisterResultRegistration;
  error?: string;
  remainingSeats?: number;
  waitlistPosition?: number;
}

export interface CancelResult {
  success: boolean;
  statusCode: number;
  error?: string;
  message?: string;
  registration?: RegisterResultRegistration;
  promotedRegistration?: RegisterResultRegistration;
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
  status: RegistrationStatus | string;
  createdAt: Date;
  user?: { id: string; name: string; email: string } | null;
  event?: { id: string; name: string; date: Date; status: EventStatus | string } | null;
  waitlistPosition?: number;
}): RegisterResultRegistration {
  return {
    id: reg.id,
    userId: reg.userId,
    eventId: reg.eventId,
    status: toApiStatus(reg.status),
    rawStatus: reg.status as RegistrationStatus,
    timestamp: reg.createdAt,
    createdAt: reg.createdAt,
    waitlistPosition: reg.waitlistPosition,
    user: reg.user ?? undefined,
    event: reg.event
      ? {
          id: reg.event.id,
          name: (reg.event as any).name || (reg.event as any).title,
          date: reg.event.date,
          status: reg.event.status,
          time: (reg.event as any).time,
          venue: (reg.event as any).venue,
          category: (reg.event as any).category,
          capacity: (reg.event as any).capacity,
        }
      : undefined,
  };
}

// Monotonically increasing Date generator to ensure queue timestamps never
// collide within the same millisecond, strictly preserving FIFO order.
let lastMonotonicTime = 0;
export function getMonotonicDate(): Date {
  const now = Date.now();
  if (now <= lastMonotonicTime) {
    lastMonotonicTime += 1;
  } else {
    lastMonotonicTime = now;
  }
  return new Date(lastMonotonicTime);
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

// ─────────────────────────────────────────────
// Notification Listeners & Dispatch
// ─────────────────────────────────────────────
export type NotificationType =
  | "WAITLIST_PROMOTION"
  | "REGISTRATION_CONFIRMATION"
  | "CANCELLATION_CONFIRMATION"
  | "EVENT_REMINDER";

export interface DispatchedNotification {
  to: string;
  subject: string;
  type: NotificationType;
  userId: string;
  eventId: string;
  timestamp: Date;
  details?: Record<string, any>;
}

export type NotificationLogger = (notification: DispatchedNotification) => void | Promise<void>;

let allNotificationListeners: NotificationLogger[] = [];
let waitlistNotificationListeners: NotificationLogger[] = [];

export function onNotification(listener: NotificationLogger): () => void {
  allNotificationListeners.push(listener);
  return () => {
    allNotificationListeners = allNotificationListeners.filter((l) => l !== listener);
  };
}

export function onWaitlistNotification(listener: NotificationLogger): () => void {
  waitlistNotificationListeners.push(listener);
  return () => {
    waitlistNotificationListeners = waitlistNotificationListeners.filter((l) => l !== listener);
  };
}

export function clearNotificationListeners(): void {
  allNotificationListeners = [];
  waitlistNotificationListeners = [];
}

export async function sendWaitlistPromotionNotification(
  promotedReg: {
    userId: string;
    eventId: string;
    user?: { email: string; name: string } | null;
    event?: { name?: string; title?: string; date?: Date | string } | null;
  },
  db?: PrismaClientLike
): Promise<boolean> {
  let user = promotedReg.user;
  if (!user && promotedReg.userId && db) {
    if (typeof db.user?.findUnique === "function") {
      user = await db.user.findUnique({ where: { id: promotedReg.userId } });
    } else if (db.users instanceof Map) {
      user = db.users.get(promotedReg.userId);
    }
  }

  let event = promotedReg.event;
  if (!event && promotedReg.eventId && db) {
    if (typeof db.event?.findUnique === "function") {
      event = await db.event.findUnique({ where: { id: promotedReg.eventId } });
    } else if (db.events instanceof Map) {
      event = db.events.get(promotedReg.eventId);
    }
  }

  const email = user?.email;
  const name = user?.name ?? "Participant";
  const eventName = (event as any)?.name ?? (event as any)?.title ?? "Event";
  const eventDate = event?.date;

  const notification: DispatchedNotification = {
    to: email ?? "",
    subject: `Seat Confirmed: You've been promoted from the waitlist for ${eventName}`,
    type: "WAITLIST_PROMOTION",
    userId: promotedReg.userId,
    eventId: promotedReg.eventId,
    timestamp: new Date(),
    details: { eventName, eventDate },
  };

  for (const listener of allNotificationListeners) {
    try {
      await listener(notification);
    } catch (e) {
      console.error("[notifications] listener error:", e);
    }
  }

  for (const listener of waitlistNotificationListeners) {
    try {
      await listener(notification);
    } catch (e) {
      console.error("[notifications] waitlist listener error:", e);
    }
  }

  if (!email) return false;

  try {
    const { subject, html } = waitlistPromotionEmail(name, eventName, eventDate);
    await sendMail(email, subject, html);
    return true;
  } catch (err) {
    console.error(`[notifications] failed to send waitlist promotion email to ${email}:`, err);
    return false;
  }
}

export async function sendRegistrationNotification(
  reg: {
    userId: string;
    eventId: string;
    user?: { email: string; name: string } | null;
    event?: { name?: string; title?: string; date?: Date | string; time?: string; venue?: string } | null;
  },
  db?: PrismaClientLike
): Promise<boolean> {
  let user = reg.user;
  if (!user && reg.userId && db) {
    if (typeof db.user?.findUnique === "function") {
      user = await db.user.findUnique({ where: { id: reg.userId } });
    } else if (db.users instanceof Map) {
      user = db.users.get(reg.userId);
    }
  }

  let event = reg.event;
  if ((!event || (event as any).venue === undefined) && reg.eventId && db) {
    if (typeof db.event?.findUnique === "function") {
      const fullEvt = await db.event.findUnique({ where: { id: reg.eventId } });
      if (fullEvt) {
        event = { ...fullEvt, ...event, venue: fullEvt.venue, time: fullEvt.time };
      }
    } else if (db.events instanceof Map) {
      const fullEvt = db.events.get(reg.eventId);
      if (fullEvt) {
        event = { ...fullEvt, ...event, venue: fullEvt.venue, time: fullEvt.time };
      }
    }
  }

  const email = user?.email;
  const name = user?.name ?? "Participant";
  const eventName = (event as any)?.name ?? (event as any)?.title ?? "Event";
  const eventDate = event?.date;
  const eventTime = (event as any)?.time;
  const eventVenue = (event as any)?.venue;

  const notification: DispatchedNotification = {
    to: email ?? "",
    subject: `Registration Confirmed: ${eventName}`,
    type: "REGISTRATION_CONFIRMATION",
    userId: reg.userId,
    eventId: reg.eventId,
    timestamp: new Date(),
    details: { eventName, eventDate, eventTime, eventVenue },
  };

  for (const listener of allNotificationListeners) {
    try {
      await listener(notification);
    } catch (e) {
      console.error("[notifications] listener error:", e);
    }
  }

  if (!email) return false;

  try {
    const { subject, html } = registrationConfirmationEmail(name, eventName, eventDate, eventTime, eventVenue);
    await sendMail(email, subject, html);
    return true;
  } catch (err) {
    console.error(`[notifications] failed to send registration confirmation email to ${email}:`, err);
    return false;
  }
}

export async function sendCancellationNotification(
  reg: {
    userId: string;
    eventId: string;
    user?: { email: string; name: string } | null;
    event?: { name?: string; title?: string; date?: Date | string } | null;
  },
  db?: PrismaClientLike
): Promise<boolean> {
  let user = reg.user;
  if (!user && reg.userId && db) {
    if (typeof db.user?.findUnique === "function") {
      user = await db.user.findUnique({ where: { id: reg.userId } });
    } else if (db.users instanceof Map) {
      user = db.users.get(reg.userId);
    }
  }

  let event = reg.event;
  if ((!event || (event as any).venue === undefined) && reg.eventId && db) {
    if (typeof db.event?.findUnique === "function") {
      const fullEvt = await db.event.findUnique({ where: { id: reg.eventId } });
      if (fullEvt) {
        event = { ...fullEvt, ...event, venue: fullEvt.venue, time: fullEvt.time };
      }
    } else if (db.events instanceof Map) {
      const fullEvt = db.events.get(reg.eventId);
      if (fullEvt) {
        event = { ...fullEvt, ...event, venue: fullEvt.venue, time: fullEvt.time };
      }
    }
  }

  const email = user?.email;
  const name = user?.name ?? "Participant";
  const eventName = (event as any)?.name ?? (event as any)?.title ?? "Event";
  const eventDate = event?.date;

  const notification: DispatchedNotification = {
    to: email ?? "",
    subject: `Registration Cancelled: ${eventName}`,
    type: "CANCELLATION_CONFIRMATION",
    userId: reg.userId,
    eventId: reg.eventId,
    timestamp: new Date(),
    details: { eventName, eventDate },
  };

  for (const listener of allNotificationListeners) {
    try {
      await listener(notification);
    } catch (e) {
      console.error("[notifications] listener error:", e);
    }
  }

  if (!email) return false;

  try {
    const { subject, html } = registrationCancellationEmail(name, eventName, eventDate);
    await sendMail(email, subject, html);
    return true;
  } catch (err) {
    console.error(`[notifications] failed to send cancellation email to ${email}:`, err);
    return false;
  }
}

export async function sendEventReminderNotification(
  reg: {
    userId: string;
    eventId: string;
    user?: { email: string; name: string } | null;
    event: { name?: string; title?: string; date: Date | string; time?: string; venue?: string };
  },
  db?: PrismaClientLike
): Promise<boolean> {
  let user = reg.user;
  if (!user && reg.userId && db) {
    if (typeof db.user?.findUnique === "function") {
      user = await db.user.findUnique({ where: { id: reg.userId } });
    } else if (db.users instanceof Map) {
      user = db.users.get(reg.userId);
    }
  }

  const email = user?.email;
  const name = user?.name ?? "Participant";
  const eventName = (reg.event as any).name ?? (reg.event as any).title ?? "Event";
  const eventDate = reg.event.date;
  const eventTime = reg.event.time;
  const eventVenue = reg.event.venue;

  const notification: DispatchedNotification = {
    to: email ?? "",
    subject: `Reminder: ${eventName} is coming up`,
    type: "EVENT_REMINDER",
    userId: reg.userId,
    eventId: reg.eventId,
    timestamp: new Date(),
    details: { eventName, eventDate, eventTime, eventVenue },
  };

  for (const listener of allNotificationListeners) {
    try {
      await listener(notification);
    } catch (e) {
      console.error("[notifications] listener error:", e);
    }
  }

  if (!email) return false;

  try {
    const { subject, html } = eventReminderEmail(name, eventName, eventDate, eventTime, eventVenue);
    await sendMail(email, subject, html);
    return true;
  } catch (err) {
    console.error(`[notifications] failed to send event reminder email to ${email}:`, err);
    return false;
  }
}

export interface SendEventRemindersOptions {
  windowHours?: number; // default: 24
  referenceDate?: Date; // default: now
}

export interface SendEventRemindersResult {
  success: boolean;
  eventsProcessed: number;
  remindersSent: number;
  notifications: Array<{
    userId: string;
    eventId: string;
    email: string;
    eventName: string;
    eventDate: Date | string;
    eventTime?: string;
  }>;
}

export async function sendEventReminders(
  options: SendEventRemindersOptions = {},
  db: PrismaClientLike = prisma
): Promise<SendEventRemindersResult> {
  const windowHours = options.windowHours ?? 24;
  const refDate = options.referenceDate ? new Date(options.referenceDate) : new Date();
  const windowEnd = new Date(refDate.getTime() + windowHours * 60 * 60 * 1000);

  let upcomingEvents: any[] = [];

  if (typeof db.event?.findMany === "function") {
    try {
      upcomingEvents = await db.event.findMany({
        where: {
          status: EventStatus.ACTIVE,
          date: {
            gte: refDate,
            lte: windowEnd,
          },
        },
        include: {
          registrations: {
            where: {
              status: RegistrationStatus.CONFIRMED,
            },
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });
    } catch {
      try {
        const allEvents = await db.event.findMany({});
        upcomingEvents = allEvents.filter((e: any) => {
          const d = new Date(e.date);
          const isActive =
            e.status === EventStatus.ACTIVE ||
            e.status === "ACTIVE" ||
            (!e.isCancelled && !e.status);
          return isActive && d >= refDate && d <= windowEnd;
        });
      } catch {
        // Fallback to in-memory store if DB is offline or unconfigured
        try {
          const { inMemoryEvents } = await import("@/app/api/events/store");
          upcomingEvents = inMemoryEvents.filter((e: any) => {
            const d = new Date(e.date);
            const isActive = e.status === "ACTIVE";
            return isActive && d >= refDate && d <= windowEnd;
          });
        } catch {
          upcomingEvents = [];
        }
      }
    }
  } else if (db.events instanceof Map) {
    upcomingEvents = Array.from(db.events.values()).filter((e: any) => {
      const d = new Date(e.date);
      const isActive =
        e.status === EventStatus.ACTIVE ||
        e.status === "ACTIVE" ||
        (!e.isCancelled && e.status !== EventStatus.CANCELLED);
      return isActive && d >= refDate && d <= windowEnd;
    });
  }

  let remindersSent = 0;
  const notifications: Array<{
    userId: string;
    eventId: string;
    email: string;
    eventName: string;
    eventDate: Date | string;
    eventTime?: string;
  }> = [];

  for (const evt of upcomingEvents) {
    let confirmedRegs = evt.registrations;
    if (!confirmedRegs) {
      if (typeof db.registration?.findMany === "function") {
        try {
          confirmedRegs = await db.registration.findMany({
            where: {
              eventId: evt.id,
              status: RegistrationStatus.CONFIRMED,
            },
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          });
        } catch {
          confirmedRegs = null;
        }
      }
      if (!confirmedRegs && db.registrations instanceof Map) {
        confirmedRegs = Array.from(db.registrations.values()).filter(
          (r: any) =>
            r.eventId === evt.id &&
            (r.status === RegistrationStatus.CONFIRMED || r.status === "CONFIRMED")
        );
      }
    }

    if (Array.isArray(confirmedRegs)) {
      for (const reg of confirmedRegs) {
        if (reg.status !== RegistrationStatus.CONFIRMED && reg.status !== "CONFIRMED") continue;

        let u = reg.user;
        if (!u && reg.userId) {
          if (typeof db.user?.findUnique === "function") {
            u = await db.user.findUnique({ where: { id: reg.userId } });
          } else if (db.users instanceof Map) {
            u = db.users.get(reg.userId);
          }
        }

        if (u?.email) {
          await sendEventReminderNotification(
            {
              userId: reg.userId,
              eventId: evt.id,
              user: u,
              event: {
                name: evt.name || evt.title,
                date: evt.date,
                time: evt.time,
                venue: evt.venue,
              },
            },
            db
          );
          remindersSent++;
          notifications.push({
            userId: reg.userId,
            eventId: evt.id,
            email: u.email,
            eventName: evt.name || evt.title,
            eventDate: evt.date,
            eventTime: evt.time,
          });
        }
      }
    }
  }

  return {
    success: true,
    eventsProcessed: upcomingEvents.length,
    remindersSent,
    notifications,
  };
}

async function calculateWaitlistPosition(
  userId: string,
  eventId: string,
  createdAt: Date,
  db: PrismaClientLike
): Promise<number> {
  if (typeof db.registration?.findMany === "function") {
    const list = await db.registration.findMany({
      where: { eventId, status: RegistrationStatus.WAITLISTED },
    });
    const waitlisted = list.filter(
      (r: any) => r.status === RegistrationStatus.WAITLISTED || r.status === "WAITLISTED"
    );
    waitlisted.sort((a: any, b: any) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (diff !== 0) return diff;
      return String(a.id).localeCompare(String(b.id));
    });
    const index = waitlisted.findIndex((r: any) => r.userId === userId);
    if (index >= 0) return index + 1;
    return waitlisted.length + 1;
  }

  if (typeof db.registration?.count === "function") {
    const count = await db.registration.count({
      where: {
        eventId,
        status: RegistrationStatus.WAITLISTED,
        createdAt: { lte: createdAt },
      },
    });
    return Math.max(1, count);
  }
  return 1;
}

/**
 * Register a user for an event with duplicate prevention and capacity check.
 * If waitlist: true is provided and the event is full, adds the user to the waitlist.
 */
export async function registerForEvent(
  params: {
    userId?: string;
    userEmail?: string;
    eventId: string;
    waitlist?: boolean;
  },
  db: PrismaClientLike = prisma
): Promise<RegisterResult> {
  const { eventId, userId, userEmail, waitlist } = params;

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
        if (existing.status === RegistrationStatus.WAITLISTED || existing.status === "WAITLISTED") {
          const position = await calculateWaitlistPosition(user.id, event.id, existing.createdAt, tx);
          return {
            success: false,
            statusCode: 409,
            error: ALREADY_WAITLISTED_ERROR,
            waitlistPosition: position,
            registration: {
              ...formatRegistration(existing),
              waitlistPosition: position,
            },
          };
        }
        return {
          success: false,
          statusCode: 409,
          error: DUPLICATE_REGISTRATION_ERROR,
          registration: formatRegistration(existing),
        };
      }

      // 4. Capacity check (FR-008 & FR-009a)
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
        if (!waitlist) {
          return {
            success: false,
            statusCode: 400,
            error: EVENT_FULL_ERROR,
            remainingSeats: 0,
          };
        }

        // Waitlist path: user requested to join waitlist when full
        try {
          const now = getMonotonicDate();
          const saved = existing
            ? await tx.registration.update({
                where: { id: existing.id },
                data: {
                  status: RegistrationStatus.WAITLISTED,
                  createdAt: now,
                  updatedAt: now,
                },
                include: {
                  user: { select: { id: true, name: true, email: true } },
                  event: { select: { id: true, name: true, date: true, status: true } },
                },
              })
            : await tx.registration.create({
                data: {
                  userId: user.id,
                  eventId: event.id,
                  status: RegistrationStatus.WAITLISTED,
                  createdAt: now,
                },
                include: {
                  user: { select: { id: true, name: true, email: true } },
                  event: { select: { id: true, name: true, date: true, status: true } },
                },
              });

          const position = await calculateWaitlistPosition(user.id, event.id, saved.createdAt, tx);
          return {
            success: true,
            statusCode: 201,
            remainingSeats: 0,
            waitlistPosition: position,
            registration: {
              ...formatRegistration(saved),
              waitlistPosition: position,
            },
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
      }

      const remainingSeats = Math.max(0, eventCapacity - (confirmedCount + 1));

      // 5. Normal confirmed registration
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

        // Send registration confirmation notification and email (FR-009b / UC-05 Step 7 / IT_02)
        await sendRegistrationNotification(saved, tx);

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
 * Explicitly join the waitlist for a full event.
 */
export async function joinWaitlist(
  params: {
    userId?: string;
    userEmail?: string;
    eventId: string;
  },
  db: PrismaClientLike = prisma
): Promise<RegisterResult & { waitlistPosition?: number }> {
  const { eventId, userId, userEmail } = params;

  if (!eventId || !eventId.trim()) {
    return {
      success: false,
      statusCode: 400,
      error: "Event ID is required",
    };
  }

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
        if (existing.status === RegistrationStatus.WAITLISTED || existing.status === "WAITLISTED") {
          const position = await calculateWaitlistPosition(user.id, event.id, existing.createdAt, tx);
          return {
            success: false,
            statusCode: 409,
            error: ALREADY_WAITLISTED_ERROR,
            waitlistPosition: position,
            registration: {
              ...formatRegistration(existing),
              waitlistPosition: position,
            },
          };
        }
        return {
          success: false,
          statusCode: 409,
          error: DUPLICATE_REGISTRATION_ERROR,
          registration: formatRegistration(existing),
        };
      }

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

      if (confirmedCount < eventCapacity) {
        return {
          success: false,
          statusCode: 400,
          error: EVENT_NOT_FULL_ERROR,
          remainingSeats: Math.max(0, eventCapacity - confirmedCount),
        };
      }

      try {
        const now = getMonotonicDate();
        const saved = existing
          ? await tx.registration.update({
              where: { id: existing.id },
              data: {
                status: RegistrationStatus.WAITLISTED,
                createdAt: now,
                updatedAt: now,
              },
              include: {
                user: { select: { id: true, name: true, email: true } },
                event: { select: { id: true, name: true, date: true, status: true } },
              },
            })
          : await tx.registration.create({
              data: {
                userId: user.id,
                eventId: event.id,
                status: RegistrationStatus.WAITLISTED,
                createdAt: now,
              },
              include: {
                user: { select: { id: true, name: true, email: true } },
                event: { select: { id: true, name: true, date: true, status: true } },
              },
            });

        const position = await calculateWaitlistPosition(user.id, event.id, saved.createdAt, tx);

        return {
          success: true,
          statusCode: 201,
          waitlistPosition: position,
          registration: {
            ...formatRegistration(saved),
            waitlistPosition: position,
          },
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
 * Cancel a user's registration for an event.
 * If the user was confirmed and waitlisted participants exist, auto-promotes the first
 * waitlisted user in FIFO order and notifies them immediately.
 */
export async function cancelRegistration(
  params: {
    userId?: string;
    userEmail?: string;
    eventId: string;
  },
  db: PrismaClientLike = prisma
): Promise<CancelResult> {
  const { eventId, userId, userEmail } = params;

  if (!eventId || !eventId.trim()) {
    return {
      success: false,
      statusCode: 400,
      error: "Event ID is required",
    };
  }

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
          error: CANNOT_CANCEL_CANCELLED_EVENT_ERROR,
        };
      }

      const existing = await tx.registration.findUnique({
        where: {
          userId_eventId: {
            userId: user.id,
            eventId: event.id,
          },
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          event: { select: { id: true, name: true, date: true, status: true, capacity: true } },
        },
      });

      if (!existing || existing.status === RegistrationStatus.CANCELLED || existing.status === "CANCELLED") {
        return {
          success: false,
          statusCode: 404,
          error: REGISTRATION_NOT_FOUND_ERROR,
        };
      }

      const wasWaitlisted =
        existing.status === RegistrationStatus.WAITLISTED || existing.status === "WAITLISTED";

      const cancelled = await tx.registration.update({
        where: { id: existing.id },
        data: {
          status: RegistrationStatus.CANCELLED,
          updatedAt: new Date(),
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          event: { select: { id: true, name: true, date: true, status: true } },
        },
      });

      if (wasWaitlisted) {
        await sendCancellationNotification(cancelled, tx);
        return {
          success: true,
          statusCode: 200,
          message: "Waitlist entry cancelled",
          registration: formatRegistration(cancelled),
        };
      }

      // Seat was freed! Find first waitlisted user in FIFO order (createdAt asc, then id asc)
      let firstWaitlisted: any = null;
      if (typeof tx.registration?.findFirst === "function") {
        firstWaitlisted = await tx.registration.findFirst({
          where: {
            eventId: event.id,
            status: RegistrationStatus.WAITLISTED,
          },
          orderBy: [
            { createdAt: "asc" },
            { id: "asc" },
          ],
          include: {
            user: { select: { id: true, name: true, email: true } },
            event: { select: { id: true, name: true, date: true, status: true } },
          },
        });
      } else if (typeof tx.registration?.findMany === "function") {
        const list = await tx.registration.findMany({
          where: {
            eventId: event.id,
            status: RegistrationStatus.WAITLISTED,
          },
        });
        const waitlisted = list.filter(
          (r: any) => r.status === RegistrationStatus.WAITLISTED || r.status === "WAITLISTED"
        );
        waitlisted.sort((a: any, b: any) => {
          const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          if (diff !== 0) return diff;
          return String(a.id).localeCompare(String(b.id));
        });
        if (waitlisted.length > 0) {
          const match = waitlisted[0];
          let u = null;
          if (typeof tx.user?.findUnique === "function") {
            u = await tx.user.findUnique({ where: { id: match.userId } });
          }
          firstWaitlisted = {
            ...match,
            user: u ? { id: u.id, name: u.name, email: u.email } : match.user,
            event: match.event || event,
          };
        }
      }

      if (firstWaitlisted) {
        const promoted = await tx.registration.update({
          where: { id: firstWaitlisted.id },
          data: {
            status: RegistrationStatus.CONFIRMED,
            updatedAt: new Date(),
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
            event: { select: { id: true, name: true, date: true, status: true } },
          },
        });

        // Notify promoted user immediately
        await sendWaitlistPromotionNotification(promoted, tx);

        // Notify cancelling user immediately (FR-009b / UC-07 Step 7)
        await sendCancellationNotification(cancelled, tx);

        return {
          success: true,
          statusCode: 200,
          message: "Registration cancelled and next waitlisted user was auto-promoted",
          registration: formatRegistration(cancelled),
          promotedRegistration: formatRegistration(promoted),
          remainingSeats: 0,
        };
      }

      // No waitlist: seat count increases by 1
      const eventCapacity = typeof event.capacity === "number" ? event.capacity : 0;
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
      const remainingSeats = Math.max(0, eventCapacity - confirmedCount);

      // Notify cancelling user immediately (FR-009b / UC-07 Step 7)
      await sendCancellationNotification(cancelled, tx);

      return {
        success: true,
        statusCode: 200,
        message: "Registration cancelled",
        registration: formatRegistration(cancelled),
        remainingSeats,
      };
    })
  );
}

/**
 * Retrieve current waitlist position for a user on an event.
 */
export async function getWaitlistPosition(
  userId: string,
  eventId: string,
  db: PrismaClientLike = prisma
): Promise<number | null> {
  const reg = await db.registration.findUnique({
    where: {
      userId_eventId: {
        userId,
        eventId,
      },
    },
  });

  if (!reg || (reg.status !== RegistrationStatus.WAITLISTED && reg.status !== "WAITLISTED")) {
    return null;
  }

  return calculateWaitlistPosition(userId, eventId, reg.createdAt, db);
}

/**
 * Retrieve count of waitlisted participants for an event.
 */
export async function getWaitlistCount(
  eventId: string,
  db: PrismaClientLike = prisma
): Promise<number> {
  if (typeof db.registration?.count === "function") {
    return await db.registration.count({
      where: {
        eventId,
        status: RegistrationStatus.WAITLISTED,
      },
    });
  } else if (typeof db.registration?.findMany === "function") {
    const list = await db.registration.findMany({
      where: { eventId, status: RegistrationStatus.WAITLISTED },
    });
    return list.filter(
      (r: any) => r.status === RegistrationStatus.WAITLISTED || r.status === "WAITLISTED"
    ).length;
  }
  return 0;
}

/**
 * Retrieve current capacity metrics for an event.
 */
export async function getEventCapacity(
  eventId: string,
  db: PrismaClientLike = prisma
): Promise<{
  capacity: number;
  confirmedCount: number;
  waitlistCount: number;
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

  const waitlistCount = await getWaitlistCount(event.id, db);
  const capacity = typeof event.capacity === "number" ? event.capacity : 0;
  const remainingSeats = Math.max(0, capacity - confirmedCount);
  const isFull = remainingSeats <= 0;

  return {
    capacity,
    confirmedCount,
    waitlistCount,
    remainingSeats,
    isFull,
  };
}

/**
 * Check if a user is currently registered or waitlisted for an event.
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
    return { registered: false, isWaitlisted: false, waitlistPosition: null, registration: null };
  }

  const isWaitlisted = reg.status === RegistrationStatus.WAITLISTED || reg.status === "WAITLISTED";
  let waitlistPosition: number | null = null;
  if (isWaitlisted) {
    waitlistPosition = await getWaitlistPosition(userId, eventId, db);
  }

  const formatted = formatRegistration(reg);
  if (waitlistPosition !== null) {
    formatted.waitlistPosition = waitlistPosition;
  }

  return {
    registered: true,
    isWaitlisted,
    waitlistPosition,
    registration: formatted,
  };
}

/**
 * List registrations filtered by userId, eventId, or status.
 */
export async function listRegistrations(
  filter: { userId?: string; eventId?: string; status?: RegistrationStatus | string },
  db: PrismaClientLike = prisma
) {
  const where: any = {};
  if (filter.userId) where.userId = filter.userId;
  if (filter.eventId) where.eventId = filter.eventId;
  if (filter.status) where.status = filter.status;

  let rawList: any[] = [];
  if (typeof db.registration?.findMany === "function") {
    rawList = await db.registration.findMany({
      where,
      include: {
        event: {
          select: {
            id: true,
            name: true,
            date: true,
            status: true,
            time: true,
            venue: true,
            category: true,
            capacity: true,
          },
        },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  } else if (db.registrations instanceof Map) {
    rawList = Array.from(db.registrations.values()).filter((r: any) => {
      if (filter.userId && r.userId !== filter.userId) return false;
      if (filter.eventId && r.eventId !== filter.eventId) return false;
      if (filter.status && r.status !== filter.status) return false;
      return true;
    });
    rawList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const results = await Promise.all(
    rawList.map(async (r: any) => {
      const isWaitlisted =
        r.status === RegistrationStatus.WAITLISTED || r.status === "WAITLISTED";
      let pos: number | undefined;
      if (isWaitlisted) {
        try {
          pos = await calculateWaitlistPosition(r.userId, r.eventId, r.createdAt, db);
        } catch {}
      }
      const formatted = formatRegistration(r);
      if (pos !== undefined) {
        formatted.waitlistPosition = pos;
      }
      return formatted;
    })
  );

  return results;
}
