import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { resolveAppMetadata } from "./app-metadata.js";
import type { EventRecord, IngestPayload, SessionRecord } from "./types.js";

const dataDir = path.join(process.cwd(), ".data");
const dbPath = process.env.TERMINAL_SCOUT_DB_PATH ?? path.join(dataDir, "terminal-scout.db");

fs.mkdirSync(dataDir, { recursive: true });

const database = new Database(dbPath);
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");

database.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    terminal_program TEXT NOT NULL DEFAULT '',
    cwd TEXT NOT NULL,
    repo_root TEXT NOT NULL DEFAULT '',
    git_branch TEXT NOT NULL DEFAULT '',
    tty TEXT NOT NULL DEFAULT '',
    shell TEXT NOT NULL DEFAULT '',
    hostname TEXT NOT NULL DEFAULT '',
    pid INTEGER,
    last_command TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'idle',
    started_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    command_count INTEGER NOT NULL DEFAULT 0,
    recent_files_json TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    cwd TEXT NOT NULL,
    command TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    files_json TEXT NOT NULL DEFAULT '[]',
    summary TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_events_session_created
    ON events(session_id, created_at DESC);
`);

const existingSessionColumns = new Set(
  (database.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>).map(
    (column) => column.name
  )
);

const ensureSessionColumn = (name: string, definition: string): void => {
  if (existingSessionColumns.has(name)) {
    return;
  }

  database.exec(`ALTER TABLE sessions ADD COLUMN ${name} ${definition}`);
  existingSessionColumns.add(name);
};

ensureSessionColumn("app_identifier", "TEXT NOT NULL DEFAULT ''");
ensureSessionColumn("app_display_name", "TEXT NOT NULL DEFAULT ''");
ensureSessionColumn("app_description", "TEXT NOT NULL DEFAULT ''");

const selectSessionStatement = database.prepare(`
  SELECT
    session_id,
    title,
    terminal_program,
    app_identifier,
    app_display_name,
    app_description,
    cwd,
    repo_root,
    git_branch,
    tty,
    shell,
    hostname,
    pid,
    last_command,
    status,
    started_at,
    last_seen_at,
    command_count,
    recent_files_json
  FROM sessions
  WHERE session_id = ?
`);

const listSessionsStatement = database.prepare(`
  SELECT
    session_id,
    title,
    terminal_program,
    app_identifier,
    app_display_name,
    app_description,
    cwd,
    repo_root,
    git_branch,
    tty,
    shell,
    hostname,
    pid,
    last_command,
    status,
    started_at,
    last_seen_at,
    command_count,
    recent_files_json
  FROM sessions
  ORDER BY last_seen_at DESC
`);

const listSessionIdsByPrefixStatement = database.prepare(`
  SELECT session_id
  FROM sessions
  WHERE session_id LIKE ?
`);

const deleteEventsForSessionStatement = database.prepare(`
  DELETE FROM events
  WHERE session_id = ?
`);

const deleteSessionStatement = database.prepare(`
  DELETE FROM sessions
  WHERE session_id = ?
`);

const listEventsStatement = database.prepare(`
  SELECT
    id,
    session_id,
    event_type,
    cwd,
    command,
    created_at,
    files_json,
    summary
  FROM events
  WHERE session_id = ?
  ORDER BY created_at DESC
  LIMIT ?
`);

const countSessionsStatement = database.prepare(`
  SELECT COUNT(*) AS count
  FROM sessions
`);

const countEventsStatement = database.prepare(`
  SELECT COUNT(*) AS count
  FROM events
`);

const lastEventAtStatement = database.prepare(`
  SELECT MAX(created_at) AS lastEventAt
  FROM events
