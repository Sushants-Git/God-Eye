import fs from "node:fs";
import path from "node:path";
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

app.post("/api/ai/search", async (request, response) => {
  const parsed = aiSearchSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const snapshot = await getStateSnapshot();
  const matches = rankSessions(parsed.data.query, snapshot.sessions);
  const answer =
    (await explainWindowMatches(parsed.data.query, matches)) ??
    (matches[0]
      ? `Best local match: ${matches[0].sessionId}. Search is currently using local ranking only.`
      : "No likely window match found yet. Try a repo name, branch, command, or file path.");

  response.json({
    query: parsed.data.query,
    matches,
    mode: isAiEnabled() ? "ai" : "local",
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
