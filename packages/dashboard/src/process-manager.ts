import { ChildProcess, fork } from "child_process";
import { EventEmitter } from "events";
import { existsSync } from "fs";
import { resolve } from "path";

export type ServiceName = "agent" | "bridge";
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
}

export class ProcessManager extends EventEmitter {
  private services: Record<ServiceName, ServiceState>;

  constructor() {
    super();

    const packagesDir = resolve(__dirname, "..", "..");

    this.services = {
      agent: {
        status: "stopped",
        process: null,
        entryPath: resolve(packagesDir, "agent", "dist", "index.js"),
        startedAt: null,
        error: null,
      },
      bridge: {
        status: "stopped",
        process: null,
        entryPath: resolve(packagesDir, "bridge", "dist", "index.js"),
        startedAt: null,
        error: null,
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
    };
  }

  start(name: ServiceName): boolean {
    const svc = this.services[name];
    if (svc.status === "running" || svc.status === "starting") return false;

    if (!existsSync(svc.entryPath)) {
      svc.status = "error";
      svc.error = `Entry point not found: ${svc.entryPath}. Run npm run build first.`;
      this.emitStatus(name);
      return false;
    }

    svc.status = "starting";
    svc.error = null;
    this.emitStatus(name);

    const child = fork(svc.entryPath, [], {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      silent: true,
    });

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
        this.emitLog(name, "stderr", line);
      }
    });

    // Mark running after a short delay (process didn't crash immediately)
    const startTimer = setTimeout(() => {
      if (svc.status === "starting") {
        svc.status = "running";
        this.emitStatus(name);
      }
    }, 1500);

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
      const names: ServiceName[] = ["bridge", "agent"];
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
