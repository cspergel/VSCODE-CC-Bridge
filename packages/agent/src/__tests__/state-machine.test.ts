import { describe, it, expect } from "vitest";
import { ClaudeStateMachine, ClaudeState } from "../state-machine";
import { Classification } from "@live-bridge/shared";

describe("ClaudeStateMachine", () => {
  function createMachine() {
    const emitted: Array<{ text: string; classification: string }> = [];
    const writes: string[] = [];
    const sm = new ClaudeStateMachine(
      (line) => emitted.push({ text: line.text, classification: line.classification }),
      (text) => writes.push(text),
    );
    return { sm, emitted, writes };
  }

  describe("INITIALIZING state", () => {
    it("starts in INITIALIZING and drops welcome screen lines", () => {
      const { sm, emitted } = createMachine();
      expect(sm.state).toBe(ClaudeState.INITIALIZING);
      sm.processLine("Claude Code v2.1.50");
      sm.processLine("Tips for getting started");
      sm.processLine("Welcome back Craig! Run /init to create a CLAUDE.md");
      sm.processLine("Recent activity");
      sm.processLine("No recent activity");
      sm.processLine("Opus 4.6 · Claude Max · user@email.com");
      sm.processLine("Organization");
      sm.processLine("~/Documents/Coding Projects/MyApp");
      expect(emitted).toHaveLength(0);
    });

    it("transitions to IDLE on bare prompt", () => {
      const { sm } = createMachine();
      sm.processLine(">");
      expect(sm.state).toBe(ClaudeState.IDLE);
    });
  });

  describe("IDLE state", () => {
    it("drops prompt lines and echoed commands", () => {
      const { sm, emitted } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("> [ctx: main | 2 files changed] fix the bug");
      sm.processLine("? for shortcuts");
      expect(emitted).toHaveLength(0);
    });

    it("transitions to THINKING on spinner chars", () => {
      const { sm } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…");
      expect(sm.state).toBe(ClaudeState.THINKING);
    });
  });

  describe("THINKING state", () => {
    it("drops spinner noise and emits one Thinking status", () => {
      const { sm, emitted } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("✢ * ✶ Symbioting… ✻");
      sm.processLine("(thinking)");
      sm.processLine("✢ Seasoning…");
      // Should emit exactly one status
      const statuses = emitted.filter(e => e.classification === Classification.Status);
      expect(statuses).toHaveLength(1);
      expect(statuses[0].text).toBe("Thinking...");
    });

    it("transitions to RESPONDING on clean text after thinking", () => {
      const { sm, emitted } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("Got it — here is my response.");
      expect(sm.state).toBe(ClaudeState.RESPONDING);
      const outputs = emitted.filter(e => e.classification === Classification.Output);
      expect(outputs).toHaveLength(1);
      expect(outputs[0].text).toBe("Got it — here is my response.");
    });
  });

  describe("RESPONDING state", () => {
    it("forwards all lines as OUTPUT", () => {
      const { sm, emitted } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("Here is line 1.");
      sm.processLine("Here is line 2.");
      sm.processLine("Here is line 3.");
      const outputs = emitted.filter(e => e.classification === Classification.Output);
      expect(outputs).toHaveLength(3);
    });

    it("transitions back to IDLE on prompt", () => {
      const { sm } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("My response."); // → RESPONDING
      sm.processLine(">"); // → IDLE
      expect(sm.state).toBe(ClaudeState.IDLE);
    });

    it("transitions to THINKING on spinner (multi-step)", () => {
      const { sm } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("Step 1 done."); // → RESPONDING
      sm.processLine("Seasoning…"); // → THINKING (next step)
      expect(sm.state).toBe(ClaudeState.THINKING);
    });

    it("classifies error lines as ERROR", () => {
      const { sm, emitted } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("Error: ENOENT: no such file"); // → RESPONDING
      const errors = emitted.filter(e => e.classification === Classification.Error);
      expect(errors).toHaveLength(1);
    });

    it("classifies conversational questions as OUTPUT (not DECISION)", () => {
      const { sm, emitted } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("Which approach would you prefer?");
      const outputs = emitted.filter(e => e.classification === Classification.Output);
      expect(outputs).toHaveLength(1);
      // Should NOT be Decision — it's a conversational question, not a tool permission
      const decisions = emitted.filter(e => e.classification === Classification.Decision);
      expect(decisions).toHaveLength(0);
    });
  });

  describe("TOOL_USE state", () => {
    it("detects tool permission and auto-approves safe tools", () => {
      const { sm, emitted, writes } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("Read src/app.ts"); // → TOOL_USE
      sm.processLine("Allow Read tool?");
      // Should auto-approve by writing to PTY
      expect(writes).toContain("y\r");
      // Should emit status
      const statuses = emitted.filter(e => e.classification === Classification.Status);
      expect(statuses.some(s => s.text.includes("Reading"))).toBe(true);
    });

    it("escalates risky tools as DECISION", () => {
      const { sm, emitted, writes } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("Bash npm install express");
      sm.processLine("Allow Bash tool?");
      // Should NOT auto-approve
      expect(writes.filter(w => w === "y\r")).toHaveLength(0);
      // Should emit decision
      const decisions = emitted.filter(e => e.classification === Classification.Decision);
      expect(decisions).toHaveLength(1);
      expect(decisions[0].text).toContain("Bash");
      expect(decisions[0].text).toContain("npm install express");
    });

    it("auto-approves Edit tool (safe by default)", () => {
      const { sm, writes } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("Edit src/app.ts");
      sm.processLine("Allow Edit tool?");
      expect(writes).toContain("y\r");
    });

    it("transitions to THINKING after auto-approve", () => {
      const { sm } = createMachine();
      sm.processLine(">"); // → IDLE
      sm.processLine("Forming…"); // → THINKING
      sm.processLine("Read src/app.ts");
      sm.processLine("Allow Read tool?"); // auto-approve → THINKING
      expect(sm.state).toBe(ClaudeState.THINKING);
    });
  });
});
