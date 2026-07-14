import { z } from "zod";

/**
 * Guest identity — Phase 0 stand-in until better-auth sessions land.
 * `POST /users/guest` returns this; the web caches it in localStorage.
 */
export const GuestUser = z.object({
  id: z.string().uuid(),
  handle: z.string(),
});
export type GuestUser = z.infer<typeof GuestUser>;
