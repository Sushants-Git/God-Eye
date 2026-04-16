import { getDatabasePath, getLocalStoreStats, getSession, listSessions } from "./db.js";
import { resolveAppMetadata } from "./app-metadata.js";
import { getMacWindowCollectorState } from "./macos-windows.js";
import type { EventRecord, SessionRecord, SourceInfo, StateSnapshot } from "./types.js";

const upstreamStateUrl = (process.env.TERMINAL_SCOUT_UPSTREAM_STATE_URL ?? "").trim();
const upstreamSessionUrlTemplate = (
  process.env.TERMINAL_SCOUT_UPSTREAM_SESSION_URL_TEMPLATE ?? ""
).trim();
const upstreamPollMs = Number(process.env.TERMINAL_SCOUT_UPSTREAM_POLL_MS ?? 2000);

let lastSyncAt: number | null = null;
let lastError = "";
let lastSignature = "";

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const readString = (record: Record<string, unknown>, keys: string[], fallback = ""): string => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return fallback;
};

const readNumber = (record: Record<string, unknown>, keys: string[], fallback: number): number => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }

  return fallback;
};

const readStringArray = (record: Record<string, unknown>, keys: string[]): string[] => {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
  }

  return [];
};

const normalizeSession = (value: unknown, index: number): SessionRecord => {
  const record = toRecord(value);
  const now = Date.now();
  const pidValue = readNumber(record, ["pid"], Number.NaN);
  const running =
    record.running === true || readString(record, ["status"], "").toLowerCase() === "running";
  const appMetadata = resolveAppMetadata({
    terminalProgram: readString(record, ["terminalProgram", "terminal_program", "terminal", "app"]),
    appIdentifier: readString(record, ["appIdentifier", "app_identifier", "bundleId", "bundle_id"]),
    appDisplayName: readString(record, ["appDisplayName", "app_display_name", "appName", "app_name"]),
    appDescription: readString(record, ["appDescription", "app_description"]),
    title: readString(record, ["title", "name"])
  });

  return {
    sessionId: readString(record, ["sessionId", "session_id", "id"], `session-${index}`),
    title: readString(record, ["title", "name"]),
    terminalProgram: readString(record, ["terminalProgram", "terminal_program", "terminal", "app"]),
    appIdentifier: appMetadata.appIdentifier,
    appDisplayName: appMetadata.appDisplayName,
    appDescription: appMetadata.appDescription,
    cwd: readString(record, ["cwd", "workingDirectory", "working_directory"]),
    repoRoot: readString(record, ["repoRoot", "repo_root"]),
    gitBranch: readString(record, ["gitBranch", "git_branch", "branch"]),
    tty: readString(record, ["tty"]),
    shell: readString(record, ["shell"]),
    hostname: readString(record, ["hostname", "host"]),
    pid: Number.isFinite(pidValue) ? pidValue : null,
    lastCommand: readString(record, ["lastCommand", "last_command", "command"]),
    activeCommand: readString(record, ["activeCommand", "active_command", "runningCommand", "running_command"]),
    status: running ? "running" : "idle",
    startedAt: readNumber(record, ["startedAt", "started_at"], now),
    lastSeenAt: readNumber(record, ["lastSeenAt", "last_seen_at", "updatedAt", "updated_at"], now),
    commandCount: readNumber(record, ["commandCount", "command_count"], 0),
    recentFiles: readStringArray(record, ["recentFiles", "recent_files"])
  };
};

const normalizeEvent = (value: unknown, index: number, sessionId: string): EventRecord => {
  const record = toRecord(value);

  return {
    id: readNumber(record, ["id"], index + 1),
    sessionId: readString(record, ["sessionId", "session_id"], sessionId),
    eventType: readString(record, ["eventType", "event_type"], "prompt") as EventRecord["eventType"],
    cwd: readString(record, ["cwd"]),
    command: readString(record, ["command"]),
    createdAt: readNumber(record, ["createdAt", "created_at"], Date.now()),
    files: readStringArray(record, ["files", "recentFiles", "recent_files"]),
    summary: readString(record, ["summary"])
  };
};

const buildStats = (sessions: SessionRecord[]) => ({
  totalSessions: sessions.length,
  runningSessions: sessions.filter((session) => session.status === "running").length,
  repos: new Set(sessions.map((session) => session.repoRoot).filter(Boolean)).size,
  databasePath: getDatabasePath()
});

