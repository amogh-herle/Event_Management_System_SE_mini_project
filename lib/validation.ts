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

export const registerEventSchema = z.object({
  eventId: z.string().trim().min(1, "Event ID is required"),
  userId: z.string().trim().min(1, "User ID is required").optional(),
  userEmail: z.string().trim().toLowerCase().email("Invalid user email").optional(),
});

export type RegisterEventInput = z.infer<typeof registerEventSchema>;
