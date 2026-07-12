/**
 * Minimal fetch helper for the LeetClash REST api service.
 * The backend may be down in early development — callers get a typed
 * error result instead of an exception.
 */

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

// ─── Room endpoints (Phase 1 §1.1: private rooms via invite code) ────────────
// TODO: these routes don't exist on the api service yet; shapes are provisional.

export interface CreateRoomResponse {
  roomCode: string;
  matchId: string;
}

export function createRoom(): Promise<ApiResult<CreateRoomResponse>> {
  return apiFetch<CreateRoomResponse>("/rooms", { method: "POST" });
}

export interface JoinRoomResponse {
  matchId: string;
}

export function joinRoom(code: string): Promise<ApiResult<JoinRoomResponse>> {
  return apiFetch<JoinRoomResponse>(`/rooms/${encodeURIComponent(code)}/join`, {
    method: "POST",
  });
}
