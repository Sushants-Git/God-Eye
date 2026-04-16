import path from "node:path";

import type { SearchMatch, SessionRecord } from "./types.js";

const tokenize = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9._/-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

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

  return `${title}${session.terminalProgram || "terminal"} in ${session.cwd}${
    repoName ? ` for repo ${repoName}` : ""
  }${session.gitBranch ? ` on ${session.gitBranch}` : ""}${
    session.lastCommand ? ` running or last used: ${session.lastCommand}` : ""
  }`;
};

const buildSearchBody = (session: SessionRecord): string => {
  return [
    session.sessionId,
    session.title,
    session.terminalProgram,
    session.cwd,
    session.repoRoot,
    session.gitBranch,
    session.lastCommand,
    session.recentFiles.join(" ")
  ]
    .filter(Boolean)
    .join(" ");
};

export const rankSessions = (query: string, sessions: SessionRecord[]): SearchMatch[] => {
  const normalizedQuery = query.trim().toLowerCase();
  const queryTokens = tokenize(normalizedQuery);

  const scored = sessions.map((session) => {
    const body = buildSearchBody(session);
    const repoName = session.repoRoot ? path.basename(session.repoRoot) : "";
    let score = scoreText(normalizedQuery, body, 14);

    for (const token of queryTokens) {
      score += scoreText(token, session.cwd, 10);
      score += scoreText(token, repoName, 10);
      score += scoreText(token, session.gitBranch, 8);
      score += scoreText(token, session.lastCommand, 8);
      score += scoreText(token, session.recentFiles.join(" "), 9);
      score += scoreText(token, session.title, 6);
      score += scoreText(token, body, 4);
    }

    if (score === 0) {
      const lastCommand = session.lastCommand.toLowerCase();
      if (normalizedQuery.includes("server") && /(dev|serve|start|node|pnpm|npm run)/.test(lastCommand)) {
        score += 6;
      }

      if (normalizedQuery.includes("test") && /(test|vitest|jest|playwright)/.test(lastCommand)) {
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

  return scored
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);
};
