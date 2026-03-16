import { ChildProcess, fork, spawn } from "child_process";
import { EventEmitter } from "events";
import { existsSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";

export type ServiceName = "agent" | "bridge" | "tunnel";
export type ServiceStatus = "stopped" | "starting" | "running" | "error";

export interface LogLine {
  service: ServiceName;
  stream: "stdout" | "stderr";
  text: string;
  ts: string;
}

interface ServiceState {
  status: ServiceStatus;
  process: ChildProcess | null;
  entryPath: string;
  startedAt: string | null;
  error: string | null;
  spawnMode?: "fork" | "spawn"; // fork for Node modules, spawn for external binaries
  spawnCmd?: string; // command for spawn mode
  spawnArgs?: string[]; // args for spawn mode
}

export class ProcessManager extends EventEmitter {
  private services: Record<ServiceName, ServiceState>;

  constructor() {
    super();

    const packagesDir = resolve(__dirname, "..", "..");

    // Find cloudflared binary
    let cloudflaredPath = "cloudflared";
    try {
      const which = execSync("where cloudflared 2>NUL || which cloudflared 2>/dev/null", { encoding: "utf8" }).trim().split("\n")[0];
      if (which) cloudflaredPath = which.trim();
    } catch { /* use default */ }

    this.services = {
      agent: {
        status: "stopped",
        process: null,
        entryPath: resolve(packagesDir, "agent", "dist", "index.js"),
        startedAt: null,
        error: null,
        spawnMode: "fork",
      },
      bridge: {
        status: "stopped",
        process: null,
        entryPath: resolve(packagesDir, "bridge", "dist", "index.js"),
        startedAt: null,
        error: null,
        spawnMode: "fork",
      },
      tunnel: {
        status: "stopped",
        process: null,
        entryPath: cloudflaredPath,
        startedAt: null,
        error: null,
        spawnMode: "spawn",
        spawnCmd: cloudflaredPath,
        spawnArgs: ["tunnel", "run", "claude-bridge"],
      },
    };
  }

  getStatus(name: ServiceName) {
    const s = this.services[name];
    return {
      name,
      status: s.status,
      pid: s.process?.pid ?? null,
      startedAt: s.startedAt,
      error: s.error,
    };
  }

  getAllStatuses() {
    return {
      agent: this.getStatus("agent"),
      bridge: this.getStatus("bridge"),
      tunnel: this.getStatus("tunnel"),
    };
  }

  start(name: ServiceName): boolean {
    const svc = this.services[name];
    if (svc.status === "running" || svc.status === "starting") return false;

    // For spawn mode (tunnel), check command exists; for fork mode, check entry file
    if (svc.spawnMode === "spawn") {
      // Try to stop the Windows service first so we don't conflict
      try { execSync("sc stop Cloudflared 2>NUL", { encoding: "utf8" }); } catch { /* may not be admin */ }
    } else if (!existsSync(svc.entryPath)) {
      svc.status = "error";
      svc.error = `Entry point not found: ${svc.entryPath}. Run npm run build first.`;
      this.emitStatus(name);
      return false;
    }

    svc.status = "starting";
    svc.error = null;
    this.emitStatus(name);

    let child: ChildProcess;

    // Strip VS Code env vars to prevent child processes from launching VS Code
    const cleanEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v === undefined) continue;
      if (k === "CLAUDECODE") continue;
      if (k === "EDITOR" || k === "VISUAL") continue;
      if (k === "TERM_PROGRAM" && v.toLowerCase().includes("vscode")) continue;
      if (k.startsWith("VSCODE_")) continue;
    cleanEnv[k] = v;
    }

    if (svc.spawnMode === "spawn" && svc.spawnCmd) {
      // External binary (e.g. cloudflared)
      child = spawn(svc.spawnCmd, svc.spawnArgs || [], {
        stdio: ["ignore", "pipe", "pipe"],
        env: cleanEnv,
      });
    } else {
      // Node module (fork with IPC)
      child = fork(svc.entryPath, [], {
        stdio: ["ignore", "pipe", "pipe", "ipc"],
        silent: true,
        env: cleanEnv,
      });
    }

    svc.process = child;
    svc.startedAt = new Date().toISOString();

    // IPC: relay messages from agent to dashboard
    if (name === "agent") {
      child.on("message", (msg: any) => {
        if (msg.type === "pty_data") {
          this.emit("pty_data", { sessionId: msg.sessionId, data: msg.data });
        } else {
          // Session management responses (sessions_list, session_created, etc.)
          this.emit("agent_ipc", msg);
        }
      });
    }

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString().trimEnd();
      if (!text) return;
      for (const line of text.split("\n")) {
        this.emitLog(name, "stdout", line);
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trimEnd();
      if (!text) return;
      for (const line of text.split("\n")) {
        // For tunnel, cloudflared logs INF lines to stderr — treat as stdout
        const stream = name === "tunnel" && line.includes(" INF ") ? "stdout" : "stderr";
        this.emitLog(name, stream, line);
      }
    });

    // Mark running after a short delay (process didn't crash immediately)
    const startTimer = setTimeout(() => {
      if (svc.status === "starting") {
        svc.status = "running";
        this.emitStatus(name);
      }
    }, name === "tunnel" ? 3000 : 1500); // tunnel takes longer to establish connections

    child.on("exit", (code, signal) => {
      clearTimeout(startTimer);
      svc.process = null;
      svc.status = "stopped";
      if (code !== 0 && code !== null) {
        svc.status = "error";
        svc.error = `Exited with code ${code}`;
      }
      this.emitLog(name, "stderr", `[dashboard] ${name} process exited (code=${code}, signal=${signal})`);
      this.emitStatus(name);
    });

    child.on("error", (err) => {
      clearTimeout(startTimer);
      svc.status = "error";
      svc.error = err.message;
      svc.process = null;
      this.emitLog(name, "stderr", `[dashboard] ${name} process error: ${err.message}`);
      this.emitStatus(name);
    });

    return true;
  }

  stop(name: ServiceName): boolean {
    const svc = this.services[name];
    if (!svc.process) return false;

    this.emitLog(name, "stdout", `[dashboard] Stopping ${name}...`);
    svc.process.kill("SIGTERM");

    // Force kill after 5s
    const timer = setTimeout(() => {
      if (svc.process) {
        svc.process.kill("SIGKILL");
      }
    }, 5000);

    svc.process.once("exit", () => clearTimeout(timer));
    return true;
  }

  restart(name: ServiceName): boolean {
    const svc = this.services[name];
    if (svc.process) {
      this.emitLog(name, "stdout", `[dashboard] Restarting ${name}...`);
      svc.process.kill("SIGTERM");
      svc.process.once("exit", () => {
        setTimeout(() => this.start(name), 500);
      });
      return true;
    }
    return this.start(name);
  }

  shutdownAll(): Promise<void> {
    return new Promise((resolve) => {
      const names: ServiceName[] = ["bridge", "agent", "tunnel"];
      let remaining = 0;

      for (const name of names) {
        const svc = this.services[name];
        if (svc.process) {
          remaining++;
          svc.process.once("exit", () => {
            remaining--;
            if (remaining === 0) resolve();
          });
          svc.process.kill("SIGTERM");
        }
      }

      if (remaining === 0) resolve();

      // Force kill after 5s
      setTimeout(() => {
        for (const name of names) {
          const svc = this.services[name];
          if (svc.process) svc.process.kill("SIGKILL");
        }
        resolve();
      }, 5000);
    });
  }

  sendToAgent(msg: unknown): boolean {
    const svc = this.services.agent;
    if (svc.process?.connected) {
      svc.process.send(msg as any);
      return true;
    }
    return false;
  }

  sendToBridge(msg: unknown): boolean {
    const svc = this.services.bridge;
    if (svc.process?.connected) {
      svc.process.send(msg as any);
      return true;
    }
    return false;
  }

  /** Send IPC to agent and wait for a response matching one of the expected types */
  requestFromAgent(msg: unknown, expectedTypes: string[], timeoutMs = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.sendToAgent(msg)) {
        reject(new Error("Agent not running"));
        return;
      }
      const timer = setTimeout(() => {
        this.removeListener("agent_ipc", handler);
        reject(new Error("Agent IPC timeout"));
      }, timeoutMs);
      const handler = (resp: any) => {
        if (expectedTypes.includes(resp.type)) {
          clearTimeout(timer);
          this.removeListener("agent_ipc", handler);
          resolve(resp);
        }
      };
      this.on("agent_ipc", handler);
    });
  }

  private emitLog(service: ServiceName, stream: "stdout" | "stderr", text: string) {
    const line: LogLine = { service, stream, text, ts: new Date().toISOString() };
    this.emit("log", line);
  }

  private emitStatus(name: ServiceName) {
    this.emit("status", this.getStatus(name));
  }
}
