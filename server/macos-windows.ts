import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { syncPrefixedSessions } from "./db.js";
import type { SessionRecord } from "./types.js";

const execFileAsync = promisify(execFile);

const sessionPrefix = "mac-window:";
const collectorEnabledEnv = (process.env.TERMINAL_SCOUT_MAC_WINDOWS ?? "").trim().toLowerCase();
const collectorEnabled =
  process.platform === "darwin" &&
  collectorEnabledEnv !== "0" &&
  collectorEnabledEnv !== "false" &&
  collectorEnabledEnv !== "off";
const pollMs = Number(process.env.TERMINAL_SCOUT_MAC_WINDOWS_POLL_MS ?? 3000);

let lastSyncAt: number | null = null;
let lastError = "";
let lastSignature = "";

interface MacWindowRow {
  sessionId: string;
  title: string;
  terminalProgram: string;
  pid: number | null;
  status: "idle" | "running";
}

const script = `
const systemEvents = Application("System Events");
const processes = systemEvents.applicationProcesses.whose({ backgroundOnly: false })();
const windows = [];

for (const process of processes) {
  const appName = process.name();
  let isVisible = false;
  let isFrontmost = false;
  let pid = null;
  let titles = [];

  try { isVisible = process.visible(); } catch (error) {}
  if (!isVisible) continue;

  try { isFrontmost = process.frontmost(); } catch (error) {}
  try { pid = process.unixId(); } catch (error) {}
  try { titles = process.windows.name(); } catch (error) {}

  if (!Array.isArray(titles)) {
    titles = titles ? [titles] : [];
  }

  if (titles.length === 0) {
    windows.push({
      sessionId: "mac-window:" + (pid || appName) + ":0",
      title: appName,
      terminalProgram: appName,
      pid: pid || null,
      status: isFrontmost ? "running" : "idle"
    });
    continue;
  }

  titles.forEach((title, index) => {
    windows.push({
      sessionId: "mac-window:" + (pid || appName) + ":" + index,
      title: title || appName,
      terminalProgram: appName,
      pid: pid || null,
      status: isFrontmost ? "running" : "idle"
    });
  });
}

JSON.stringify({ windows });
`.trim();

const normalizeRowsToSessions = (rows: MacWindowRow[]): SessionRecord[] => {
  const now = Date.now();

  return rows.map((row) => ({
    sessionId: row.sessionId,
    title: row.title,
    terminalProgram: row.terminalProgram,
    cwd: "",
    repoRoot: "",
    gitBranch: "",
    tty: "",
    shell: "",
    hostname: "",
    pid: row.pid,
    lastCommand: "",
    status: row.status,
    startedAt: now,
    lastSeenAt: now,
    commandCount: 0,
    recentFiles: []
  }));
};

const signatureFor = (rows: MacWindowRow[]): string =>
  JSON.stringify(
    rows.map((row) => [row.sessionId, row.title, row.terminalProgram, row.status, row.pid])
  );

const pollWindows = async (): Promise<MacWindowRow[]> => {
  const { stdout } = await execFileAsync("osascript", ["-l", "JavaScript", "-e", script], {
    timeout: 4000
  });
  const parsed = JSON.parse(stdout) as { windows?: unknown };
  const windows = Array.isArray(parsed.windows) ? parsed.windows : [];

  return windows.flatMap((value) => {
    if (!value || typeof value !== "object") {
      return [];
    }

    const record = value as Record<string, unknown>;
    const sessionId = typeof record.sessionId === "string" ? record.sessionId : "";
    const title = typeof record.title === "string" ? record.title : "";
    const terminalProgram =
      typeof record.terminalProgram === "string" ? record.terminalProgram : "Window";
    const pid = typeof record.pid === "number" ? record.pid : null;
    const status = record.status === "running" ? "running" : "idle";

    if (!sessionId) {
      return [];
    }

    return [{ sessionId, title, terminalProgram, pid, status }];
  });
};

const syncWindows = async (onChange: () => void): Promise<void> => {
  if (!collectorEnabled) {
    return;
  }

  try {
    const rows = await pollWindows();
    const nextSignature = signatureFor(rows);
    syncPrefixedSessions(sessionPrefix, normalizeRowsToSessions(rows));
    lastSyncAt = Date.now();
    lastError = "";

    if (nextSignature !== lastSignature) {
      lastSignature = nextSignature;
      onChange();
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Unknown macOS window collector error";
  }
};

export const startMacWindowPolling = (onChange: () => void): void => {
  if (!collectorEnabled) {
    return;
  }

  void syncWindows(onChange);
  setInterval(() => {
    void syncWindows(onChange);
  }, pollMs);
};

export const getMacWindowCollectorState = (): {
  enabled: boolean;
  healthy: boolean;
  lastSyncAt: number | null;
  lastError: string;
  description: string;
} => ({
  enabled: collectorEnabled,
  healthy: collectorEnabled ? !lastError : false,
  lastSyncAt,
  lastError,
  description: collectorEnabled
    ? "Visible macOS windows are being polled from System Events and synced into the local store."
    : process.platform === "darwin"
      ? "macOS window polling is disabled."
      : "macOS window polling is unavailable on this platform."
});
