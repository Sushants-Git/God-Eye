import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { resolveAppMetadata } from "./app-metadata.js";
import { listSessions, upsertPrefixedSessions } from "./db.js";
import type { SessionRecord } from "./types.js";

const execFileAsync = promisify(execFile);

const sessionPrefix = "mac-window:";
const collectorEnabledEnv = (process.env.TERMINAL_SCOUT_MAC_WINDOWS ?? "").trim().toLowerCase();
const collectorEnabled =
  process.platform === "darwin" &&
  collectorEnabledEnv !== "0" &&
  collectorEnabledEnv !== "false" &&
  collectorEnabledEnv !== "off";
const pollMs = Number(process.env.TERMINAL_SCOUT_MAC_WINDOWS_POLL_MS ?? 2000);
const readContent = process.env.TERMINAL_SCOUT_READ_CONTENT === "1";

let lastSyncAt: number | null = null;
let lastError = "";
let lastSignature = "";

interface MacWindowRow {
  sessionId: string;
  title: string;
  terminalProgram: string;
  bundleId: string;
  pid: number | null;
  status: "idle" | "running" | "minimized";
  cwd: string;
  activeCommand: string;
  contentPreview: string;
}

const normalizeText = (value: string): string => value.trim().toLowerCase();

const isGhosttySession = (session: SessionRecord): boolean =>
  normalizeText(session.terminalProgram).includes("ghostty") ||
  normalizeText(session.appIdentifier) === "com.mitchellh.ghostty" ||
  normalizeText(session.appDisplayName) === "ghostty";

const looksLikePath = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;

  return (
    trimmed.startsWith("/") ||
    trimmed.startsWith("~/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.includes("/Users/") ||
    trimmed.includes(path.sep)
  );
};

const cleanGhosttyCommand = (value: string, cwd: string, title: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalized = normalizeText(trimmed);
  if (normalized === normalizeText(cwd) || normalized === normalizeText(title)) {
    return "";
  }

  if (looksLikePath(trimmed)) {
    return "";
  }

  return trimmed;
};

const inferGhosttyCommand = (row: MacWindowRow): string =>
  cleanGhosttyCommand(row.activeCommand, row.cwd, row.title) ||
  cleanGhosttyCommand(row.title, row.cwd, row.title === row.activeCommand ? "" : row.title);

const scoreGhosttyMatch = (row: MacWindowRow, session: SessionRecord): number => {
  let score = 0;
  const rowTitle = normalizeText(row.title);
  const rowCwd = normalizeText(row.cwd);
  const rowCommand = normalizeText(inferGhosttyCommand(row));
  const sessionCwd = normalizeText(session.cwd);
  const sessionRepo = normalizeText(session.repoRoot);
  const sessionActive = normalizeText(session.activeCommand);
  const sessionLast = normalizeText(session.lastCommand);

  if (rowCwd && sessionCwd && rowCwd === sessionCwd) score += 120;
  if (rowCwd && sessionRepo && rowCwd === sessionRepo) score += 80;
  if (rowCwd && sessionRepo && rowCwd.startsWith(`${sessionRepo}/`)) score += 40;

  if (rowCommand && sessionActive && rowCommand === sessionActive) score += 100;
  else if (rowCommand && sessionLast && rowCommand === sessionLast) score += 80;
  else if (rowCommand && sessionActive && sessionActive.includes(rowCommand)) score += 45;
  else if (rowCommand && sessionLast && sessionLast.includes(rowCommand)) score += 35;

  if (rowTitle && sessionActive && rowTitle === sessionActive) score += 70;
  else if (rowTitle && sessionLast && rowTitle === sessionLast) score += 55;

  if (session.status === "running") score += 15;

  const ageMs = Math.max(0, Date.now() - session.lastSeenAt);
  score += Math.max(0, 12 - Math.floor(ageMs / 2000));

  return score;
};

const enrichGhosttyRows = (rows: MacWindowRow[]): SessionRecord[] => {
  const now = Date.now();
  const ingestSessions = listSessions().filter(
    (session) => !session.sessionId.startsWith(sessionPrefix) && isGhosttySession(session)
  );

  return rows.map((row) => {
    const meta = resolveAppMetadata({
      terminalProgram: row.terminalProgram,
      appIdentifier: row.bundleId,
      title: row.title
    });
    const baseCommand = inferGhosttyCommand(row);
    const bestMatch = normalizeText(row.terminalProgram).includes("ghostty")
      ? ingestSessions
          .map((session) => ({ session, score: scoreGhosttyMatch(row, session) }))
          .filter((candidate) => candidate.score >= 80)
          .sort((left, right) => right.score - left.score)[0]?.session
      : undefined;

    return {
      ...meta,
      sessionId: row.sessionId,
      title: row.title,
      terminalProgram: row.terminalProgram,
      cwd: row.cwd || bestMatch?.cwd || "",
      repoRoot: bestMatch?.repoRoot ?? "",
      gitBranch: bestMatch?.gitBranch ?? "",
      tty: bestMatch?.tty ?? "",
      shell: bestMatch?.shell ?? "",
      hostname: bestMatch?.hostname ?? "",
      pid: row.pid,
      lastCommand: bestMatch?.lastCommand ?? "",
      activeCommand: bestMatch?.activeCommand || baseCommand,
      status: row.status,
      startedAt: bestMatch?.startedAt ?? now,
      lastSeenAt: now,
      commandCount: bestMatch?.commandCount ?? 0,
      recentFiles: bestMatch?.recentFiles ?? [],
      contentPreview: row.contentPreview || bestMatch?.contentPreview || undefined,
    };
  });
};

