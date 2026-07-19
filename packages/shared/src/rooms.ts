import { z } from "zod";
import { QueueMode } from "./queue.js";

// Room REST DTOs (private rooms, PLAN §1.1). Single source of truth for the
// api routes and the web client — request bodies and response shapes must
// never drift apart again.

export const INVITE_CODE_LENGTH = 6;

export const CreateRoomRequest = z.object({
  hostId: z.string().uuid(),
  /** Any shipped mode; perf modes in a room are cross-language (labeled unfair, §1.2). */
  mode: QueueMode.default("speed_race"),
  /** Omitted = the mode's default window (MODE_SPECS). */
  timeLimitSec: z.number().int().positive().max(3600).optional(),
});
export type CreateRoomRequest = z.infer<typeof CreateRoomRequest>;

export const CreateRoomResponse = z.object({
  matchId: z.string().uuid(),
  inviteCode: z.string().length(INVITE_CODE_LENGTH),
});
export type CreateRoomResponse = z.infer<typeof CreateRoomResponse>;

export const JoinRoomRequest = z.object({
  userId: z.string().uuid(),
});
export type JoinRoomRequest = z.infer<typeof JoinRoomRequest>;

export const JoinRoomResponse = z.object({
  matchId: z.string().uuid(),
});
export type JoinRoomResponse = z.infer<typeof JoinRoomResponse>;
