import { describe, it, expect } from "vitest";
import { formatForWhatsApp, FormatInput } from "../formatter";
import { Classification } from "@live-bridge/shared";

describe("WhatsApp Formatter", () => {
  it("formats STATUS as batched digest with emoji", () => {
    const result = formatForWhatsApp({
      classification: Classification.Status,
      text: "Reading src/api/auth.ts...",
      sessionName: "chartcopilot",
      multiSession: true,
    });
    expect(result).toContain("[chartcopilot]");
    expect(result).toMatch(/📡/);
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
