import OpenAI from "openai";

import type { SearchMatch, SessionRecord } from "./types.js";
import { rankAllSessions } from "./search.js";

let client: OpenAI | null = null;

const getClient = (): OpenAI | null => {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
};

export const isAiEnabled = (): boolean => Boolean(process.env.OPENAI_API_KEY);

const formatPromptField = (label: string, value: string | number | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = typeof value === "string" ? value.trim() : String(value);
  if (!normalized) {
    return null;
  }

  return `${label}=${normalized}`;
};

const formatSessionForPrompt = (
  session: SessionRecord,
  index: number,
  rankedMatch: SearchMatch | undefined
): string => {
  const lines = [
    `${index + 1}. session_id=${session.sessionId}`,
    `local_score=${rankedMatch?.score ?? 0}`,
    formatPromptField("title", session.title),
    formatPromptField("status", session.status),
    formatPromptField("app_name", session.appDisplayName || session.terminalProgram),
    formatPromptField("app_identifier", session.appIdentifier),
    formatPromptField("app_description", session.appDescription),
    formatPromptField("cwd", session.cwd),
    formatPromptField("repo_root", session.repoRoot),
    formatPromptField("git_branch", session.gitBranch),
    formatPromptField("last_command", session.lastCommand),
    formatPromptField("recent_files", session.recentFiles.join(", ")),
    formatPromptField("content_preview", session.contentPreview),
    formatPromptField("shell", session.shell),
    formatPromptField("hostname", session.hostname),
    formatPromptField("pid", session.pid)
  ].filter((line): line is string => Boolean(line));

  if (session.terminalProgram.toLowerCase().includes("ghostty")) {
    lines.push("terminal_hint=Ghostty window. Treat content_preview, cwd, repo_root, git_branch, and last_command as strong signals.");
  } else if (session.contentPreview) {
    lines.push("terminal_hint=Terminal content preview is available and should be used as a strong signal.");
  }

  return lines.join("\n");
};

export const buildWindowSearchPrompt = (
  query: string,
  sessions: SessionRecord[],
  rankedMatches?: SearchMatch[]
): string => {
  const ranked = rankedMatches ?? rankAllSessions(query, sessions);
  const rankedMap = new Map(ranked.map((match) => [match.sessionId, match]));
  const orderedSessions = [...sessions].sort((left, right) => {
    const leftScore = rankedMap.get(left.sessionId)?.score ?? 0;
    const rightScore = rankedMap.get(right.sessionId)?.score ?? 0;

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return right.lastSeenAt - left.lastSeenAt;
  });

  return `
You help a developer find the right terminal window from local session metadata.
You must choose from the available windows only.
Pick the strongest match first and keep the reply concise.
When the query names a specific app, title, repo, command, or file, prefer exact metadata matches.
For Ghostty and other terminal windows, pay special attention to cwd, repo_root, git_branch, last_command, recent_files, and content_preview.
Use session ids exactly as written.

User query:
${query}

Top local heuristic matches:
${ranked.length > 0
    ? ranked
        .slice(0, 6)
        .map(
          (match, index) =>
            `${index + 1}. session_id=${match.sessionId}\nlocal_score=${match.score}\nsummary=${match.summary}\ncontext=${match.excerpt}`
        )
        .join("\n\n")
    : "No locally ranked matches."}

All available windows (${orderedSessions.length} total):
${orderedSessions
    .map((session, index) => formatSessionForPrompt(session, index, rankedMap.get(session.sessionId)))
    .join("\n\n")}

Answer in at most 3 short sentences.
Mention the best session id in the first sentence.
Only mention a runner-up if it is genuinely useful.
`.trim();
};

export const explainWindowMatches = async (
  query: string,
  sessions: SessionRecord[],
  matches: SearchMatch[]
): Promise<{ answer: string | null; prompt: string | null }> => {
  const sdk = getClient();
  const prompt = sessions.length > 0 ? buildWindowSearchPrompt(query, sessions, matches) : null;

  if (!sdk || !prompt) {
    return { answer: null, prompt };
  }

  console.info(`[ai-search] query=${query}`);
  console.info(`[ai-search] prompt\n${prompt}`);

  const response = await sdk.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
    input: prompt
  });

  return {
    answer: response.output_text?.trim() || null,
    prompt
  };
};
