# God Eye

God Eye turns a pile of terminal and app windows into a live local task map.

It can run in three source modes:

- local ingest mode: capture shell activity from `zsh` and store it in SQLite
- upstream mode: fetch terminal/session state from an already-running local metadata server
- macOS window mode: poll visible macOS windows via `System Events` and sync app/window metadata into SQLite

Then it shows that state in a web UI with live updates, focus actions, and prompt-based search.

## What it tracks

In local ingest mode:

- terminal/session identity
- current working directory
- repo root and git branch
- last command
- currently running command while a shell command is active
- recent file-like paths inferred from commands
- activity timeline per terminal

In macOS window mode:

- application name and bundle identifier
- window title
- pid
- last seen timestamp
- Ghostty working directory when available
- Ghostty active terminal name when available
- terminal content preview when enabled

## Search

Search works in two layers:

- local ranking first, using app name, app description, title, cwd, repo, branch, active command, last command, recent files, and content preview
- optional OpenAI selection on top of the ranked windows

The UI includes a `See prompt` inspector after each search so you can see the exact prompt sent to the model.

Current search behavior:

- all available windows are included in the LLM prompt
- local heuristic scores are included as hints
- Ghostty and terminal windows include extra context such as `active_command`, `cwd`, `repo_root`, `git_branch`, and `content_preview` when available
- the model is instructed to return a single best match in a compact format

If no `OPENAI_API_KEY` is present, search still works using local ranking only.

## Stack

- React + Vite dashboard
- Express + WebSocket local service
- SQLite via `better-sqlite3`
- optional OpenAI-powered search using the Responses API and `gpt-5-mini`

OpenAI docs used for the integration:

- https://platform.openai.com/docs/libraries/javascript
- https://platform.openai.com/docs/models/gpt-5-mini
- https://platform.openai.com/docs/guides/migrate-to-responses

## Run It

```bash
npm install
npm run dev
```

The backend runs on `http://127.0.0.1:4321` and the Vite app runs on `http://127.0.0.1:5173`.

## Hook Your Shell

Add this to `~/.zshrc`:

```zsh
source /absolute/path/to/god-eye/shell/terminal-scout.zsh
```

Then reload your shell:

```bash
source ~/.zshrc
```

The shell hook posts:

- `shell_start`
- `command_start`
- `prompt`
- `cwd_change`

During `command_start`, the current command is sent as `activeCommand`. When the prompt returns, `activeCommand` is cleared.

## Enable AI Search

Export an OpenAI key before starting the server:

```bash
export OPENAI_API_KEY="your_key_here"
export OPENAI_MODEL="gpt-5-mini"
```

## Use an Existing Local Metadata Server

If you already have a local server that exposes session or window state, point God Eye at it:

```bash
export TERMINAL_SCOUT_UPSTREAM_STATE_URL="http://127.0.0.1:PORT/your/state/route"
export TERMINAL_SCOUT_UPSTREAM_SESSION_URL_TEMPLATE="http://127.0.0.1:PORT/your/session/route/{sessionId}"
export TERMINAL_SCOUT_UPSTREAM_POLL_MS=2000
```

Then restart the backend. In this mode:

- `GET /api/state` reads from the upstream server first
- `GET /api/source` shows which source is active and any fetch error
- SQLite becomes a fallback cache and ingest store instead of the default source of truth

## macOS Window Poller

On macOS, the server can keep the local store populated by polling visible windows directly from `System Events`.

```bash
export TERMINAL_SCOUT_MAC_WINDOWS=1
export TERMINAL_SCOUT_MAC_WINDOWS_POLL_MS=2000
```

Optional:

```bash
export TERMINAL_SCOUT_READ_CONTENT=1
```

Notes:

- the default macOS polling interval is `2000ms`
- `TERMINAL_SCOUT_READ_CONTENT=1` enables terminal content previews when the collector can read them
- Ghostty windows attempt to capture the focused terminal name and working directory through Ghostty's macOS scripting surface
- this mode requires Accessibility permission for the process running the server

## Configuration

- `PORT`: backend port, defaults to `4321`
- `TERMINAL_SCOUT_ENDPOINT`: shell hook target, defaults to `http://127.0.0.1:4321`
- `TERMINAL_SCOUT_DB_PATH`: override the SQLite path
- `OPENAI_API_KEY`: enables AI search
- `OPENAI_MODEL`: overrides the default model, `gpt-5-mini`
- `TERMINAL_SCOUT_UPSTREAM_STATE_URL`: enable upstream source mode
- `TERMINAL_SCOUT_UPSTREAM_SESSION_URL_TEMPLATE`: optional upstream session details route
- `TERMINAL_SCOUT_UPSTREAM_POLL_MS`: upstream polling interval, defaults to `2000`
- `TERMINAL_SCOUT_MAC_WINDOWS`: enable macOS window polling mode
- `TERMINAL_SCOUT_MAC_WINDOWS_POLL_MS`: macOS window polling interval, defaults to `2000`
- `TERMINAL_SCOUT_READ_CONTENT`: enable terminal content previews in macOS window mode

## Notes

- this version focuses on `zsh`
- file tracking is inferred from command text, so editor integrations can improve precision later
- macOS collector data is best-effort and depends on OS accessibility/scripting support
