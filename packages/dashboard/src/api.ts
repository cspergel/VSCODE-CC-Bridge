import express, { Router, Request, Response } from "express";
import { readdirSync, statSync, existsSync, rmSync } from "fs";
import { resolve, sep, join } from "path";
import { homedir } from "os";
import { execSync, spawn } from "child_process";
import { Database } from "@live-bridge/agent/db";
import { ProcessManager, ServiceName } from "./process-manager";

const VALID_SERVICES: ServiceName[] = ["agent", "bridge"];
const VALID_ACTIONS = ["start", "stop", "restart"] as const;

export function createApiRouter(pm: ProcessManager, db: Database): Router {
  const router = Router();

  // Service statuses
  router.get("/services", (_req: Request, res: Response) => {
    res.json(pm.getAllStatuses());
  });

  // Process control
  router.post("/services/:name/:action", (req: Request, res: Response) => {
    const name = req.params.name as ServiceName;
    const action = req.params.action as (typeof VALID_ACTIONS)[number];

    if (!VALID_SERVICES.includes(name)) {
      res.status(400).json({ error: `Invalid service: ${name}` });
      return;
    }
    if (!(VALID_ACTIONS as readonly string[]).includes(action)) {
      res.status(400).json({ error: `Invalid action: ${action}` });
      return;
    }

    const ok = pm[action](name);
    res.json({ ok, status: pm.getStatus(name) });
  });

  // Sessions
  router.get("/sessions", (_req: Request, res: Response) => {
    try {
      const sessions = db.listSessions();
      res.json(sessions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Messages for a session
  router.get("/sessions/:id/messages", (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const messages = db.getMessages(req.params.id, limit);
      res.json(messages);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Audit log
  router.get("/audit", (_req: Request, res: Response) => {
    try {
      const limit = parseInt(_req.query.limit as string) || 100;
      const logs = db.getAuditLogs(limit);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Session management via agent IPC
  router.get("/sessions/live", async (_req: Request, res: Response) => {
    try {
      const resp = await pm.requestFromAgent({ type: "list_sessions" }, ["sessions_list"]);
      res.json(resp.sessions);
    } catch (err: any) {
      res.status(503).json({ error: err.message });
    }
  });

  router.post("/sessions", express.json(), async (req: Request, res: Response) => {
    const { name, projectPath } = req.body;
    if (!name || !projectPath) {
      res.status(400).json({ error: "name and projectPath are required" });
      return;
    }
    try {
      const resp = await pm.requestFromAgent(
        { type: "create_session", name, projectPath },
        ["session_created", "session_error"]
      );
      if (resp.type === "session_error") {
        res.status(409).json({ error: resp.error });
        return;
      }
      res.json(resp.session);
    } catch (err: any) {
      res.status(503).json({ error: err.message });
    }
  });

  router.delete("/sessions/:nameOrId", async (req: Request, res: Response) => {
    try {
      const resp = await pm.requestFromAgent(
        { type: "delete_session", nameOrId: req.params.nameOrId },
        ["session_deleted", "session_error"]
      );
      if (resp.type === "session_error") {
        res.status(404).json({ error: resp.error });
        return;
      }
      res.json({ ok: true, sessionId: resp.sessionId });
    } catch (err: any) {
      res.status(503).json({ error: err.message });
    }
  });

  router.post("/sessions/:nameOrId/activate", async (req: Request, res: Response) => {
    try {
      const resp = await pm.requestFromAgent(
        { type: "activate_session", nameOrId: req.params.nameOrId },
        ["session_activated", "session_error"]
      );
      if (resp.type === "session_error") {
        res.status(404).json({ error: resp.error });
        return;
      }
      res.json(resp.session);
    } catch (err: any) {
      res.status(503).json({ error: err.message });
    }
  });

  // Folder browser
  router.get("/browse", (req: Request, res: Response) => {
    try {
      const raw = (req.query.path as string) || homedir();
      const current = resolve(raw);

      if (!existsSync(current)) {
        res.status(404).json({ error: "Path not found" });
        return;
      }

      // Check if current dir is a git repo
      const currentIsGitRepo = existsSync(resolve(current, ".git"));

      // Build breadcrumb segments
      const parts = current.split(sep).filter(Boolean);
      const segments: { name: string; path: string }[] = [];
      // On Windows the first part is like "C:", so reconstruct with sep
      let accumulated = parts[0] + sep;
      segments.push({ name: parts[0], path: accumulated });
      for (let i = 1; i < parts.length; i++) {
        accumulated = resolve(accumulated, parts[i]);
        segments.push({ name: parts[i], path: accumulated });
      }

      // Read directory entries (folders only)
      const entries: { name: string; path: string; isGitRepo: boolean }[] = [];
      let dirEntries: string[];
      try {
        dirEntries = readdirSync(current);
      } catch {
        res.status(403).json({ error: "Cannot read directory" });
        return;
      }

      for (const name of dirEntries) {
        // Skip hidden dirs and node_modules
        if (name.startsWith(".") || name === "node_modules") continue;
        try {
          const full = resolve(current, name);
          const stat = statSync(full);
          if (!stat.isDirectory()) continue;
          const isGitRepo = existsSync(resolve(full, ".git"));
          entries.push({ name, path: full, isGitRepo });
        } catch {
          // Skip unreadable entries (permission errors)
        }
      }

      // Sort: git repos first, then alphabetical
      entries.sort((a, b) => {
        if (a.isGitRepo !== b.isGitRepo) return a.isGitRepo ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      res.json({ current, currentIsGitRepo, segments, entries });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Re-link WhatsApp: delete auth session, restart bridge to get new QR
  router.post("/relink", (_req: Request, res: Response) => {
    try {
      const sessionDir = join(homedir(), ".claude-bridge", "wa-session");
      if (existsSync(sessionDir)) {
        rmSync(sessionDir, { recursive: true, force: true });
      }
      // Restart the bridge so it generates a new QR code
      const ok = pm.restart("bridge");
      res.json({ ok, message: "Auth cleared. Watch the logs for a new QR code." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Restart dashboard (rebuild + respawn self)
  router.post("/restart", (_req: Request, res: Response) => {
    try {
      const rootDir = resolve(__dirname, "..", "..", "..");
      // Rebuild all packages
      execSync("npm run build --workspaces --if-present", { cwd: rootDir, timeout: 60000 });
      res.json({ ok: true, message: "Rebuilt. Restarting..." });
      // Spawn a new dashboard process detached, then exit
      setTimeout(() => {
        const child = spawn("npx", ["tsx", resolve(__dirname, "..", "src", "index.ts")], {
          cwd: rootDir,
          detached: true,
          stdio: "ignore",
          shell: true,
        });
        child.unref();
        setTimeout(() => process.exit(0), 500);
      }, 300);
    } catch (err: any) {
      res.status(500).json({ error: `Build failed: ${err.message}` });
    }
  });

  // Health check
  router.get("/health", (_req: Request, res: Response) => {
    const statuses = pm.getAllStatuses();
    const healthy = statuses.agent.status === "running" && statuses.bridge.status === "running";
    res.status(healthy ? 200 : 503).json({
      healthy,
      services: statuses,
      uptime: process.uptime(),
    });
  });

  return router;
}