`);

const insertSessionStatement = database.prepare(`
  INSERT INTO sessions (
    session_id,
    title,
    terminal_program,
    app_identifier,
    app_display_name,
    app_description,
    cwd,
    repo_root,
    git_branch,
    tty,
    shell,
    hostname,
    pid,
    last_command,
    status,
    started_at,
    last_seen_at,
    command_count,
    recent_files_json
  )
  VALUES (
    @sessionId,
    @title,
    @terminalProgram,
    @appIdentifier,
    @appDisplayName,
    @appDescription,
    @cwd,
    @repoRoot,
    @gitBranch,
    @tty,
    @shell,
    @hostname,
    @pid,
    @lastCommand,
    @status,
    @startedAt,
    @lastSeenAt,
    @commandCount,
    @recentFilesJson
  )
  ON CONFLICT(session_id) DO UPDATE SET
    title = excluded.title,
    terminal_program = excluded.terminal_program,
    app_identifier = excluded.app_identifier,
    app_display_name = excluded.app_display_name,
    app_description = excluded.app_description,
    cwd = excluded.cwd,
    repo_root = excluded.repo_root,
    git_branch = excluded.git_branch,
    tty = excluded.tty,
    shell = excluded.shell,
    hostname = excluded.hostname,
    pid = excluded.pid,
    last_command = excluded.last_command,
    status = excluded.status,
    last_seen_at = excluded.last_seen_at,
    command_count = excluded.command_count,
    recent_files_json = excluded.recent_files_json
`);

const insertEventStatement = database.prepare(`
  INSERT INTO events (
    session_id,
    event_type,
    cwd,
    command,
    created_at,
    files_json,
    summary
  )
  VALUES (
    @sessionId,
    @eventType,
    @cwd,
    @command,
    @createdAt,
    @filesJson,
    @summary
  )
`);

const pruneEventsStatement = database.prepare(`
  DELETE FROM events
  WHERE session_id = ?
    AND id NOT IN (
      SELECT id
      FROM events
      WHERE session_id = ?
      ORDER BY created_at DESC
      LIMIT 60
    )
