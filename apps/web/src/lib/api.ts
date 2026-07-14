/**
 * Minimal fetch helper for the LeetClash REST api service.
 * The backend may be down in early development — callers get a typed
 * error result instead of an exception.
 */
import type {
  CreateRoomResponse,
  GuestUser,
  JoinRoomResponse,
} from "@leetclash/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (!res.ok) {
      return { ok: false, error: `API error ${res.status}: ${res.statusText}` };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return {
      ok: false,
      error: `Could not reach the API at ${API_URL} — is the backend running?`,
    };
  }
}

// ─── Guest identity (Phase 0 stand-in for auth) ──────────────────────────────
// Registered once via POST /users/guest, then cached in localStorage. If the
// dev database is reset the cached id goes stale — clear localStorage.

const GUEST_KEY = "leetclash:guest";

export function getStoredGuest(): GuestUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(GUEST_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GuestUser;
  } catch {
    return null;
  }
}

async function ensureGuest(): Promise<ApiResult<GuestUser>> {
  const existing = getStoredGuest();
  if (existing) return { ok: true, data: existing };

  const res = await apiFetch<GuestUser>("/users/guest", { method: "POST" });
  if (res.ok) {
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(res.data));
  }
  return res;
}

// ─── Room endpoints (Phase 1 §1.1: private rooms via invite code) ────────────
// Request/response shapes live in @leetclash/shared next to the zod schemas
// the api validates with.

export async function createRoom(): Promise<ApiResult<CreateRoomResponse>> {
  const guest = await ensureGuest();
  if (!guest.ok) return guest;
  return apiFetch<CreateRoomResponse>("/rooms", {
    method: "POST",
    body: JSON.stringify({ hostId: guest.data.id }),
  });
}

export async function joinRoom(
  code: string,
): Promise<ApiResult<JoinRoomResponse>> {
  const guest = await ensureGuest();
  if (!guest.ok) return guest;
  return apiFetch<JoinRoomResponse>(`/rooms/${encodeURIComponent(code)}/join`, {
    method: "POST",
    body: JSON.stringify({ userId: guest.data.id }),
  });
}
