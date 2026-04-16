import path from "node:path";

import type { SearchMatch, SessionRecord } from "./types.js";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "app",
  "around",
  "do",
  "for",
  "find",
  "kind",
  "like",
  "maybe",
  "of",
  "open",
  "related",
  "show",
  "some",
  "something",
  "someting",
  "stuff",
  "the",
  "thing",
  "to",
  "want",
  "with",
  "window"
]);

const QUERY_EXPANSIONS: Record<string, string[]> = {
  "3d": ["3d", "3-d", "3d printing", "printer", "printing", "slicer", "cad", "mesh", "model"],
  "browser": ["browser", "web", "firefox", "chrome", "safari", "arc"],
  "video": ["video", "movie", "media", "vlc", "mpv"],
  "music": ["music", "audio", "spotify", "apple music"],
};

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9._/-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));

const expandQueryTerms = (tokens: string[]): string[] => {
  const expanded = new Set(tokens);

  for (const token of tokens) {
    for (const alias of QUERY_EXPANSIONS[token] ?? []) {
      expanded.add(alias);
    }
  }

  return [...expanded];
};

const scoreText = (needle: string, haystack: string, weight: number): number => {
  if (!needle || !haystack) {
    return 0;
  }

  const normalizedNeedle = needle.toLowerCase();
  const normalizedHaystack = haystack.toLowerCase();

  if (!normalizedHaystack.includes(normalizedNeedle)) {
    return 0;
  }

  return normalizedHaystack === normalizedNeedle ? weight * 2 : weight;
};

const buildSessionSummary = (session: SessionRecord): string => {
  const title = session.title ? `${session.title} ` : "";
  const repoName = session.repoRoot ? path.basename(session.repoRoot) : "";

  return `${title}${session.appDisplayName || session.terminalProgram || "terminal"}${
    session.appDescription ? ` (${session.appDescription})` : ""
  } in ${session.cwd}${
    repoName ? ` for repo ${repoName}` : ""
  }${session.gitBranch ? ` on ${session.gitBranch}` : ""}${
    session.activeCommand
      ? ` currently running: ${session.activeCommand}`
      : session.lastCommand
        ? ` last used: ${session.lastCommand}`
        : ""
  }`;
};

const buildSearchBody = (session: SessionRecord): string => {
  return [
    session.sessionId,
    session.title,
    session.terminalProgram,
    session.appIdentifier,
    session.appDisplayName,
    session.appDescription,
    session.cwd,
    session.repoRoot,
    session.gitBranch,
    session.activeCommand,
    session.lastCommand,
    session.recentFiles.join(" "),
    session.contentPreview ?? ""
  ]
    .filter(Boolean)
    .join(" ");
};

export const rankAllSessions = (query: string, sessions: SessionRecord[]): SearchMatch[] => {
  const normalizedQuery = query.trim().toLowerCase();
  const queryTokens = expandQueryTerms(tokenize(normalizedQuery));

  const scored = sessions.map((session) => {
    const body = buildSearchBody(session);
    const repoName = session.repoRoot ? path.basename(session.repoRoot) : "";
    const appText = [
      session.appDisplayName,
      session.appDescription,
      session.appIdentifier,
      session.title
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    let score = scoreText(normalizedQuery, body, 14);

    for (const token of queryTokens) {
      score += scoreText(token, session.cwd, 10);
      score += scoreText(token, repoName, 10);
      score += scoreText(token, session.appDisplayName, 10);
      score += scoreText(token, session.appDescription, 9);
      score += scoreText(token, session.appIdentifier, 8);
      score += scoreText(token, session.gitBranch, 8);
      score += scoreText(token, session.activeCommand, 11);
      score += scoreText(token, session.lastCommand, 8);
      score += scoreText(token, session.recentFiles.join(" "), 9);
      score += scoreText(token, session.contentPreview ?? "", 8);
      score += scoreText(token, session.title, 6);
      score += scoreText(token, body, 4);
    }

    if (queryTokens.includes("3d") && /\b(3d|3-d|printer|printing|slicer|cad|mesh|model)\b/.test(appText)) {
      score += 24;
    }

    if (score === 0) {
      const currentCommand = (session.activeCommand || session.lastCommand).toLowerCase();
      if (normalizedQuery.includes("server") && /(dev|serve|start|node|pnpm|npm run)/.test(currentCommand)) {
        score += 6;
      }

      if (normalizedQuery.includes("test") && /(test|vitest|jest|playwright)/.test(currentCommand)) {
        score += 6;
      }
    }

    return {
      sessionId: session.sessionId,
      score,
      summary: buildSessionSummary(session),
      excerpt: body
    };
  });

  return scored.sort((left, right) => right.score - left.score);
};

export const rankSessions = (query: string, sessions: SessionRecord[]): SearchMatch[] =>
  rankAllSessions(query, sessions)
    .filter((match) => match.score > 0)
    .slice(0, 6);
