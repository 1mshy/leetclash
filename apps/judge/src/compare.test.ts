import { describe, expect, it } from "vitest";
import { normalizeOutput, outputsMatch } from "./compare.js";

describe("outputsMatch", () => {
  it("ignores trailing whitespace and trailing newlines", () => {
    expect(outputsMatch("42 \n", "42")).toBe(true);
    expect(outputsMatch("1\n2\n\n\n", "1\n2\n")).toBe(true);
    expect(outputsMatch("a\r\nb\r\n", "a\nb")).toBe(true);
  });

  it("rejects real differences", () => {
    expect(outputsMatch("42", "43")).toBe(false);
    expect(outputsMatch("1\n2", "1\n\n2")).toBe(false);
    expect(outputsMatch("a b", "a  b")).toBe(false); // internal spacing counts
  });

  it("normalizes to a stable form", () => {
    expect(normalizeOutput("x\t\ny  \n\n")).toBe("x\ny");
  });
});
