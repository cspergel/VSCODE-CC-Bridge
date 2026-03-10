import { describe, it, expect } from "vitest";
import { parseInbound, ParsedMessage, MessageIntent } from "../parser.js";

describe("WhatsApp Message Parser", () => {
  it("parses plain text as command to active session", () => {
    const msg = parseInbound("fix the token bug");
    expect(msg.intent).toBe(MessageIntent.Command);
    expect(msg.text).toBe("fix the token bug");
    expect(msg.targetSession).toBeNull();
  });

  it("parses /sessionname prefix as targeted command", () => {
    const msg = parseInbound("/ccp fix the HCC pipeline");
    expect(msg.intent).toBe(MessageIntent.TargetedCommand);
    expect(msg.targetSession).toBe("ccp");
    expect(msg.text).toBe("fix the HCC pipeline");
  });

  it("parses /switch as session switch", () => {
    const msg = parseInbound("/switch scheduler");
    expect(msg.intent).toBe(MessageIntent.Switch);
    expect(msg.targetSession).toBe("scheduler");
  });

  it("parses /sessions as list request", () => {
    const msg = parseInbound("/sessions");
    expect(msg.intent).toBe(MessageIntent.ListSessions);
  });

  it("parses /all as broadcast", () => {
    const msg = parseInbound("/all run tests");
    expect(msg.intent).toBe(MessageIntent.Broadcast);
    expect(msg.text).toBe("run tests");
  });

  it("parses number reply as decision response", () => {
    const msg = parseInbound("1");
    expect(msg.intent).toBe(MessageIntent.DecisionReply);
    expect(msg.actionIndex).toBe(0);
  });

  it("parses /abort as special command", () => {
    const msg = parseInbound("/abort");
    expect(msg.intent).toBe(MessageIntent.Special);
    expect(msg.specialCommand).toBe("abort");
  });

  it("parses /ctx as context request", () => {
    const msg = parseInbound("/ctx full");
    expect(msg.intent).toBe(MessageIntent.Special);
    expect(msg.specialCommand).toBe("ctx");
    expect(msg.text).toBe("full");
  });

  it("parses /detach and /attach", () => {
    expect(parseInbound("/detach").intent).toBe(MessageIntent.Special);
    expect(parseInbound("/attach ccp").intent).toBe(MessageIntent.Special);
  });
});
