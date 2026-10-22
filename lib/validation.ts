import { z } from "zod";

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
});

export type SignupInput = z.infer<typeof signupSchema>;

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
      })
    )
    .transform((val) => Number(val)),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
