#!/usr/bin/env node
/**
 * Regenerate tests/NN.out from tests/NN.in using solutions/reference.py.
 *
 * Usage:
 *   node scripts/gen-outputs.mjs            # all problems
 *   node scripts/gen-outputs.mjs <slug>...  # only the given problems
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROBLEMS_DIR = path.join(ROOT, "problems");

const requested = process.argv.slice(2);
const slugs = (requested.length > 0
  ? requested
  : readdirSync(PROBLEMS_DIR).filter((d) => statSync(path.join(PROBLEMS_DIR, d)).isDirectory())
).sort();

let failures = 0;
for (const slug of slugs) {
  const dir = path.join(PROBLEMS_DIR, slug);
  const ref = path.join(dir, "solutions/reference.py");
  const testsDir = path.join(dir, "tests");
  if (!existsSync(ref) || !existsSync(testsDir)) {
    console.error(`[${slug}] skipping: missing solutions/reference.py or tests/`);
    failures += 1;
    continue;
  }
  for (const inFile of readdirSync(testsDir).filter((f) => f.endsWith(".in")).sort()) {
    const inPath = path.join(testsDir, inFile);
    const outPath = inPath.slice(0, -3) + ".out";
    try {
      const out = execFileSync("python3", [ref], {
        input: readFileSync(inPath, "utf8"),
        encoding: "utf8",
        timeout: 60_000,
        maxBuffer: 128 * 1024 * 1024,
      });
      writeFileSync(outPath, out.endsWith("\n") ? out : out + "\n");
      console.log(`[${slug}] wrote tests/${path.basename(outPath)}`);
    } catch (e) {
      console.error(`[${slug}] reference.py FAILED on tests/${inFile}: ${e.message}`);
      failures += 1;
    }
  }
}
process.exit(failures > 0 ? 1 : 0);
