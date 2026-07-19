/**
 * Output comparison: standard competitive-judge tolerance — trailing
 * whitespace on each line and trailing blank lines are ignored; everything
 * else (including internal spacing) must match exactly.
 */
export function normalizeOutput(raw: string): string {
  const lines = raw.split("\n").map((l) => l.replace(/[ \t\r]+$/u, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

export function outputsMatch(actual: string, expected: string): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected);
}
