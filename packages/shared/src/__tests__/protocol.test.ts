import { describe, it, expect } from "vitest";
import { createEnvelope, MessageType, Source } from "../index";

describe("protocol", () => {
  it("creates a valid envelope with auto-filled seq and ts", () => {
    const env = createEnvelope({
      type: MessageType.Command,
      source: Source.WhatsApp,
      sessionId: "test-session",
      payload: { text: "fix the bug" },
    });

    expect(env.type).toBe("command");
    expect(env.source).toBe("whatsapp");
    expect(env.sessionId).toBe("test-session");
    expect(env.seq).toBeGreaterThan(0);
    expect(env.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(env.payload.text).toBe("fix the bug");
  });

  it("increments seq across calls", () => {
    const a = createEnvelope({ type: MessageType.Command, source: Source.VSCode, sessionId: "s", payload: {} });
    const b = createEnvelope({ type: MessageType.Command, source: Source.VSCode, sessionId: "s", payload: {} });
    expect(b.seq).toBe(a.seq + 1);
  });
});