// Collect ALL foreground app windows across all Spaces.
// We intentionally skip the visible() check so windows on other desktops
// are still included. minimized() tells us if a window is in the Dock.
const buildScript = (withContent: boolean) => `
const systemEvents = Application("System Events");
const processes = systemEvents.applicationProcesses.whose({ backgroundOnly: false })();
const windows = [];

const TERMINAL_APPS = ["ghostty", "iterm2", "terminal", "warp", "kitty", "alacritty"];

for (const proc of processes) {
  const appName = proc.name();
  let isFrontmost = false;
  let pid = null;
  let bundleId = "";
  let titles = [];
  let minimizedStates = [];

  try { isFrontmost = proc.frontmost(); } catch (e) {}
  try { pid = proc.unixId(); } catch (e) {}
  try { bundleId = Application(appName).id(); } catch (e) {}
  try { titles = proc.windows.name(); } catch (e) {}
  try { minimizedStates = proc.windows.miniaturized(); } catch (e) {}

  if (!Array.isArray(titles)) {
    titles = titles ? [titles] : [];
  }

  if (titles.length === 0) {
    // App is open but has no windows right now — skip
    continue;
  }

  const isTerminal = TERMINAL_APPS.some(t => appName.toLowerCase().includes(t));
  const isGhostty = appName.toLowerCase().includes("ghostty");

  titles.forEach((title, index) => {
    const isMinimized = Array.isArray(minimizedStates) && minimizedStates[index] === true;
    let status = isMinimized ? "minimized" : (isFrontmost && index === 0 ? "running" : "idle");
    let cwd = "";
    let activeCommand = "";
    let contentPreview = "";

    if (isGhostty && !isMinimized) {
      try {
        const ghostty = Application(appName);
        const ghostWindow = ghostty.windows[index];
        const selectedTab = ghostWindow.selectedTab();
        const focusedTerminal = selectedTab.focusedTerminal();
        const terminalName = focusedTerminal.name();
        const workingDirectory = focusedTerminal.workingDirectory();

        if (typeof terminalName === "string" && terminalName.length > 0) {
          activeCommand = terminalName.trim();
        }

        if (typeof workingDirectory === "string" && workingDirectory.length > 0) {
          cwd = workingDirectory.trim();
        }
      } catch (e) {}
    }

    if (${withContent} && isTerminal && !isMinimized) {
      try {
        const win = proc.windows[index];
        const scrollAreas = win.scrollAreas();
        if (Array.isArray(scrollAreas) && scrollAreas.length > 0) {
          const val = scrollAreas[0].value();
          if (typeof val === "string" && val.length > 0) {
            contentPreview = val.slice(-400).trim();
          }
        }
      } catch (e) {}
    }

    windows.push({
      sessionId: "mac-window:" + (pid !== null ? pid : appName) + ":" + index,
      title: title || appName,
      terminalProgram: appName,
      bundleId: bundleId || "",
      pid: pid !== null ? pid : null,
      status: status,
      cwd: cwd,
      activeCommand: activeCommand,
      contentPreview: contentPreview,
    });
  });
}

JSON.stringify({ windows });
`.trim();

const signatureFor = (sessions: SessionRecord[]): string =>
  JSON.stringify(
    sessions.map((session) => [
      session.sessionId,
      session.title,
      session.terminalProgram,
      session.appIdentifier,
      session.status,
      session.pid,
      session.cwd,
      session.activeCommand,
      session.lastCommand
    ])
  );

const pollWindows = async (): Promise<MacWindowRow[]> => {
  const script = buildScript(readContent);
  const { stdout } = await execFileAsync("osascript", ["-l", "JavaScript", "-e", script], {
    timeout: 6000
  });
  const parsed = JSON.parse(stdout) as { windows?: unknown };
  const windows = Array.isArray(parsed.windows) ? parsed.windows : [];

  return windows.flatMap((value) => {
    if (!value || typeof value !== "object") return [];

    const record = value as Record<string, unknown>;
    const sessionId = typeof record.sessionId === "string" ? record.sessionId : "";
    const title = typeof record.title === "string" ? record.title : "";
    const terminalProgram = typeof record.terminalProgram === "string" ? record.terminalProgram : "Window";
    const bundleId = typeof record.bundleId === "string" ? record.bundleId : "";
    const pid = typeof record.pid === "number" ? record.pid : null;
    const rawStatus = record.status;
    const status: MacWindowRow["status"] =
      rawStatus === "running" ? "running" : rawStatus === "minimized" ? "minimized" : "idle";
    const cwd = typeof record.cwd === "string" ? record.cwd : "";
    const activeCommand = typeof record.activeCommand === "string" ? record.activeCommand : "";
    const contentPreview = typeof record.contentPreview === "string" ? record.contentPreview : "";

    if (!sessionId) return [];

    return [{ sessionId, title, terminalProgram, bundleId, pid, status, cwd, activeCommand, contentPreview }];
  });
};

const syncWindows = async (onChange: () => void): Promise<void> => {
  if (!collectorEnabled) return;

  try {
    const rows = await pollWindows();
    const sessions = enrichGhosttyRows(rows);
    const nextSignature = signatureFor(sessions);
    upsertPrefixedSessions(sessionPrefix, sessions, 60_000);
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
  if (!collectorEnabled) return;

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
