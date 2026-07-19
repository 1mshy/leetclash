import { describe, expect, it } from "vitest";
import { ExecBatchRequest } from "./judge-protocol.js";
import { driveBenchmark, driveSuite, type CaseOutcome, type SuiteCase } from "./suite-driver.js";

const LIMITS = { timeLimitMs: 1000, memoryLimitKb: 262144 };

function req(over: Partial<ExecBatchRequest>): ExecBatchRequest {
  return ExecBatchRequest.parse({
    execId: "t",
    language: "python",
    source: "",
    limits: LIMITS,
    tests: [{ ordinal: 0, input: "1", expected: "1" }],
    ...over,
  });
}

const seeded = {
  generatorSource: "gen",
  referenceSource: "ref",
  referenceLanguage: "python" as const,
  seed: 42,
  tiers: [
    { tier: 1, count: 2 },
    { tier: 2, count: 2 },
    { tier: 3, count: 1 },
  ],
};

/** Outcome factory: pass everything except the cases `fail` matches. */
function runner(
  fail: (c: SuiteCase) => false | CaseOutcome["verdict"],
): (c: SuiteCase) => Promise<CaseOutcome> {
  return async (c) => {
    const verdict = fail(c) || "accepted";
    return { verdict, timeMs: 10, memoryKb: 5000, detail: verdict === "accepted" ? null : "boom" };
  };
}

describe("driveSuite", () => {
  it("accepts when every planned case passes and sums passed tiers", async () => {
    const r = await driveSuite(req({ seeded, tiered: true }), runner(() => false));
    expect(r.verdict).toBe("accepted");
    expect(r.tierReached).toBe(3);
    expect(r.testsPassed).toBe(6);
    expect(r.testsTotal).toBe(6);
    // 1 static + 5 seeded cases, 10ms each, all tiers passed.
    expect(r.sumMs).toBe(60);
  });

  it("static failure decides the verdict and stops the suite", async () => {
    const r = await driveSuite(
      req({ seeded, tiered: true }),
      runner((c) => (c.kind === "static" ? "wrong_answer" : false)),
    );
    expect(r.verdict).toBe("wrong_answer");
    expect(r.tierReached).toBe(0);
    expect(r.tiers).toHaveLength(0);
  });

  it("tiered: failing tier 1 is a real rejection", async () => {
    const r = await driveSuite(
      req({ seeded, tiered: true }),
      runner((c) => (c.kind === "seeded" && c.planned.tier === 1 ? "time_limit_exceeded" : false)),
    );
    expect(r.verdict).toBe("time_limit_exceeded");
    expect(r.tierReached).toBe(0);
  });

  it("tiered: failing tier 3 keeps accepted with tierReached 2 and excludes the failed tier from sumMs", async () => {
    const r = await driveSuite(
      req({ seeded, tiered: true }),
      runner((c) => (c.kind === "seeded" && c.planned.tier === 3 ? "time_limit_exceeded" : false)),
    );
    expect(r.verdict).toBe("accepted");
    expect(r.tierReached).toBe(2);
    // 1 static + tiers 1..2 (4 cases); the failed tier-3 attempt is excluded.
    expect(r.sumMs).toBe(50);
    expect(r.tiers.map((t) => t.passed)).toEqual([true, true, false]);
  });

  it("non-tiered: any seeded failure decides the verdict", async () => {
    const r = await driveSuite(
      req({ seeded, tiered: false }),
      runner((c) => (c.kind === "seeded" && c.planned.tier === 2 ? "wrong_answer" : false)),
    );
    expect(r.verdict).toBe("wrong_answer");
    expect(r.tierReached).toBeNull();
  });
});

describe("driveBenchmark", () => {
  it("collects per-run samples", async () => {
    let run = 0;
    const r = await driveBenchmark(req({ benchmarkRuns: 3, tests: [] , seeded, tiered: false }), async () => {
      return { verdict: "accepted", timeMs: 10 + run++, memoryKb: 4000 + run, detail: null };
    });
    expect(r.verdict).toBe("accepted");
    expect(r.sampleSumMs).toHaveLength(3);
    expect(r.samplePeakKb).toHaveLength(3);
  });

  it("bails with the failing run when accepted stops reproducing", async () => {
    let run = 0;
    const r = await driveBenchmark(req({ benchmarkRuns: 3 }), async () => ({
      verdict: run++ === 0 ? "accepted" : "runtime_error",
      timeMs: 5,
      memoryKb: null,
      detail: null,
    }));
    expect(r.verdict).toBe("runtime_error");
    expect(r.sampleSumMs).toBeNull();
  });
});
