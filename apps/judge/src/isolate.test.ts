import { describe, expect, it } from "vitest";
import { parseMeta } from "./isolate.js";

describe("parseMeta", () => {
  it("parses isolate key:value meta output", () => {
    const meta = parseMeta(
      [
        "time:0.084",
        "time-wall:0.102",
        "max-rss:12345",
        "cg-mem:23456",
        "cg-oom-killed:1",
        "exitcode:0",
        "status:TO",
        "message:Time limit exceeded",
        "",
      ].join("\n"),
    );
    expect(meta["time"]).toBe("0.084");
    expect(meta["cg-mem"]).toBe("23456");
    expect(meta["cg-oom-killed"]).toBe("1");
    expect(meta["status"]).toBe("TO");
    // message values may contain colons — only the first splits.
    expect(parseMeta("message:a:b:c")["message"]).toBe("a:b:c");
  });

  it("ignores malformed lines", () => {
    expect(parseMeta("garbage\n:leading\nok:1")).toEqual({ ok: "1" });
  });
});