`);

const parseJsonArray = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
};

const mapSessionRow = (row: Record<string, unknown>): SessionRecord => ({
  sessionId: String(row.session_id),
  title: String(row.title ?? ""),
  terminalProgram: String(row.terminal_program ?? ""),
  appIdentifier: String(row.app_identifier ?? ""),
  appDisplayName: String(row.app_display_name ?? ""),
  appDescription: String(row.app_description ?? ""),
  cwd: String(row.cwd ?? ""),
  repoRoot: String(row.repo_root ?? ""),
  gitBranch: String(row.git_branch ?? ""),
  tty: String(row.tty ?? ""),
  shell: String(row.shell ?? ""),
  hostname: String(row.hostname ?? ""),
  pid: typeof row.pid === "number" ? row.pid : null,
  lastCommand: String(row.last_command ?? ""),
  status: row.status === "running" ? "running" : "idle",
  startedAt: Number(row.started_at ?? Date.now()),
  lastSeenAt: Number(row.last_seen_at ?? Date.now()),
  commandCount: Number(row.command_count ?? 0),
  recentFiles: parseJsonArray(String(row.recent_files_json ?? "[]"))
});

const mapEventRow = (row: Record<string, unknown>): EventRecord => ({
  id: Number(row.id),
  sessionId: String(row.session_id),
  eventType: String(row.event_type) as EventRecord["eventType"],
  cwd: String(row.cwd ?? ""),
  command: String(row.command ?? ""),
  createdAt: Number(row.created_at ?? Date.now()),
  files: parseJsonArray(String(row.files_json ?? "[]")),
  summary: String(row.summary ?? "")
});

const shellWords = (text: string): string[] => {
  const tokens: string[] = [];
  const pattern = /"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s]+)/g;

  for (const match of text.matchAll(pattern)) {
    const token = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (token) {
      tokens.push(token);
    }
  }

  return tokens;
};

const looksLikeFile = (token: string): boolean => {
  if (!token || token.startsWith("-") || token.includes("=")) {
    return false;
  }

  if (
    token.includes("://") ||
    token === "localhost" ||
    /^[0-9.]+$/.test(token) ||
    /^[0-9.:]+$/.test(token)
  ) {
    return false;
  }

  return (
    token.startsWith("./") ||
    token.startsWith("../") ||
    token.startsWith("/") ||
    token.startsWith("~/") ||
    token.includes("/") ||
    /\.[a-z0-9]{1,8}$/i.test(token)
  );
};

const normalizeFile = (cwd: string, token: string): string | null => {
  const expanded = token.startsWith("~/")
    ? path.join(process.env.HOME ?? "", token.slice(2))
    : token;
  const absolute = path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
  const normalized = path.normalize(absolute);

  if (!normalized.startsWith("/")) {
    return null;
  }

  return normalized;
};

const extractFiles = (cwd: string, command: string): string[] => {
  if (!command) {
    return [];
  }

  const files: string[] = [];

  for (const token of shellWords(command).slice(1)) {
    if (!looksLikeFile(token)) {
      continue;
    }

    const normalized = normalizeFile(cwd, token);
    if (normalized) {
      files.push(normalized);
    }
  }

  return Array.from(new Set(files)).slice(0, 8);
};

const mergeRecentFiles = (current: string[], incoming: string[]): string[] => {
  const merged = [...incoming, ...current].filter(Boolean);
  return Array.from(new Set(merged)).slice(0, 10);
};

const summarizeEvent = (payload: IngestPayload, files: string[]): string => {
  const parts = [payload.eventType.replaceAll("_", " "), payload.cwd];

  if (payload.command) {
    parts.push(payload.command);
  }

  if (files.length > 0) {
    parts.push(`files: ${files.slice(0, 3).join(", ")}`);
  }

  return parts.join(" | ");
};

export const ingestSessionEvent = (payload: IngestPayload): SessionRecord => {
  const existingRow = selectSessionStatement.get(payload.sessionId) as Record<string, unknown> | undefined;
  const existingSession = existingRow ? mapSessionRow(existingRow) : null;
  const now = Date.now();
  const files = extractFiles(payload.cwd, payload.command ?? "");
  const recentFiles = mergeRecentFiles(existingSession?.recentFiles ?? [], files);
  const status = payload.eventType === "command_start" ? "running" : "idle";
  const appMetadata = resolveAppMetadata({
    terminalProgram: payload.terminalProgram ?? existingSession?.terminalProgram,
    appIdentifier: payload.appIdentifier ?? existingSession?.appIdentifier,
    appDisplayName: payload.appDisplayName ?? existingSession?.appDisplayName,
    appDescription: payload.appDescription ?? existingSession?.appDescription,
    title: payload.title ?? existingSession?.title
  });

  insertSessionStatement.run({
    sessionId: payload.sessionId,
    title: payload.title ?? existingSession?.title ?? "",
    terminalProgram: payload.terminalProgram ?? existingSession?.terminalProgram ?? "",
    appIdentifier: appMetadata.appIdentifier,
    appDisplayName: appMetadata.appDisplayName,
    appDescription: appMetadata.appDescription,
    cwd: payload.cwd,
    repoRoot: payload.repoRoot ?? existingSession?.repoRoot ?? "",
    gitBranch: payload.gitBranch ?? existingSession?.gitBranch ?? "",
    tty: payload.tty ?? existingSession?.tty ?? "",
    shell: payload.shell ?? existingSession?.shell ?? "",
    hostname: payload.hostname ?? existingSession?.hostname ?? "",
    pid: payload.pid ?? existingSession?.pid ?? null,
    lastCommand: payload.command ?? existingSession?.lastCommand ?? "",
    status,
    startedAt: existingSession?.startedAt ?? now,
    lastSeenAt: now,
    commandCount: (existingSession?.commandCount ?? 0) + (payload.eventType === "command_start" ? 1 : 0),
    recentFilesJson: JSON.stringify(recentFiles)
  });

  insertEventStatement.run({
    sessionId: payload.sessionId,
    eventType: payload.eventType,
    cwd: payload.cwd,
    command: payload.command ?? "",
    createdAt: now,
    filesJson: JSON.stringify(files),
    summary: summarizeEvent(payload, files)
  });

  pruneEventsStatement.run(payload.sessionId, payload.sessionId);

  const updatedRow = selectSessionStatement.get(payload.sessionId) as Record<string, unknown>;
  return mapSessionRow(updatedRow);
};

export const listSessions = (): SessionRecord[] =>
  (listSessionsStatement.all() as Record<string, unknown>[]).map(mapSessionRow);

export const getSession = (
  sessionId: string
): { session: SessionRecord | null; events: EventRecord[] } => {
  const row = selectSessionStatement.get(sessionId) as Record<string, unknown> | undefined;

  if (!row) {
    return { session: null, events: [] };
  }

  return {
    session: mapSessionRow(row),
    events: (listEventsStatement.all(sessionId, 30) as Record<string, unknown>[]).map(mapEventRow)
  };
};

export const getDatabasePath = (): string => dbPath;

export const getLocalStoreStats = (): {
  sessionCount: number;
  eventCount: number;
  lastEventAt: number | null;
} => {
  const sessionsRow = countSessionsStatement.get() as { count?: number };
  const eventsRow = countEventsStatement.get() as { count?: number };
  const lastEventRow = lastEventAtStatement.get() as { lastEventAt?: number | null };

  return {
    sessionCount: Number(sessionsRow.count ?? 0),
    eventCount: Number(eventsRow.count ?? 0),
    lastEventAt:
      typeof lastEventRow.lastEventAt === "number" ? Number(lastEventRow.lastEventAt) : null
  };
};

export const upsertSessionRecord = (session: SessionRecord): SessionRecord => {
  const existingRow = selectSessionStatement.get(session.sessionId) as Record<string, unknown> | undefined;
  const existingSession = existingRow ? mapSessionRow(existingRow) : null;
  const appMetadata = resolveAppMetadata({
    terminalProgram: session.terminalProgram,
    appIdentifier: session.appIdentifier,
    appDisplayName: session.appDisplayName,
    appDescription: session.appDescription,
    title: session.title
  });

  insertSessionStatement.run({
    sessionId: session.sessionId,
    title: session.title,
    terminalProgram: session.terminalProgram,
    appIdentifier: appMetadata.appIdentifier,
    appDisplayName: appMetadata.appDisplayName,
    appDescription: appMetadata.appDescription,
    cwd: session.cwd,
    repoRoot: session.repoRoot,
    gitBranch: session.gitBranch,
    tty: session.tty,
    shell: session.shell,
    hostname: session.hostname,
    pid: session.pid,
    lastCommand: session.lastCommand,
    status: session.status,
    startedAt: existingSession?.startedAt ?? session.startedAt,
    lastSeenAt: session.lastSeenAt,
    commandCount: session.commandCount,
    recentFilesJson: JSON.stringify(session.recentFiles)
  });

  const updatedRow = selectSessionStatement.get(session.sessionId) as Record<string, unknown>;
  return mapSessionRow(updatedRow);
};

export const syncPrefixedSessions = (prefix: string, sessions: SessionRecord[]): void => {
  const existingIds = new Set(
    (listSessionIdsByPrefixStatement.all(`${prefix}%`) as Array<{ session_id: string }>).map(
      (row) => row.session_id
    )
  );
  const incomingIds = new Set(sessions.map((session) => session.sessionId));

  for (const session of sessions) {
    upsertSessionRecord(session);
  }

  for (const sessionId of existingIds) {
    if (incomingIds.has(sessionId)) {
      continue;
    }

    deleteEventsForSessionStatement.run(sessionId);
    deleteSessionStatement.run(sessionId);
  }
};
