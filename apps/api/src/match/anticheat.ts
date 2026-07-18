/**
 * Post-match collusion detection (PLAN §6.5).
 *
 * Winnowing (MOSS-style) source fingerprints of the two opponents' accepted
 * solutions, compared by Jaccard similarity. A high score flags the match for a
 * human review queue (the `similarity_flags` table) — it is a *deterrent and
 * signal*, never an automatic penalty (§6: honest about limits). Runs as a
 * durable lifecycle job so it never blocks the finish path.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { matchPlayers, similarityFlags, submissions } from "../db/schema.js";

/** k-gram length + winnowing window (Schleimer et al. defaults, scaled for code). */
const KGRAM = 20;
const WINDOW = 4;
/** Jaccard ≥ this ⇒ flagged for review. Identical code ≈ 1.0. */
const FLAG_THRESHOLD = 0.8;

/** Strip whitespace + case so cosmetic edits don't hide a copy. */
function normalize(src: string): string {
  return src.toLowerCase().replace(/\s+/g, "");
}

/** djb2 hash of a k-gram. */
function hashKgram(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** Winnowing fingerprint: the set of selected k-gram hashes. */
export function fingerprint(src: string, k = KGRAM, w = WINDOW): Set<number> {
  const norm = normalize(src);
  if (norm.length < k) return new Set([hashKgram(norm)]);

  const hashes: number[] = [];
  for (let i = 0; i + k <= norm.length; i++) hashes.push(hashKgram(norm.slice(i, i + k)));

  const fp = new Set<number>();
  if (hashes.length < w) {
    fp.add(Math.min(...hashes));
    return fp;
  }
  for (let i = 0; i + w <= hashes.length; i++) {
    let min = Infinity;
    for (let j = i; j < i + w; j++) if (hashes[j]! <= min) min = hashes[j]!;
    fp.add(min);
  }
  return fp;
}

export function jaccard(a: Set<number>, b: Set<number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Best accepted source for a player in a match (latest accepted submit). */
async function acceptedSource(matchId: string, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ source: submissions.sourceInline })
    .from(submissions)
    .where(
      and(
        eq(submissions.matchId, matchId),
        eq(submissions.userId, userId),
        eq(submissions.kind, "submit"),
        eq(submissions.verdict, "accepted"),
      ),
    )
    .orderBy(desc(submissions.createdAt))
    .limit(1);
  return row?.source ?? null;
}

/**
 * Fingerprint both opponents' accepted solutions and record their similarity.
 * No-op unless both solved it (nothing to compare otherwise).
 */
export async function runSimilarityCheck(matchId: string): Promise<void> {
  const players = await db
    .select({ userId: matchPlayers.userId })
    .from(matchPlayers)
    .where(eq(matchPlayers.matchId, matchId));
  if (players.length !== 2) return;

  const sorted = [players[0]!.userId, players[1]!.userId].sort();
  const ua = sorted[0]!;
  const ub = sorted[1]!;
  const [sa, sb] = await Promise.all([
    acceptedSource(matchId, ua),
    acceptedSource(matchId, ub),
  ]);
  if (sa === null || sb === null) return; // need both to compare

  const score = jaccard(fingerprint(sa), fingerprint(sb));
  await db.insert(similarityFlags).values({
    matchId,
    userA: ua,
    userB: ub,
    score,
    flagged: score >= FLAG_THRESHOLD,
  });

  if (score >= FLAG_THRESHOLD) {
    console.warn(`[anticheat] match ${matchId} flagged: similarity ${score.toFixed(2)}`);
  }
}
