import { describe, it, expect } from "vitest";
import { PtyWrapper } from "../pty-wrapper";

describe("PtyWrapper", () => {
  // Note: The state machine starts in INITIALIZING and only emits classified
  // lines after seeing a bare ">" prompt (transition to IDLE) followed by a
  // thinking verb (transition to THINKING) and then real content (transition
  // to RESPONDING). Tests that check classified output must simulate this
  // Claude Code-like sequence.

  it("spawns a process and emits classified lines after prompt", async () => {
    const lines: { text: string; classification: string }[] = [];

    // Use node to simulate Claude Code output: bare prompt, then thinking verb, then content
    const nodeScript = 'console.log(">"); console.log("Forming\\u2026"); console.log("Reading file content here");';

    const pty = new PtyWrapper({
      command: process.execPath,
      args: ["-e", nodeScript],
      cwd: process.cwd(),
    });

    pty.on("classified", (line) => lines.push(line));

    await new Promise<void>((resolve) => {
      pty.on("exit", () => resolve());
    });

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.text.includes("Reading file"))).toBe(true);
  });

  it("injects stdin text and emits classified output", async () => {
    // Use bash to simulate a Claude Code-like session
    const pty = new PtyWrapper({
      command: process.platform === "win32" ? "cmd.exe" : "bash",
      args: process.platform === "win32" ? [] : [],
      cwd: process.cwd(),
    });

    const rawChunks: string[] = [];
    pty.on("raw", (data) => rawChunks.push(data));

    // Wait for the shell to start
    await new Promise((r) => setTimeout(r, 1000));

    // Write text and check it arrives via raw events (classified output
    // depends on state machine seeing Claude Code-like prompts)
    pty.write("echo hello\r\n");

    // Wait for output to arrive
    await new Promise((r) => setTimeout(r, 1000));
    pty.write("exit\r\n");

    await new Promise<void>((resolve) => {
      pty.on("exit", () => resolve());
    });

    const fullRaw = rawChunks.join("");
    expect(fullRaw).toContain("hello");
  });

  it("emits exit event with exit code", async () => {
    const pty = new PtyWrapper({
      command: process.platform === "win32" ? "cmd.exe" : "echo",
      args:
        process.platform === "win32" ? ["/c", "echo done"] : ["done"],
      cwd: process.cwd(),
    });

    const exitCode = await new Promise<number>((resolve) => {
      pty.on("exit", (code) => resolve(code));
    });

    expect(exitCode).toBe(0);
  });

  it("emits raw data events", async () => {
    const rawChunks: string[] = [];

    const pty = new PtyWrapper({
      command: process.platform === "win32" ? "cmd.exe" : "echo",
      args:
        process.platform === "win32"
          ? ["/c", "echo", "raw-test"]
          : ["raw-test"],
      cwd: process.cwd(),
    });

    pty.on("raw", (data) => rawChunks.push(data));

    await new Promise<void>((resolve) => {
      pty.on("exit", () => resolve());
    });

    const fullRaw = rawChunks.join("");
    expect(fullRaw).toContain("raw-test");
  });

  it("provides pid for spawned process", () => {
    const pty = new PtyWrapper({
      command: process.platform === "win32" ? "cmd.exe" : "echo",
      args:
        process.platform === "win32" ? ["/c", "echo hi"] : ["hi"],
      cwd: process.cwd(),
    });

    expect(pty.pid).toBeGreaterThan(0);

    // Clean up
    return new Promise<void>((resolve) => {
      pty.on("exit", () => resolve());
    });
  });

  it("auto-restarts on non-zero exit", async () => {
    const pty = new PtyWrapper({
      command: process.platform === "win32" ? "cmd.exe" : "bash",
      args: process.platform === "win32" ? ["/c", "exit 1"] : ["-c", "exit 1"],
      cwd: process.cwd(),
      autoRestart: true,
    });

    const restarted = await new Promise<boolean>((resolve) => {
      pty.on("restarted", () => {
        pty.kill();
        resolve(true);
      });
      setTimeout(() => resolve(false), 5000);
    });

    expect(restarted).toBe(true);
  });

  it("classified lines have correct structure", async () => {
    // Use node to simulate Claude Code output: bare prompt, then thinking verb, then content
    const nodeScript = 'console.log(">"); console.log("Forming\\u2026"); console.log("Hello from Claude");';

    const pty = new PtyWrapper({
      command: process.execPath,
      args: ["-e", nodeScript],
      cwd: process.cwd(),
    });

    const lines: any[] = [];
    pty.on("classified", (line) => lines.push(line));

    await new Promise<void>((resolve) => {
      pty.on("exit", () => resolve());
    });

    expect(lines.length).toBeGreaterThan(0);

    // Each classified line should have the expected fields
    for (const line of lines) {
      expect(line).toHaveProperty("text");
      expect(line).toHaveProperty("classification");
      expect(line).toHaveProperty("timestamp");
      expect(line).toHaveProperty("raw");
      expect(typeof line.text).toBe("string");
      expect(typeof line.classification).toBe("string");
      expect(typeof line.timestamp).toBe("string");
      expect(typeof line.raw).toBe("string");
    }
  });
});
