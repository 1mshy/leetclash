/**
 * Minimal fetch helper for the LeetClash REST api service.
 * The backend may be down in early development — callers get a typed
 * error result instead of an exception.
 */
import type {
  CreateRoomResponse,
  CreateSubmissionResponse,
  GuestUser,
  JoinRoomResponse,
  Language,
  MatchDetail,
  RematchResponse,
  SubmissionResult,
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

  // Fastify rejects an empty body when content-type is application/json.
  const res = await apiFetch<GuestUser>("/users/guest", {
    method: "POST",
    body: JSON.stringify({}),
  });
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

// ─── Match + submission endpoints (Phase 1) ──────────────────────────────────

export async function getMatch(matchId: string): Promise<ApiResult<MatchDetail>> {
  return apiFetch<MatchDetail>(`/matches/${encodeURIComponent(matchId)}`);
}

export async function requestRematch(
  matchId: string,
): Promise<ApiResult<RematchResponse>> {
  const guest = await ensureGuest();
  if (!guest.ok) return guest;
  return apiFetch<RematchResponse>(`/matches/${encodeURIComponent(matchId)}/rematch`, {
    method: "POST",
    body: JSON.stringify({ userId: guest.data.id }),
  });
}

export async function createSubmission(params: {
  matchId: string;
  language: Language;
  source: string;
  kind: "run" | "submit";
}): Promise<ApiResult<CreateSubmissionResponse>> {
  const guest = await ensureGuest();
  if (!guest.ok) return guest;
  return apiFetch<CreateSubmissionResponse>("/submissions", {
    method: "POST",
    body: JSON.stringify({ ...params, userId: guest.data.id }),
  });
}

export async function getSubmission(
  submissionId: string,
): Promise<ApiResult<SubmissionResult>> {
  return apiFetch<SubmissionResult>(
    `/submissions/${encodeURIComponent(submissionId)}`,
  );
}

/** Poll a submission until judging finishes (or the deadline passes). */
export async function pollSubmission(
  submissionId: string,
  { intervalMs = 750, timeoutMs = 90_000 } = {},
): Promise<ApiResult<SubmissionResult>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await getSubmission(submissionId);
    if (!res.ok) return res;
    if (res.data.status === "done") return res;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return { ok: false, error: "judging timed out — try again" };
}
