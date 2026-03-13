import { describe, it, expect } from "vitest";
import { formatForWhatsApp } from "../formatter.js";
import { Classification } from "@live-bridge/shared";

describe("formatForWhatsApp", () => {
  it("formats thinking status with emoji", () => {
    const result = formatForWhatsApp({
      classification: Classification.Status,
      text: "Thinking...",
      sessionName: "default",
      multiSession: false,
    });
    expect(result).toBe("🤔 Thinking...");
  });

  it("formats tool status with tool emoji", () => {
    const result = formatForWhatsApp({
      classification: Classification.Status,
      text: "Reading: src/app.ts",
      sessionName: "default",
      multiSession: false,
    });
    expect(result).toContain("📖");
    expect(result).toContain("src/app.ts");
  });

  it("formats editing status with pencil emoji", () => {
    const result = formatForWhatsApp({
      classification: Classification.Status,
      text: "Editing: src/index.ts",
      sessionName: "default",
      multiSession: false,
    });
    expect(result).toContain("✏️");
    expect(result).toContain("src/index.ts");
  });

  it("formats writing status with memo emoji", () => {
    const result = formatForWhatsApp({
      classification: Classification.Status,
      text: "Writing: docs/README.md",
      sessionName: "default",
      multiSession: false,
    });
    expect(result).toContain("📝");
  });

  it("formats searching status with magnifying glass emoji", () => {
    const result = formatForWhatsApp({
      classification: Classification.Status,
      text: "Searching files: **/*.ts",
      sessionName: "default",
      multiSession: false,
    });
    expect(result).toContain("🔍");
  });

  it("formats running status with lightning emoji", () => {
    const result = formatForWhatsApp({
      classification: Classification.Status,
      text: "Running: npm test",
      sessionName: "default",
      multiSession: false,
    });
    expect(result).toContain("⚡");
  });

  it("formats Using status with lightning emoji", () => {
    const result = formatForWhatsApp({
      classification: Classification.Status,
      text: "Using WebFetch: https://example.com",
      sessionName: "default",
      multiSession: false,
    });
    expect(result).toContain("⚡");
  });

  it("falls back to satellite emoji for unknown status", () => {
    const result = formatForWhatsApp({
      classification: Classification.Status,
      text: "Connecting to server...",
      sessionName: "default",
      multiSession: false,
    });
    expect(result).toContain("📡");
  });

  it("formats decision with content preserved", () => {
    const result = formatForWhatsApp({
      classification: Classification.Decision,
      text: "Allow Bash tool?\n\nnpm install express\n\n👍 = Allow  |  👎 = Deny\nOr reply: y / n",
      sessionName: "default",
      multiSession: false,
    });
    expect(result).toContain("⚠️");
    expect(result).toContain("Bash");
    expect(result).toContain("👍");
  });

  it("formats DECISION with warning and action hints", () => {
    const result = formatForWhatsApp({
      classification: Classification.Decision,
      text: "Apply all 3 fixes?\n2 files modified, ~45 lines changed",
      sessionName: "chartcopilot",
      multiSession: true,
      actions: ["Accept", "Reject", "Show diff"],
    });
    expect(result).toContain("⚠️");
    expect(result).toContain("1. Accept");
    expect(result).toContain("2. Reject");
  });

  it("formats output without prefix", () => {
    const result = formatForWhatsApp({
      classification: Classification.Output,
      text: "Here is the response.",
      sessionName: "default",
      multiSession: false,
    });
    expect(result).toBe("Here is the response.");
  });

  it("adds session tag in multi-session mode", () => {
    const result = formatForWhatsApp({
      classification: Classification.Output,
      text: "Response text",
      sessionName: "myproject",
      multiSession: true,
    });
    expect(result).toContain("[myproject]");
  });

  it("formats ERROR with error emoji", () => {
    const result = formatForWhatsApp({
      classification: Classification.Error,
      text: "TypeError: x is not a function",
      sessionName: "ccp",
      multiSession: false,
    });
    expect(result).toContain("❌");
    expect(result).not.toContain("[ccp]"); // single session, no tag
  });

  it("truncates long messages to maxLength", () => {
    const longText = "x".repeat(2000);
    const result = formatForWhatsApp({
      classification: Classification.Output,
      text: longText,
      sessionName: "ccp",
      multiSession: false,
      maxLength: 1500,
    });
    expect(result.length).toBeLessThanOrEqual(1500);
  });

  it("omits session tag in single-session mode", () => {
    const result = formatForWhatsApp({
      classification: Classification.Output,
      text: "All tests passing",
      sessionName: "ccp",
      multiSession: false,
    });
    expect(result).not.toContain("[ccp]");
  });
});
