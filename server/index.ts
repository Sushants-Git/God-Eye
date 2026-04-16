import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";

import express from "express";
import { WebSocketServer } from "ws";
import { z } from "zod";

import { ingestSessionEvent } from "./db.js";
import { startMacWindowPolling } from "./macos-windows.js";
import { explainWindowMatches, isAiEnabled } from "./openai.js";
import { rankSessions } from "./search.js";
import { getSessionDetails, getSourceDiagnostics, getStateSnapshot, startSourcePolling } from "./source.js";
import type { IngestPayload } from "./types.js";

const port = Number(process.env.PORT ?? 4321);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const ingestSchema = z.object({
  sessionId: z.string().min(1),
  eventType: z.enum(["shell_start", "command_start", "prompt", "cwd_change"]),
  cwd: z.string().min(1),
  command: z.string().optional().default(""),
  activeCommand: z.string().optional().default(""),
  title: z.string().optional().default(""),
  terminalProgram: z.string().optional().default(""),
  tty: z.string().optional().default(""),
  shell: z.string().optional().default(""),
  hostname: z.string().optional().default(""),
  pid: z.coerce.number().optional(),
  repoRoot: z.string().optional().default(""),
  gitBranch: z.string().optional().default("")
});

const aiSearchSchema = z.object({
  query: z.string().min(2)
});

const focusSchema = z.object({
  sessionId: z.string().min(1)
});

const execFileAsync = promisify(execFile);

/* ── Icon extraction (macOS only) ── */
const iconCache = new Map<string, Buffer | null>();
const iconInFlight = new Map<string, Promise<Buffer | null>>();

const extractMacIcon = async (bundleId: string, appName: string): Promise<Buffer | null> => {
  const key = (bundleId || appName).toLowerCase().replace(/[^a-z0-9.]/g, "");
  if (iconCache.has(key)) return iconCache.get(key) ?? null;
  if (iconInFlight.has(key)) return iconInFlight.get(key) ?? null;

  const work = (async (): Promise<Buffer | null> => {
    try {
      let appPath: string | null = null;

      // Resolve app bundle path
      if (bundleId) {
        try {
          const { stdout } = await execFileAsync("osascript", [
            "-e", `POSIX path of (path to application id "${bundleId}")`
          ], { timeout: 2500 });
          appPath = stdout.trim().replace(/\/$/, "");
        } catch { /* try by name next */ }
      }

      if (!appPath && appName) {
        try {
          const { stdout } = await execFileAsync("osascript", [
            "-e", `POSIX path of (path to application "${appName}")`
          ], { timeout: 2500 });
          appPath = stdout.trim().replace(/\/$/, "");
        } catch { /* no path found */ }
      }

      if (!appPath) return null;

      // Read icon name from Info.plist
      let iconName = "AppIcon";
      try {
        const { stdout } = await execFileAsync("/usr/libexec/PlistBuddy", [
          "-c", "Print :CFBundleIconFile",
          `${appPath}/Contents/Info.plist`
        ], { timeout: 1000 });
        iconName = stdout.trim().replace(/\.icns$/, "");
      } catch { /* use default name */ }

      const resourcesDir = `${appPath}/Contents/Resources`;
      const candidates = [
        `${resourcesDir}/${iconName}.icns`,
        `${resourcesDir}/${iconName}`,
        `${resourcesDir}/AppIcon.icns`,
        `${resourcesDir}/app.icns`,
      ];

      const tmpPath = `/tmp/goodeye_icon_${key}.png`;

      for (const icnsPath of candidates) {
        if (!fs.existsSync(icnsPath)) continue;
        try {
          await execFileAsync("sips", [
            "-s", "format", "png", "-Z", "128",
            icnsPath, "--out", tmpPath
          ], { timeout: 3000 });
          const buf = await fs.promises.readFile(tmpPath);
          fs.promises.unlink(tmpPath).catch(() => {});
          iconCache.set(key, buf);
          return buf;
        } catch { /* try next candidate */ }
      }

      return null;
    } catch {
      return null;
    } finally {
      iconInFlight.delete(key);
    }
  })();

  iconInFlight.set(key, work);
  iconCache.set(key, null); // optimistic null until resolved
  const result = await work;
  iconCache.set(key, result);
  return result;
};

const httpServer = createServer(app);
const websocketServer = new WebSocketServer({ server: httpServer, path: "/ws" });

