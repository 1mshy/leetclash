/**
 * Glicko-2 rating system (PLAN §1.3, §5 `ratings`).
 *
 * Pure implementation of Mark Glickman's "Example of the Glicko-2 system"
 * (glicko.net/glicko/glicko2.pdf). Each LeetClash match is treated as a
 * one-game rating period: we update a player's (rating, rd, volatility)
 * against the single opponent they just faced.
 *
 * The worked example in the paper (a 1500/200/0.06 player vs three opponents)
 * is reproduced by glicko.test.ts to pin the constants and the volatility
 * iteration — do not "simplify" the math without re-running that test.
 */

/** Tunables mirrored into the DB defaults (see db/schema.ts `ratings`). */
export const GLICKO = {
  DEFAULT_RATING: 1500,
  DEFAULT_RD: 350,
  DEFAULT_VOLATILITY: 0.06,
  /** System volatility constant τ: smaller = ratings move less on upsets. */
  TAU: 0.5,
  /** Glicko-2 internal scale factor (rating units per internal unit). */
  SCALE: 173.7178,
  /** Convergence tolerance for the volatility root-finder. */
  CONVERGENCE: 1e-6,
} as const;

export interface Rating {
  rating: number;
  rd: number;
  volatility: number;
}

/** One opponent in the rating period. score: 1 win, 0.5 draw, 0 loss. */
export interface GameResult {
  rating: number;
  rd: number;
  score: number;
}

const g = (phi: number): number => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));

const expectation = (mu: number, muJ: number, phiJ: number): number =>
  1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/**
 * Update one player's rating after a rating period of `results` games.
 * Returns fresh (rating, rd, volatility); the input is never mutated.
 *
 * With an empty `results` (the player sat out the period), only RD grows:
 * φ' = √(φ² + σ²) — the standard Glicko-2 idle-decay step.
 */
export function glicko2Update(
  player: Rating,
  results: GameResult[],
  tau: number = GLICKO.TAU,
): Rating {
  const { SCALE, CONVERGENCE } = GLICKO;

  // Step 2 — to the Glicko-2 scale.
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.rd / SCALE;
  const sigma = player.volatility;

  if (results.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { rating: player.rating, rd: phiStar * SCALE, volatility: sigma };
  }

  // Step 3 — estimated variance v of the player's rating from game outcomes.
  let vInv = 0;
  // Step 4 — the rating-improvement quantity Σ g(φ_j)(s_j − E).
  let deltaSum = 0;
  for (const o of results) {
    const muJ = (o.rating - 1500) / SCALE;
    const phiJ = o.rd / SCALE;
    const gPhiJ = g(phiJ);
    const e = expectation(mu, muJ, phiJ);
    vInv += gPhiJ * gPhiJ * e * (1 - e);
    deltaSum += gPhiJ * (o.score - e);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  // Step 5 — new volatility σ' via Illinois-variant regula falsi on f(x).
  const a = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * Math.pow(phi * phi + v + ex, 2);
    return num / den - (x - a) / (tau * tau);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k += 1;
    B = a - k * tau;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > CONVERGENCE) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  const sigmaPrime = Math.exp(A / 2);

  // Step 6 — pre-rating-period RD, then Step 7 — new φ' and μ'.
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * deltaSum;

  // Step 8 — back to the rating scale.
  return {
    rating: SCALE * muPrime + 1500,
    rd: SCALE * phiPrime,
    volatility: sigmaPrime,
  };
}

/**
 * Convenience for a 1v1 match: update both players against each other in one
 * call. `scoreA` is player A's result (1 win / 0.5 draw / 0 loss).
 */
export function rate1v1(
  a: Rating,
  b: Rating,
  scoreA: number,
): { a: Rating; b: Rating } {
  return {
    a: glicko2Update(a, [{ rating: b.rating, rd: b.rd, score: scoreA }]),
    b: glicko2Update(b, [{ rating: a.rating, rd: a.rd, score: 1 - scoreA }]),
  };
}
