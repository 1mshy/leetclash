#!/usr/bin/env node
/**
 * Problem bank validator (dependency-free).
 *
 * Usage:
 *   node scripts/validate.mjs            # all problems
 *   node scripts/validate.mjs <slug>...  # only the given problems
 *
 * For every directory under problems/:
 *   1. Parse and sanity-check problem.json against the ProblemManifest shape.
 *   2. Check that statement.md, solutions, generator.py and tests exist.
 *   3. Run reference.py (python3) and reference.cpp (g++ -O2 -std=c++17)
 *      against every tests/NN.in and diff against tests/NN.out.
 *   4. Run bad_wrong.py and assert it FAILS at least one test.
 *   5. Run generator.py with 2 seeds x 3 tiers, assert deterministic per seed
 *      and non-empty output.
 *
 * Exits non-zero with a report on any failure.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, existsSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROBLEMS_DIR = path.join(ROOT, "problems");
const RUN_TIMEOUT_MS = 20_000;
const COMPILE_TIMEOUT_MS = 60_000;

const LANGUAGES = ["python", "cpp", "javascript", "java", "go", "rust", "typescript"];
const DIFFICULTIES = ["easy", "medium", "hard"];

const errors = [];
let checks = 0;

function fail(problem, msg) {
  errors.push(`[${problem}] ${msg}`);
}
function ok() {
  checks += 1;
}
function normalize(s) {
  return s
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

function run(cmd, args, { input = "", cwd, timeout = RUN_TIMEOUT_MS } = {}) {
  return execFileSync(cmd, args, {
    input,
    cwd,
    timeout,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

// ---------- 1. Manifest checks (minimal local JSON checker, no zod) ----------

function checkLimits(slug, obj, label, { partial = false } = {}) {
  if (typeof obj !== "object" || obj === null) return fail(slug, `${label} must be an object`);
  for (const key of ["timeLimitMs", "memoryLimitKb"]) {
    if (obj[key] === undefined) {
      if (!partial) fail(slug, `${label}.${key} is required`);
      continue;
    }
    if (!Number.isInteger(obj[key]) || obj[key] <= 0) {
      fail(slug, `${label}.${key} must be a positive integer`);
    }
  }
  for (const key of Object.keys(obj)) {
    if (!["timeLimitMs", "memoryLimitKb"].includes(key)) {
      fail(slug, `${label}.${key} is not a known field`);
    }
  }
}

function checkManifest(slug, dir) {
  const file = path.join(dir, "problem.json");
  let m;
  try {
    m = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return fail(slug, `problem.json unreadable/invalid JSON: ${e.message}`);
  }
  if (m.slug !== slug) fail(slug, `slug "${m.slug}" does not match directory name`);
  if (typeof m.slug !== "string" || !/^[a-z0-9-]+$/.test(m.slug)) fail(slug, "slug must match /^[a-z0-9-]+$/");
  if (typeof m.title !== "string" || m.title.length === 0) fail(slug, "title must be a non-empty string");
  if (!DIFFICULTIES.includes(m.difficulty)) fail(slug, `difficulty must be one of ${DIFFICULTIES.join("/")}`);
  if (!Array.isArray(m.tags) || !m.tags.every((t) => typeof t === "string")) fail(slug, "tags must be string[]");

  if (typeof m.limits !== "object" || m.limits === null) {
    fail(slug, "limits must be an object");
  } else {
    checkLimits(slug, m.limits.baseline, "limits.baseline");
    const overrides = m.limits.overrides ?? {};
    for (const [lang, lim] of Object.entries(overrides)) {
      if (!LANGUAGES.includes(lang)) fail(slug, `limits.overrides key "${lang}" is not a supported language`);
      checkLimits(slug, lim, `limits.overrides.${lang}`, { partial: true });
    }
    if (!overrides.python?.timeLimitMs) {
      fail(slug, "limits.overrides.python.timeLimitMs is required (python gets extra time per PLAN §2)");
    } else if (m.limits.baseline?.timeLimitMs && overrides.python.timeLimitMs < m.limits.baseline.timeLimitMs) {
      fail(slug, "python time limit must be >= the C++ baseline");
    }
  }

  const starter = m.starterCode ?? {};
  for (const lang of Object.keys(starter)) {
    if (!LANGUAGES.includes(lang)) fail(slug, `starterCode key "${lang}" is not a supported language`);
    if (typeof starter[lang] !== "string" || starter[lang].length === 0) fail(slug, `starterCode.${lang} must be a non-empty string`);
  }
  for (const lang of ["python", "cpp"]) {
    if (!starter[lang]) fail(slug, `starterCode.${lang} is required`);
  }

  if (!Array.isArray(m.publicTests) || !m.publicTests.every((x) => Number.isInteger(x) && x >= 0)) {
    fail(slug, "publicTests must be an array of non-negative integers");
  }
  ok();
  return m;
}

// ---------- 2. Required files ----------

const REQUIRED_FILES = [
  "problem.json",
  "statement.md",
  "generator.py",
  "solutions/reference.py",
  "solutions/reference.cpp",
  "solutions/bad_wrong.py",
];

function checkFiles(slug, dir) {
  for (const rel of REQUIRED_FILES) {
    if (!existsSync(path.join(dir, rel))) fail(slug, `missing required file: ${rel}`);
    else ok();
  }
  const stmt = path.join(dir, "statement.md");
  if (existsSync(stmt) && statSync(stmt).size < 200) fail(slug, "statement.md looks too short to be a real statement");
}

function listTests(slug, dir) {
  const testsDir = path.join(dir, "tests");
  if (!existsSync(testsDir)) {
    fail(slug, "missing tests/ directory");
    return [];
  }
  const ins = readdirSync(testsDir).filter((f) => f.endsWith(".in")).sort();
  const cases = [];
  for (const inFile of ins) {
    const base = inFile.slice(0, -3);
    const outFile = path.join(testsDir, `${base}.out`);
    if (!existsSync(outFile)) fail(slug, `tests/${base}.out missing for tests/${inFile}`);
    else cases.push({ name: base, in: path.join(testsDir, inFile), out: outFile });
  }
  if (cases.length < 5 || cases.length > 8) fail(slug, `expected 5-8 test cases, found ${cases.length}`);
  return cases;
}

function checkPublicTests(slug, manifest, cases) {
  if (!manifest || !Array.isArray(manifest.publicTests)) return;
  const ordinals = new Set(cases.map((c) => Number(c.name)));
  for (const p of manifest.publicTests) {
    if (!ordinals.has(p)) fail(slug, `publicTests references ordinal ${p} but tests/${String(p).padStart(2, "0")}.in|.out not found`);
  }
  ok();
}

// ---------- 3/4. Run solutions against tests ----------

function compileCpp(slug, dir, workDir) {
  const bin = path.join(workDir, `${slug}-ref`);
  try {
    run("g++", ["-O2", "-std=c++17", "-o", bin, path.join(dir, "solutions/reference.cpp")], {
      timeout: COMPILE_TIMEOUT_MS,
    });
    ok();
    return bin;
  } catch (e) {
    fail(slug, `reference.cpp failed to compile: ${e.stderr?.toString().slice(0, 800) ?? e.message}`);
    return null;
  }
}

function runSolution(cmd, args, inFile) {
  const input = readFileSync(inFile, "utf8");
  return normalize(run(cmd, args, { input }));
}

function checkSolutions(slug, dir, cases, workDir) {
  const refPy = path.join(dir, "solutions/reference.py");
  const badPy = path.join(dir, "solutions/bad_wrong.py");
  const cppBin = compileCpp(slug, dir, workDir);

  let badFailedSomewhere = false;
  for (const c of cases) {
    const expected = normalize(readFileSync(c.out, "utf8"));

    try {
      const got = runSolution("python3", [refPy], c.in);
      if (got !== expected) fail(slug, `reference.py wrong answer on tests/${c.name}: expected "${expected.slice(0, 80)}", got "${got.slice(0, 80)}"`);
      else ok();
    } catch (e) {
      fail(slug, `reference.py crashed/timed out on tests/${c.name}: ${e.message}`);
    }

    if (cppBin) {
      try {
        const got = runSolution(cppBin, [], c.in);
        if (got !== expected) fail(slug, `reference.cpp wrong answer on tests/${c.name}: expected "${expected.slice(0, 80)}", got "${got.slice(0, 80)}"`);
        else ok();
      } catch (e) {
        fail(slug, `reference.cpp crashed/timed out on tests/${c.name}: ${e.message}`);
      }
    }

    try {
      const got = runSolution("python3", [badPy], c.in);
      if (got !== expected) badFailedSomewhere = true;
    } catch {
      badFailedSomewhere = true; // crashing also counts as failing
    }
  }
  if (!badFailedSomewhere) fail(slug, "bad_wrong.py PASSED every test — it must fail at least one (PLAN §2.2)");
  else ok();
}

// ---------- 5. Generator determinism ----------

function checkGenerator(slug, dir) {
  const gen = path.join(dir, "generator.py");
  for (const tier of ["small", "medium", "large"]) {
    for (const seed of ["1", "42"]) {
      let a, b;
      try {
        a = run("python3", [gen, seed, tier], { cwd: dir });
        b = run("python3", [gen, seed, tier], { cwd: dir });
      } catch (e) {
        fail(slug, `generator.py crashed for seed=${seed} tier=${tier}: ${e.message}`);
        continue;
      }
      if (a.trim().length === 0) fail(slug, `generator.py produced empty output for seed=${seed} tier=${tier}`);
      else if (a !== b) fail(slug, `generator.py is non-deterministic for seed=${seed} tier=${tier}`);
      else ok();
    }
  }
}

// ---------- main ----------

const requested = process.argv.slice(2);
const slugs = (requested.length > 0
  ? requested
  : readdirSync(PROBLEMS_DIR).filter((d) => statSync(path.join(PROBLEMS_DIR, d)).isDirectory())
).sort();
if (slugs.length === 0) {
  console.error("No problem directories found under problems/");
  process.exit(1);
}
for (const slug of slugs) {
  if (!existsSync(path.join(PROBLEMS_DIR, slug))) {
    console.error(`No such problem directory: problems/${slug}`);
    process.exit(1);
  }
}

const workDir = mkdtempSync(path.join(tmpdir(), "leetclash-validate-"));
try {
  for (const slug of slugs) {
    const dir = path.join(PROBLEMS_DIR, slug);
    console.log(`== ${slug}`);
    const manifest = checkManifest(slug, dir);
    checkFiles(slug, dir);
    const cases = listTests(slug, dir);
    checkPublicTests(slug, manifest, cases);
    if (cases.length > 0) checkSolutions(slug, dir, cases, workDir);
    checkGenerator(slug, dir);
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

if (errors.length > 0) {
  console.error(`\nVALIDATION FAILED — ${errors.length} error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`\nVALIDATION PASSED — ${slugs.length} problem(s), ${checks} checks OK.`);
