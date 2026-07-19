import type { Language } from "@leetclash/shared";

/**
 * Per-language execution specs (PLAN §4.3): source file name, optional
 * compile step, and the run argv. Paths are inside the isolate box (cwd =
 * /box). The judge image pins one toolchain per language; per-language
 * time/memory multipliers live with each problem, not here.
 */

export interface CompileSpec {
  argv: string[];
  /** Compile step is sandboxed with its own looser limits (§4.2). */
  timeLimitMs: number;
  memoryLimitKb: number;
  /** Extra processes the toolchain needs (linkers, cc1plus, …). */
  processes: number;
}

export interface LanguageSpec {
  sourceFile: string;
  compile: CompileSpec | null;
  runArgv: string[];
  /** pids limit for the run step — kills fork bombs (§4.2). */
  processes: number;
  /** Environment for both steps (isolate clears the env by default). */
  env: string[];
}

const PATH = "PATH=/usr/local/bin:/usr/bin:/bin";
const COMPILE_TIME_MS = 30_000;
const COMPILE_MEMORY_KB = 1_048_576; // 1 GB — linkers and the Go/Rust toolchains are hungry

export const LANGUAGE_SPECS: Record<Language, LanguageSpec> = {
  python: {
    sourceFile: "main.py",
    compile: null,
    runArgv: ["/usr/bin/python3", "main.py"],
    processes: 8,
    env: [PATH, "HOME=/box", "PYTHONDONTWRITEBYTECODE=1"],
  },
  cpp: {
    sourceFile: "main.cpp",
    compile: {
      argv: ["/usr/bin/g++", "-O2", "-std=c++17", "-o", "main", "main.cpp"],
      timeLimitMs: COMPILE_TIME_MS,
      memoryLimitKb: COMPILE_MEMORY_KB,
      processes: 16,
    },
    runArgv: ["./main"],
    processes: 4,
    env: [PATH, "HOME=/box"],
  },
  javascript: {
    sourceFile: "main.js",
    compile: null,
    runArgv: ["/usr/bin/node", "--max-old-space-size=512", "main.js"],
    processes: 16,
    env: [PATH, "HOME=/box"],
  },
  java: {
    sourceFile: "Main.java",
    compile: {
      argv: ["/usr/bin/javac", "Main.java"],
      timeLimitMs: COMPILE_TIME_MS,
      memoryLimitKb: COMPILE_MEMORY_KB,
      processes: 64,
    },
    runArgv: ["/usr/bin/java", "-XX:+UseSerialGC", "-Xss64m", "Main"],
    processes: 64,
    env: [PATH, "HOME=/box"],
  },
  go: {
    sourceFile: "main.go",
    compile: {
      argv: ["/usr/bin/go", "build", "-o", "main", "main.go"],
      timeLimitMs: COMPILE_TIME_MS * 2, // first go build warms the build cache
      memoryLimitKb: COMPILE_MEMORY_KB,
      processes: 64,
    },
    runArgv: ["./main"],
    processes: 16,
    env: [PATH, "HOME=/box", "GOCACHE=/box/.gocache", "GOPATH=/box/.go", "GOFLAGS=-mod=mod"],
  },
  rust: {
    sourceFile: "main.rs",
    compile: {
      argv: ["/usr/bin/rustc", "-O", "--edition", "2021", "-o", "main", "main.rs"],
      timeLimitMs: COMPILE_TIME_MS * 2,
      memoryLimitKb: COMPILE_MEMORY_KB,
      processes: 16,
    },
    runArgv: ["./main"],
    processes: 4,
    env: [PATH, "HOME=/box"],
  },
};
