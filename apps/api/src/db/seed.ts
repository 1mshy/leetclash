/**
 * Seed the database from the problem bank (packages/problems/problems).
 *
 * Usage: pnpm db:seed   (Postgres must be up and migrated)
 *
 * Idempotent: problems are upserted by slug and published; test cases are
 * replaced wholesale so re-running after editing a problem always converges.
 * Test data is stored inline (input_inline/expected_inline) per the MVP path
 * in the worker; MinIO-backed URIs land in Phase 2.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { ProblemManifest } from "@leetclash/shared";
import { closeDb, db } from "./client.js";
import { problems, testCases } from "./schema.js";

const PROBLEMS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/problems/problems",
);

interface SeedTestCase {
  ordinal: number;
  input: string;
  expected: string;
}

function loadTestCases(dir: string): SeedTestCase[] {
  const testsDir = path.join(dir, "tests");
  const cases: SeedTestCase[] = [];
  for (const inFile of readdirSync(testsDir)
    .filter((f) => f.endsWith(".in"))
    .sort()) {
    const base = inFile.slice(0, -3);
    const outPath = path.join(testsDir, `${base}.out`);
    if (!existsSync(outPath)) {
      throw new Error(`tests/${base}.out missing for tests/${inFile}`);
    }
    cases.push({
      ordinal: Number(base),
      input: readFileSync(path.join(testsDir, inFile), "utf8"),
      expected: readFileSync(outPath, "utf8"),
    });
  }
  return cases;
}

/** solutions/reference.<ext> → Record<Language, source> for seeded judging. */
const REFERENCE_EXTENSIONS: Record<string, string> = {
  py: "python",
  cpp: "cpp",
  js: "javascript",
  java: "java",
  go: "go",
  rs: "rust",
};

function loadReferenceSolutions(dir: string): Record<string, string> {
  const solutionsDir = path.join(dir, "solutions");
  const refs: Record<string, string> = {};
  if (!existsSync(solutionsDir)) return refs;
  for (const file of readdirSync(solutionsDir)) {
    const match = /^reference\.([a-z]+)$/.exec(file);
    const language = match?.[1] ? REFERENCE_EXTENSIONS[match[1]] : undefined;
    if (!language) continue;
    refs[language] = readFileSync(path.join(solutionsDir, file), "utf8");
  }
  return refs;
}

const slugs = readdirSync(PROBLEMS_DIR)
  .filter((d) => statSync(path.join(PROBLEMS_DIR, d)).isDirectory())
  .sort();

if (slugs.length === 0) {
  console.error(`No problem directories found under ${PROBLEMS_DIR}`);
  process.exit(1);
}

let totalCases = 0;
for (const slug of slugs) {
  const dir = path.join(PROBLEMS_DIR, slug);
  const manifest = ProblemManifest.parse(
    JSON.parse(readFileSync(path.join(dir, "problem.json"), "utf8")),
  );
  const statementMd = readFileSync(path.join(dir, "statement.md"), "utf8");
  const cases = loadTestCases(dir);

  // Seeded per-match generation (Phase 3 §2.3) needs the generator plus a
  // reference solution to produce expected outputs; both stored inline like
  // test data. Problems without either fall back to the static hidden suite.
  const generatorPath = path.join(dir, "generator.py");
  const generatorSource = existsSync(generatorPath)
    ? readFileSync(generatorPath, "utf8")
    : null;
  const referenceSolutions = loadReferenceSolutions(dir);

  const values = {
    title: manifest.title,
    difficulty: manifest.difficulty,
    statementMd,
    tags: manifest.tags,
    starterCode: manifest.starterCode,
    limits: manifest.limits,
    generatorSource,
    referenceSolutions,
    status: "published" as const,
  };

  await db.transaction(async (tx) => {
    const [problem] = await tx
      .insert(problems)
      .values({ slug: manifest.slug, ...values })
      .onConflictDoUpdate({ target: problems.slug, set: values })
      .returning({ id: problems.id });
    if (!problem) throw new Error(`upsert returned no row for ${slug}`);

    await tx.delete(testCases).where(eq(testCases.problemId, problem.id));
    await tx.insert(testCases).values(
      cases.map((c) => ({
        problemId: problem.id,
        ordinal: c.ordinal,
        inputInline: c.input,
        expectedInline: c.expected,
        isPublic: manifest.publicTests.includes(c.ordinal),
      })),
    );
  });

  totalCases += cases.length;
  console.log(
    `[seed] ${slug}: ${cases.length} test cases (${manifest.publicTests.length} public)`,
  );
}

console.log(`[seed] done — ${slugs.length} problem(s), ${totalCases} test case(s).`);
await closeDb();
