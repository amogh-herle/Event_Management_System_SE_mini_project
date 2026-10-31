import { z } from "zod";
import { Role } from "@prisma/client";

// Admin is intentionally excluded — it's never self-assignable at signup,
// only granted by an existing admin (FR-003c, not yet built).
export const SIGNUP_ROLES = [Role.PARTICIPANT, Role.ORGANIZER] as const;

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address")
    .max(254, "Email is too long"),
  // bcrypt ignores bytes past 72, so anything longer is silently truncated
  // (and a huge input wastes CPU hashing it) — cap it here instead.
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
  role: z.enum(SIGNUP_ROLES).default(Role.PARTICIPANT),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  // No complexity rules here — those only apply at signup time. A login
  // attempt just needs a non-empty password to compare against the hash.
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  // Same rules as signup — a reset shouldn't let someone set a weaker
  // password than account creation requires.
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const createEventSchema = z.object({
  name: z
    .string({ required_error: "Required field missing: name" })
    .trim()
    .min(1, "Required field missing: name")
    .max(150, "Name must be at most 150 characters"),
  description: z
    .string({ required_error: "Required field missing: description" })
    .trim()
    .min(1, "Required field missing: description")
    .max(2000, "Description must be at most 2000 characters"),
  date: z
    .string({ required_error: "Required field missing: date" })
    .trim()
    .min(1, "Required field missing: date")
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Enter a valid date",
    }),
  time: z
    .string({ required_error: "Required field missing: time" })
    .trim()
    .min(1, "Required field missing: time")
    .max(30, "Time must be at most 30 characters"),
  venue: z
    .string({ required_error: "Required field missing: venue" })
    .trim()
    .min(1, "Required field missing: venue")
    .max(200, "Venue must be at most 200 characters"),
  category: z
    .string({ required_error: "Required field missing: category" })
    .trim()
    .min(1, "Required field missing: category")
    .max(100, "Category must be at most 100 characters"),
  capacity: z
    .preprocess(
      (val) => (val === "" || val === null || val === undefined ? undefined : val),
      z.any().superRefine((val, ctx) => {
        if (val === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Required field missing: capacity",
          });
          return;
        }
        const num = Number(val);
        if (isNaN(num) || !Number.isInteger(num) || num <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Invalid capacity: capacity must be a positive integer",
          });
          return;
        }
        // Prisma's Int maps to Postgres's 4-byte signed integer (max
        // 2147483647); without a bound here, a value above that passes
        // validation and then throws at the database layer.
        if (num > 100_000) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Invalid capacity: must be 100,000 or less",
          });
          return;
        }
      })
    )
    .transform((val) => Number(val)),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;

// userId/userEmail are intentionally not accepted here — the registering
// user's identity always comes from the verified session (see
// app/api/registrations/route.ts), never from client-supplied input.
export const registerEventSchema = z.object({
  eventId: z.string().trim().min(1, "Event ID is required"),
  waitlist: z.boolean().optional(),
});

export type RegisterEventInput = z.infer<typeof registerEventSchema>;
