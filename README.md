# Terminal Scout

Terminal Scout turns a pile of terminal windows into a live task map.

It can run in two source modes:

- local ingest mode: capture shell activity from `zsh` and store it in SQLite
- upstream mode: fetch terminal/session state from an already-running local metadata server
- macOS window mode: poll visible macOS windows via `System Events` and sync only window metadata into SQLite

Then it shows that state in a web UI and adds prompt-based search so you can ask for "the frontend server window" or "the session editing README".

## What it tracks

- Terminal/session identity
- Current working directory
- Repo root and git branch
- Last command
- Recent file-like paths inferred from commands
- Activity timeline per terminal

## Stack

- React + Vite dashboard
- Express + WebSocket local service
- SQLite via `better-sqlite3`
- Optional OpenAI-powered prompt search using the Responses API and `gpt-5-mini`

OpenAI docs used for the integration:
- https://platform.openai.com/docs/libraries/javascript
- https://platform.openai.com/docs/models/gpt-5-mini
- https://platform.openai.com/docs/guides/migrate-to-responses

## Run it

```bash
npm install
npm run dev
```

The backend runs on `http://127.0.0.1:4321` and the Vite app runs on `http://127.0.0.1:5173`.

## Hook your shell

Add this to `~/.zshrc`:

```zsh
source /Users/vee/God-Eye/shell/terminal-scout.zsh
```

Then reload your shell:

```bash
source ~/.zshrc
```

## Enable AI search

Export an OpenAI key before starting the server:

```bash
export OPENAI_API_KEY="your_key_here"
export OPENAI_MODEL="gpt-5-mini"
```

If no API key is present, the prompt search still works using local ranking heuristics.

## Use an existing local metadata server

If you already have a local server that exposes session or window state, point Terminal Scout at it:

```bash
export TERMINAL_SCOUT_UPSTREAM_STATE_URL="http://127.0.0.1:PORT/your/state/route"
export TERMINAL_SCOUT_UPSTREAM_SESSION_URL_TEMPLATE="http://127.0.0.1:PORT/your/session/route/{sessionId}"
```

Then restart the backend. In this mode:

- `GET /api/state` reads from the upstream server first
- `GET /api/source` shows which source is active and any fetch error
- SQLite becomes a fallback cache and ingest store instead of the default source of truth

## macOS window poller

On macOS, the server can keep the local store populated by polling visible windows directly from `System Events`.

```bash
export TERMINAL_SCOUT_MAC_WINDOWS=1
export TERMINAL_SCOUT_MAC_WINDOWS_POLL_MS=2000
```

This collector stores only window metadata:

- application name
- window title
- pid
- last seen timestamp

It does not collect cwd, shell, repo, branch, commands, or files.

This requires Accessibility permission for the process running the server.

## MVP notes

- This version focuses on `zsh`.
- File tracking is inferred from command text, so editor integrations can improve precision later.
- Jumping back into a terminal window is not wired yet. The next step is terminal-specific adapters for iTerm, Kitty, Warp, or Ghostty.
