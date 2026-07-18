import { describe, expect, it } from "vitest";
import { GLICKO, glicko2Update, rate1v1 } from "./glicko.js";

describe("glicko2Update", () => {
  // The canonical worked example from Glickman's Glicko-2 paper
  // (glicko.net/glicko/glicko2.pdf, "Example calculation"). A 1500/200/0.06
  // player, τ = 0.5, plays three games: win vs 1400/30, loss vs 1550/100,
  // loss vs 1700/300.
  //
  // The paper prints rating 1464.06 / RD 151.52 / σ 0.05999, but its 1464.06
  // comes from rounding g(φ) and E at intermediate steps. A full-precision
  // computation gives 1464.0507 / 151.5165 / 0.0599960 — verified against an
  // independent from-scratch reference implementation. RD and σ match the
  // paper's rounding exactly; only the rating's last digit differs. We assert
  // the true full-precision values so this stays a tight regression guard.
  it("reproduces Glickman's worked example (full precision)", () => {
    const result = glicko2Update(
      { rating: 1500, rd: 200, volatility: 0.06 },
      [
        { rating: 1400, rd: 30, score: 1 },
        { rating: 1550, rd: 100, score: 0 },
        { rating: 1700, rd: 300, score: 0 },
      ],
      0.5,
    );
    expect(result.rating).toBeCloseTo(1464.0507, 3);
    expect(result.rd).toBeCloseTo(151.5165, 3);
    expect(result.volatility).toBeCloseTo(0.0599960, 6);
  });

  it("only inflates RD when a player sits out a period", () => {
    const before = { rating: 1500, rd: 200, volatility: 0.06 };
    const after = glicko2Update(before, []);
    expect(after.rating).toBe(1500);
    expect(after.volatility).toBe(0.06);
    // φ' = √(φ² + σ²) in rating units.
    const phi = 200 / GLICKO.SCALE;
    const expected = Math.sqrt(phi * phi + 0.06 * 0.06) * GLICKO.SCALE;
    expect(after.rd).toBeCloseTo(expected, 6);
  });

  it("rate1v1 is zero-sum in direction: the winner gains, the loser loses", () => {
    const a = { rating: 1500, rd: 350, volatility: 0.06 };
    const b = { rating: 1500, rd: 350, volatility: 0.06 };
    const { a: aOut, b: bOut } = rate1v1(a, b, 1);
    expect(aOut.rating).toBeGreaterThan(1500);
    expect(bOut.rating).toBeLessThan(1500);
    // Equal-strength, equal-RD opponents move symmetrically.
    expect(aOut.rating - 1500).toBeCloseTo(1500 - bOut.rating, 6);
  });
});