const getSourceInfo = (overrides: Partial<SourceInfo> = {}): SourceInfo => {
  const local = getLocalStoreStats();
  const macCollector = getMacWindowCollectorState();
  const mode: SourceInfo["mode"] = upstreamStateUrl
    ? "upstream"
    : macCollector.enabled
      ? "macos-windows"
      : "sqlite";

  return {
    mode,
    description: upstreamStateUrl
      ? "State is being fetched from an upstream local server."
      : macCollector.enabled
        ? macCollector.description
        : "State is coming from the local SQLite cache populated via /api/ingest.",
    healthy: upstreamStateUrl ? !lastError : macCollector.enabled ? macCollector.healthy : true,
    upstreamStateUrl,
    upstreamSessionUrlTemplate,
    lastSyncAt: upstreamStateUrl ? lastSyncAt : macCollector.enabled ? macCollector.lastSyncAt : lastSyncAt,
    lastError: upstreamStateUrl ? lastError : macCollector.enabled ? macCollector.lastError : lastError,
    localSessionCount: local.sessionCount,
    localEventCount: local.eventCount,
    localLastEventAt: local.lastEventAt,
    databasePath: getDatabasePath(),
    ...overrides
  };
};

const buildLocalSnapshot = (description?: string): StateSnapshot => {
  const sessions = listSessions();

  return {
    sessions,
    aiEnabled: Boolean(process.env.OPENAI_API_KEY),
    stats: buildStats(sessions),
    source: getSourceInfo({
      description:
        description ??
        (getMacWindowCollectorState().enabled
          ? getMacWindowCollectorState().description
          : "State is coming from the local SQLite cache populated via /api/ingest.")
    })
  };
};

const normalizeStatePayload = (payload: unknown): SessionRecord[] => {
  if (Array.isArray(payload)) {
    return payload.map(normalizeSession);
  }

  const record = toRecord(payload);
  if (Array.isArray(record.sessions)) {
    return record.sessions.map(normalizeSession);
  }

  return [];
};

const fetchJson = async (url: string): Promise<unknown> => {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(2000)
  });

  if (!response.ok) {
    throw new Error(`Upstream request failed with status ${response.status}`);
  }

  return response.json();
};

export const getStateSnapshot = async (): Promise<StateSnapshot> => {
  if (!upstreamStateUrl) {
    lastError = "";
    return buildLocalSnapshot();
  }

  try {
    const payload = await fetchJson(upstreamStateUrl);
    const sessions = normalizeStatePayload(payload);
    lastSyncAt = Date.now();
    lastError = "";

    return {
      sessions,
      aiEnabled: Boolean(process.env.OPENAI_API_KEY),
      stats: buildStats(sessions),
      source: getSourceInfo({
        healthy: true,
        description: `State is being fetched from ${upstreamStateUrl}.`
      })
    };
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Unknown upstream error";

    return {
      ...buildLocalSnapshot("Upstream state fetch failed, falling back to local SQLite cache."),
      source: getSourceInfo({
        healthy: false,
        description: `Upstream fetch failed, so the server fell back to ${getDatabasePath()}.`
      })
    };
  }
};

export const getSourceDiagnostics = async (): Promise<SourceInfo> => {
  const snapshot = await getStateSnapshot();
  return snapshot.source;
};

export const getSessionDetails = async (
  sessionId: string
): Promise<{ session: SessionRecord | null; events: EventRecord[] }> => {
  if (upstreamStateUrl) {
    if (upstreamSessionUrlTemplate) {
      try {
        const payload = await fetchJson(
          upstreamSessionUrlTemplate.replace("{sessionId}", encodeURIComponent(sessionId))
        );
        const record = toRecord(payload);
        const session = record.session
          ? normalizeSession(record.session, 0)
          : normalizeSession(payload, 0);
        const events = Array.isArray(record.events)
          ? record.events.map((event, index) => normalizeEvent(event, index, session.sessionId))
          : [];

        return { session, events };
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Unknown upstream session error";
      }
    }

    const snapshot = await getStateSnapshot();
    const session = snapshot.sessions.find((item) => item.sessionId === sessionId) ?? null;
    return { session, events: [] };
  }

  return getSession(sessionId);
};

const signatureFor = (sessions: SessionRecord[]): string =>
  JSON.stringify(
    sessions.map((session) => [
      session.sessionId,
      session.lastSeenAt,
      session.status,
      session.cwd,
      session.lastCommand,
      session.activeCommand
    ])
  );

export const startSourcePolling = (onChange: () => void): void => {
  if (!upstreamStateUrl) {
    return;
  }

  void getStateSnapshot().then((snapshot) => {
    lastSignature = signatureFor(snapshot.sessions);
  });

  setInterval(() => {
    void getStateSnapshot().then((snapshot) => {
      const nextSignature = signatureFor(snapshot.sessions);
      if (nextSignature !== lastSignature) {
        lastSignature = nextSignature;
        onChange();
      }
    });
  }, upstreamPollMs);
};