const broadcastState = async (): Promise<void> => {
  const payload = JSON.stringify({
    type: "state:update",
    data: await getStateSnapshot()
  });

  for (const client of websocketServer.clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
};

app.get("/api/health", async (_request, response) => {
  response.json({ ok: true, aiEnabled: isAiEnabled(), source: await getSourceDiagnostics() });
});

app.get("/api/source", async (_request, response) => {
  response.json(await getSourceDiagnostics());
});

app.get("/api/state", async (_request, response) => {
  response.json(await getStateSnapshot());
});

app.get("/api/sessions/:sessionId", async (request, response) => {
  const result = await getSessionDetails(request.params.sessionId);

  if (!result.session) {
    response.status(404).json({ error: "Session not found" });
    return;
  }

  response.json(result);
});

app.post("/api/ingest", async (request, response) => {
  const parsed = ingestSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const session = ingestSessionEvent(parsed.data as IngestPayload);
  await broadcastState();
  response.json({ ok: true, session });
});

app.get("/api/icon", async (request, response) => {
  const bundleId = String(request.query.bundleId ?? "").trim();
  const appName = String(request.query.appName ?? "").trim();

  if (!bundleId && !appName) {
    response.status(400).end();
    return;
  }

  // Set cache headers so browsers don't re-fetch on every render
  response.setHeader("Cache-Control", "public, max-age=86400");

  const buf = await extractMacIcon(bundleId, appName);
  if (!buf) {
    response.status(404).end();
    return;
  }

  response.setHeader("Content-Type", "image/png");
  response.send(buf);
});

app.post("/api/windows/focus", async (request, response) => {
  if (process.platform !== "darwin") {
    response.status(400).json({ error: "Window focus is only supported on macOS." });
    return;
  }

  const parsed = focusSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "sessionId is required." });
    return;
  }

  const sessionDetails = await getSessionDetails(parsed.data.sessionId);
  if (!sessionDetails.session) {
    response.status(404).json({ error: "Session not found." });
    return;
  }

  const { session } = sessionDetails;
  const appName = session.appDisplayName || session.terminalProgram;
  const windowTitle = session.title;

  if (!appName) {
    response.status(400).json({ error: "No app name available for this session." });
    return;
  }

  // JXA: raise a specific window by title, then activate the app
  const script = `
    const systemEvents = Application("System Events");
    const appName = ${JSON.stringify(appName)};
    const windowTitle = ${JSON.stringify(windowTitle)};
    const processes = systemEvents.applicationProcesses.whose({ name: appName })();
    if (processes.length > 0) {
      const proc = processes[0];
      if (windowTitle) {
        const wins = proc.windows.whose({ name: windowTitle })();
        if (wins.length > 0) {
          try { wins[0].actions["AXRaise"].perform(); } catch(e) {}
        }
      }
      proc.frontmost = true;
    }
    Application(appName).activate();
    true;
  `.trim();

  try {
    await execFileAsync("osascript", ["-l", "JavaScript", "-e", script], { timeout: 3000 });
    response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Focus failed";
    response.status(500).json({ error: message });
  }
});

app.post("/api/ai/search", async (request, response) => {
  const parsed = aiSearchSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const snapshot = await getStateSnapshot();
  const matches = rankSessions(parsed.data.query, snapshot.sessions);
  const { answer: aiAnswer, prompt } = await explainWindowMatches(
    parsed.data.query,
    snapshot.sessions,
    matches
  );
  const answer =
    aiAnswer ??
    (matches[0]
      ? `Best local match: ${matches[0].sessionId}. Search is currently using local ranking only.`
      : "No likely window match found yet. Try a repo name, branch, command, or file path.");

  response.json({
    query: parsed.data.query,
    matches,
    mode: isAiEnabled() ? "ai" : "local",
    prompt,
    answer,
    source: snapshot.source
  });
});

const clientDistPath = path.join(process.cwd(), "dist");

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get(/^(?!\/api).*/, (_request, response) => {
    response.sendFile(path.join(clientDistPath, "index.html"));
  });
}

startSourcePolling(() => {
  void broadcastState();
});

startMacWindowPolling(() => {
  void broadcastState();
});

httpServer.listen(port, () => {
  console.log(`Terminal Scout listening on http://127.0.0.1:${port}`);
});
