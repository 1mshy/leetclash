# @leetclash/problems

Original problem bank + Polygon-style authoring toolchain (PLAN §2). Everything
here is hand-written — never copy problem text or test data from LeetCode or any
other judge.

## Directory layout

```
problems/<slug>/
  problem.json            # manifest — must conform to ProblemManifest
                          # (packages/shared/src/problems.ts)
  statement.md            # original statement: description, I/O format,
                          # constraints, 2 worked examples
  generator.py            # seeded input generator:
                          #   python3 generator.py <seed> <small|medium|large>
                          # prints a valid input; deterministic per (seed, tier)
  solutions/
    reference.py          # correct solution, stdin -> stdout
    reference.cpp         # correct solution, stdin -> stdout
    bad_wrong.py          # plausibly-wrong solution — MUST fail >= 1 test
  tests/
    00.in / 00.out        # 5-8 static cases; ordinals in problem.json
    01.in / 01.out        #   publicTests (usually [0, 1]) are the samples
    ...                   #   shown in the statement; the rest are hidden
```

`problem.json` limits: `limits.baseline` is the C++ budget; `limits.overrides.python`
must grant extra time (we use ~5x, e.g. 1000ms -> 5000ms, per PLAN §2).

## Adding a problem

1. Create `problems/<slug>/` with the layout above. The `slug` field in
   `problem.json` must equal the directory name (`[a-z0-9-]+`).
2. Write the statement first, then both reference solutions. Keep I/O simple and
   line-based.
3. Write `generator.py`. It must be deterministic for a given `(seed, tier)` —
   seed a local `random.Random`, never the global RNG or time. Each match
   instantiates fresh test data from it (anti-cheat, PLAN §2.3).
4. Author `tests/NN.in` files: `00`/`01` mirror the statement examples; add
   hidden edge cases (duplicates, empty answers, overflow, unreachable, ...)
   and one or two generator-produced inputs.
5. Never hand-compute expected outputs. Generate them:

   ```sh
   node scripts/gen-outputs.mjs <slug>
   ```

6. Write `solutions/bad_wrong.py` — a believable buggy attempt (off-by-one,
   set-instead-of-multiset, reset-instead-of-shrink, down/right-only DP...).
   Make sure your hidden tests actually catch it.
7. Validate:

   ```sh
   pnpm validate        # or: node scripts/validate.mjs
   ```

## What validation enforces (PLAN §2.2)

For every problem directory, `scripts/validate.mjs`:

1. Parses `problem.json` and checks it against the ProblemManifest shape
   (dependency-free local checker, no install needed).
2. Checks all required files exist and `publicTests` ordinals resolve to real
   test files.
3. Runs `reference.py` (python3) and `reference.cpp` (g++ -O2 -std=c++17)
   against every `tests/*.in` and diffs against `*.out` (trailing whitespace
   normalized). Both must pass everything.
4. Runs `bad_wrong.py` and asserts it fails (wrong answer or crash) on at
   least one test. A bad solution that passes everything means your tests are
   too weak — the build fails.
5. Runs `generator.py` twice per seed for seeds {1, 42} x tiers
   {small, medium, large}: output must be non-empty and byte-identical per
   seed (determinism).

Exit code is non-zero with a per-problem error report on any failure; CI runs
this via the `test` script.
