export interface SessionRecord {
  sessionId: string;
  title: string;
  terminalProgram: string;
  appIdentifier: string;
  appDisplayName: string;
  appDescription: string;
  cwd: string;
  repoRoot: string;
  gitBranch: string;
  tty: string;
  shell: string;
  hostname: string;
  pid: number | null;
  lastCommand: string;
  status: "idle" | "running" | "minimized";
  contentPreview?: string;
  startedAt: number;
  lastSeenAt: number;
  commandCount: number;
  recentFiles: string[];
}

export interface EventRecord {
  id: number;
  sessionId: string;
  eventType: string;
  cwd: string;
  command: string;
  createdAt: number;
  files: string[];
  summary: string;
}

export interface SearchMatch {
  sessionId: string;
  score: number;
  summary: string;
  excerpt: string;
}

export interface SearchResponse {
  answer: string;
  matches: SearchMatch[];
  mode: "ai" | "local";
  prompt: string | null;
}

export interface SourceInfo {
  mode: "sqlite" | "upstream" | "macos-windows";
  description: string;
  healthy: boolean;
  upstreamStateUrl: string;
  upstreamSessionUrlTemplate: string;
  lastSyncAt: number | null;
  lastError: string;
  localSessionCount: number;
  localEventCount: number;
  localLastEventAt: number | null;
  databasePath: string;
}

export interface StateSnapshot {
  sessions: SessionRecord[];
  aiEnabled: boolean;
  stats: {
    totalSessions: number;
    runningSessions: number;
    repos: number;
    databasePath: string;
  };
  source: SourceInfo;
}
