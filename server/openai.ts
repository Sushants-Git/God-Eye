import OpenAI from "openai";

import type { SearchMatch } from "./types.js";

let client: OpenAI | null = null;

const getClient = (): OpenAI | null => {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
};

export const isAiEnabled = (): boolean => Boolean(process.env.OPENAI_API_KEY);

export const explainWindowMatches = async (
  query: string,
  matches: SearchMatch[]
): Promise<string | null> => {
  const sdk = getClient();

  if (!sdk || matches.length === 0) {
    return null;
  }

  const prompt = `
You help a developer find the right terminal window from local session metadata.
Pick the strongest match first and keep the reply concise.
Use session ids exactly as written.

User query:
${query}

Candidate windows:
${matches
  .map(
    (match, index) =>
      `${index + 1}. session_id=${match.sessionId}\nsummary=${match.summary}\ncontext=${match.excerpt}`
  )
  .join("\n\n")}

Answer in at most 3 short sentences.
Mention the best session id in the first sentence.
Only mention a runner-up if it is genuinely useful.
`.trim();

  console.info(`[ai-search] query=${query}`);
  console.info(`[ai-search] prompt\n${prompt}`);

  const response = await sdk.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
    input: prompt
  });

  return response.output_text?.trim() || null;
};
