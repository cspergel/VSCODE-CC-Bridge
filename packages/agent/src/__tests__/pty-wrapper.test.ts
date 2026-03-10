import { describe, it, expect } from "vitest";
import { PtyWrapper } from "../pty-wrapper";

describe("PtyWrapper", () => {
  it("spawns a process and emits classified lines", async () => {
    const lines: { text: string; classification: string }[] = [];

    // Use 'echo' as a stand-in for claude-code to test the wrapper
    const pty = new PtyWrapper({
      command: process.platform === "win32" ? "cmd.exe" : "echo",
      args:
        process.platform === "win32"
          ? ["/c", "echo", "Reading file..."]
          : ["Reading file..."],
      cwd: process.cwd(),
    });

    pty.on("classified", (line) => lines.push(line));

    await new Promise<void>((resolve) => {
      pty.on("exit", () => resolve());
    });

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.text.includes("Reading file"))).toBe(true);
  });

  it("injects stdin text", async () => {
    const pty = new PtyWrapper({
      command: process.platform === "win32" ? "cmd.exe" : "cat",
      args: process.platform === "win32" ? [] : [],
      cwd: process.cwd(),
    });

    const lines: string[] = [];
    pty.on("classified", (l) => lines.push(l.text));

    // Wait for the shell prompt to appear before writing
    await new Promise((r) => setTimeout(r, 1000));

    pty.write("echo hello\r\n");

    // Wait for output to arrive
    await new Promise((r) => setTimeout(r, 1000));
    pty.write("exit\r\n");

    await new Promise<void>((resolve) => {
      pty.on("exit", () => resolve());
    });

    expect(lines.some((l) => l.includes("hello"))).toBe(true);
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
    const pty = new PtyWrapper({
      command: process.platform === "win32" ? "cmd.exe" : "echo",
      args:
        process.platform === "win32"
          ? ["/c", "echo", "Reading file..."]
          : ["Reading file..."],
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
