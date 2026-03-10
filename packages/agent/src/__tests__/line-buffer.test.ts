import { describe, it, expect } from "vitest";
import { LineBuffer } from "../line-buffer";

describe("LineBuffer", () => {
  it("assembles complete lines from partial chunks", () => {
    const lines: string[] = [];
    const buf = new LineBuffer((line) => lines.push(line));

    buf.push("Reading src/");
    expect(lines).toHaveLength(0);

    buf.push("auth.ts...\n");
    expect(lines).toEqual(["Reading src/auth.ts..."]);
  });

  it("handles multiple lines in one chunk", () => {
    const lines: string[] = [];
    const buf = new LineBuffer((line) => lines.push(line));
    buf.push("line1\nline2\nline3\n");
    expect(lines).toEqual(["line1", "line2", "line3"]);
  });

  it("strips ANSI escape codes", () => {
    const lines: string[] = [];
    const buf = new LineBuffer((line) => lines.push(line));
    buf.push("\x1b[32mReading file...\x1b[0m\n");
    expect(lines).toEqual(["Reading file..."]);
  });

  it("flushes partial line on flush()", () => {
    const lines: string[] = [];
    const buf = new LineBuffer((line) => lines.push(line));
    buf.push("partial content");
    expect(lines).toHaveLength(0);
    buf.flush();
    expect(lines).toEqual(["partial content"]);
  });
});
