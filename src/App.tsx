import { startTransition, useDeferredValue, useEffect, useState } from "react";

import { AppLogo } from "./logo-library";
import type { EventRecord, SearchMatch, SessionRecord, SourceInfo, StateSnapshot } from "./types";

const apiFetch = async <T,>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const response = await fetch(input, {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const relativeTime = (timestamp: number): string => {
  const deltaSeconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (Math.abs(deltaSeconds) < 60) {
    return formatter.format(deltaSeconds, "second");
  }

  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (Math.abs(deltaMinutes) < 60) {
    return formatter.format(deltaMinutes, "minute");
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) {
    return formatter.format(deltaHours, "hour");
  }

  return formatter.format(Math.round(deltaHours / 24), "day");
};

const sessionLabel = (session: SessionRecord): string =>
  session.title || `${session.appDisplayName || session.terminalProgram || "window"} ${session.sessionId}`;

const sessionDescriptor = (session: SessionRecord): string =>
  [
    session.appDescription,
    session.cwd || session.repoRoot,
    session.gitBranch
  ]
    .filter(Boolean)
    .join(" · ") || "Window metadata only";

const statusTone = (status: SessionRecord["status"]): string =>
  status === "running" ? "status-running" : "status-idle";

const SidebarSessionItem = ({
  session,
  active,
  onSelect
}: {
  session: SessionRecord;
  active: boolean;
  onSelect: (sessionId: string) => void;
}) => (
  <button
    className={`sidebar-session${active ? " sidebar-session-active" : ""}`}
    onClick={() => onSelect(session.sessionId)}
    type="button"
  >
    <AppLogo
      appDisplayName={session.appDisplayName}
      appIdentifier={session.appIdentifier}
      size="sm"
      title={session.title}
    />
    <span className="sidebar-session-copy">
      <strong>{sessionLabel(session)}</strong>
      <small>{sessionDescriptor(session)}</small>
    </span>
    <span className="sidebar-session-time">{relativeTime(session.lastSeenAt)}</span>
  </button>
);

const CandidateList = ({
  matches,
  onSelect
}: {
  matches: SearchMatch[];
  onSelect: (sessionId: string) => void;
}) => {
  if (matches.length === 0) {
    return null;
  }

  return (
    <div className="candidate-list">
      {matches.map((match) => (
        <button
          className="candidate-chip"
          key={match.sessionId}
          onClick={() => onSelect(match.sessionId)}
          type="button"
        >
          <strong>{match.sessionId}</strong>
          <span>{match.summary}</span>
        </button>
      ))}
    </div>
  );
};

const TimelineItem = ({ event }: { event: EventRecord }) => (
  <article className="timeline-card">
    <div className="timeline-head">
      <span>{event.eventType.replaceAll("_", " ")}</span>
      <span>{relativeTime(event.createdAt)}</span>
    </div>
    <p>{event.command || event.summary}</p>
    {event.cwd ? <code>{event.cwd}</code> : null}
    {event.files.length > 0 ? <small>{event.files.join(" • ")}</small> : null}
  </article>
);

const SourceCard = ({ source }: { source: SourceInfo }) => (
  <section className={`thread-card${source.healthy ? "" : " thread-card-warning"}`}>
    <div className="thread-head">
      <div>
        <p className="kicker">Data source</p>
        <h2>
          {source.mode === "upstream"
            ? "Upstream server"
            : source.mode === "macos-windows"
              ? "macOS window poller"
              : "Local SQLite cache"}
        </h2>
      </div>
      <span className={`pill ${source.healthy ? "pill-good" : "pill-muted"}`}>
        {source.healthy ? "healthy" : "degraded"}
      </span>
    </div>
    <p className="muted-copy">{source.description}</p>
    <div className="meta-grid">
      <article className="meta-card">
        <span>Upstream state URL</span>
        <strong>{source.upstreamStateUrl || "not configured"}</strong>
      </article>
      <article className="meta-card">
        <span>Local DB path</span>
        <strong>{source.databasePath}</strong>
      </article>
      <article className="meta-card">
        <span>Local cached sessions</span>
        <strong>{source.localSessionCount}</strong>
      </article>
      <article className="meta-card">
        <span>Local cached events</span>
        <strong>{source.localEventCount}</strong>
      </article>
    </div>
    {source.lastError ? <p className="error-copy">{source.lastError}</p> : null}
  </section>
);

export default function App() {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [filterQuery, setFilterQuery] = useState("");
  const [aiQuery, setAiQuery] = useState("");
  const [lastSubmittedQuery, setLastSubmittedQuery] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [error, setError] = useState("");
  const deferredFilterQuery = useDeferredValue(filterQuery);
  const hasAiQuery = aiQuery.trim().length > 0;

  const refreshState = async (): Promise<void> => {
    const nextSnapshot = await apiFetch<StateSnapshot>("/api/state");
    setSnapshot(nextSnapshot);
    setSelectedSessionId((current) => current || nextSnapshot.sessions[0]?.sessionId || "");
  };

  useEffect(() => {
    refreshState().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "Failed to load state")
    );
  }, []);

  useEffect(() => {
    if (!selectedSessionId) {
      setEvents([]);
      return;
    }

    apiFetch<{ events: EventRecord[] }>(`/api/sessions/${selectedSessionId}`)
      .then((result) => setEvents(result.events))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Failed to load session"));
  }, [selectedSessionId]);

  useEffect(() => {
    let active = true;
    let reconnectTimer: number | undefined;
    let pollTimer: number | undefined;
    let socket: WebSocket | null = null;

    const clearTimers = () => {
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }

      if (pollTimer) {
        window.clearInterval(pollTimer);
      }
    };

    const startPolling = () => {
      if (pollTimer) {
        return;
      }

      pollTimer = window.setInterval(() => {
        refreshState().catch(() => {
          setError("Backend unavailable");
        });
      }, 5000);
    };

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

      socket.addEventListener("open", () => {
        setError("");
        if (pollTimer) {
          window.clearInterval(pollTimer);
          pollTimer = undefined;
        }
      });

      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type !== "state:update") {
            return;
          }

          const nextSnapshot = payload.data as StateSnapshot;
          startTransition(() => {
            setSnapshot(nextSnapshot);
            setSelectedSessionId((current) =>
              current && nextSnapshot.sessions.some((session) => session.sessionId === current)
                ? current
                : nextSnapshot.sessions[0]?.sessionId || ""
            );
          });
        } catch {
          setError("Received invalid websocket payload");
        }
      });

      socket.addEventListener("close", () => {
        if (!active) {
          return;
        }

        setError("Live updates disconnected, retrying...");
        startPolling();
        reconnectTimer = window.setTimeout(connect, 1500);
      });

      socket.addEventListener("error", () => {
        socket?.close();
      });
    };

    connect();

    return () => {
      active = false;
      clearTimers();
      socket?.close();
    };
  }, []);

  const sessions = snapshot?.sessions ?? [];
  const activeSession = sessions.find((session) => session.sessionId === selectedSessionId) ?? null;
  const normalizedFilter = deferredFilterQuery.trim().toLowerCase();
  const filteredSessions = normalizedFilter
    ? sessions.filter((session) =>
        [
          session.sessionId,
          session.title,
          session.terminalProgram,
          session.appIdentifier,
          session.appDisplayName,
          session.appDescription,
          session.cwd,
          session.repoRoot,
          session.gitBranch,
          session.lastCommand,
          session.recentFiles.join(" ")
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedFilter)
      )
    : sessions;

  const handleAiSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!aiQuery.trim()) {
      return;
    }

    setLoadingAi(true);
    setError("");
    setLastSubmittedQuery(aiQuery.trim());

    try {
      const result = await apiFetch<{ answer: string; matches: SearchMatch[] }>("/api/ai/search", {
        method: "POST",
        body: JSON.stringify({ query: aiQuery })
      });

      setAiAnswer(result.answer);
      setMatches(result.matches);
      if (result.matches[0]) {
        setSelectedSessionId(result.matches[0].sessionId);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI search failed");
    } finally {
      setLoadingAi(false);
    }
  };

  const emptySidebarCopy =
    snapshot?.source.mode === "upstream"
      ? "No windows came back from the upstream state route."
      : snapshot?.source.mode === "macos-windows"
        ? "The macOS collector is on, but no visible windows were captured yet."
        : "No local sessions have been ingested yet.";

  const emptyMainCopy =
    snapshot?.source.mode === "upstream"
      ? "No sessions are available from the configured upstream source yet."
      : snapshot?.source.mode === "macos-windows"
        ? "No macOS windows have been captured yet. The collector only stores visible window metadata."
        : "Open a terminal and source the tracking script, or configure an upstream local server as the primary source.";

  return (
    <main className="shell-layout">
      <aside className="sidebar">
        <div className="sidebar-inner">
          <section className="sidebar-overview">
            <header className="sidebar-header">
              <p className="sidebar-kicker">God Eye</p>
              <h1>Window map</h1>
              <p>Scan open contexts, pick the right one fast, and keep the noise under control.</p>
            </header>

            <div className="sidebar-stats">
              <article className="sidebar-stat">
                <span>Total</span>
                <strong>{snapshot?.stats.totalSessions ?? 0}</strong>
              </article>
              <article className="sidebar-stat">
                <span>Running</span>
                <strong>{snapshot?.stats.runningSessions ?? 0}</strong>
              </article>
              <article className="sidebar-stat">
                <span>Repos</span>
                <strong>{snapshot?.stats.repos ?? 0}</strong>
              </article>
            </div>

            <div className="sidebar-filter">
              <label className="sidebar-label" htmlFor="session-filter">
                Filter windows
              </label>
              <input
                id="session-filter"
                onChange={(event) => setFilterQuery(event.target.value)}
                placeholder="repo, branch, app, file"
                value={filterQuery}
              />
            </div>
          </section>

          <div className="sidebar-section-head">
            <span>Tracked windows</span>
            <span>{filteredSessions.length}</span>
          </div>

          <div className="sidebar-list">
            {filteredSessions.length === 0 ? (
              <div className="sidebar-empty">{emptySidebarCopy}</div>
            ) : (
              filteredSessions.map((session) => (
                <SidebarSessionItem
                  active={session.sessionId === selectedSessionId}
                  key={session.sessionId}
                  onSelect={setSelectedSessionId}
                  session={session}
                />
              ))
            )}
          </div>
        </div>
      </aside>

      <section className="main-shell">
        <div className="main-scroll">
          <div className="thread-column">
            <section className="thread-intro">
              <p className="kicker">Overview</p>
              <h2>See every terminal or window as a live task context.</h2>
              <p>
                The layout is intentionally narrow and quiet so the important parts stand out:
                source health, the selected window, recent files, and the latest activity trail.
              </p>
            </section>

            {error ? <section className="thread-card error-card">{error}</section> : null}

            {lastSubmittedQuery ? (
              <section className="prompt-thread">
                <div className="prompt-bubble">
                  <p className="kicker">Prompt</p>
                  <p>{lastSubmittedQuery}</p>
                </div>
                <div className="assistant-response">
                  <p className="kicker">Search result</p>
                  <p className="assistant-response-copy">{aiAnswer || "Waiting for results"}</p>
                  <CandidateList matches={matches} onSelect={setSelectedSessionId} />
                </div>
              </section>
            ) : null}

            {snapshot?.source ? <SourceCard source={snapshot.source} /> : null}

            {activeSession ? (
              <>
                <section className="thread-card">
                  <div className="thread-head">
                    <div>
                      <p className="kicker">Selected window</p>
                      <div className="selected-window-title">
                        <AppLogo
                          appDisplayName={activeSession.appDisplayName}
                          appIdentifier={activeSession.appIdentifier}
                          size="lg"
                          title={activeSession.title}
                        />
                        <div>
                          <h2>{sessionLabel(activeSession)}</h2>
                          <p className="selected-window-copy">{activeSession.appDescription}</p>
                        </div>
                      </div>
                    </div>
                    <span className={`pill ${activeSession.status === "running" ? "pill-good" : "pill-muted"}`}>
                      {activeSession.status}
                    </span>
                  </div>

                  <div className="meta-grid">
                    <article className="meta-card">
                      <span>Application</span>
                      <strong>{activeSession.appDisplayName || "not available"}</strong>
                      <small>{activeSession.appIdentifier || "no app identifier"}</small>
                    </article>
                    <article className="meta-card">
                      <span>Current directory</span>
                      <strong>{activeSession.cwd || "not available"}</strong>
                    </article>
                    <article className="meta-card">
                      <span>Repo and branch</span>
                      <strong>
                        {activeSession.repoRoot || "no repo"}
                        {activeSession.gitBranch ? ` · ${activeSession.gitBranch}` : ""}
                      </strong>
                    </article>
                    <article className="meta-card">
                      <span>Last command</span>
                      <strong>{activeSession.lastCommand || "not available"}</strong>
                    </article>
                    <article className="meta-card">
                      <span>TTY and host</span>
                      <strong>
                        {activeSession.tty || "not available"}
                      </strong>
                      <small>
                        {activeSession.hostname || activeSession.terminalProgram || "window metadata only"}
                      </small>
                    </article>
                    <article className="meta-card">
                      <span>Session id</span>
                      <strong>{activeSession.sessionId}</strong>
                      <small>
                        {activeSession.status} · {activeSession.commandCount} commands
                      </small>
                    </article>
                  </div>
                </section>

                <section className="thread-card">
                  <div className="thread-head">
                    <div>
                      <p className="kicker">Recent files</p>
                      <h2>{activeSession.recentFiles.length} tracked paths</h2>
                    </div>
                    <span className="pill pill-muted">{activeSession.commandCount} commands</span>
                  </div>

                  {activeSession.recentFiles.length > 0 ? (
                    <div className="code-stack">
                      {activeSession.recentFiles.map((filePath) => (
                        <code className="code-chip" key={filePath}>
                          {filePath}
                        </code>
                      ))}
                    </div>
                  ) : (
                    <p className="muted-copy">
                      File hints appear when the source includes command-level or file-level detail.
                    </p>
                  )}
                </section>

                <section className="thread-card">
                  <div className="thread-head">
                    <div>
                      <p className="kicker">Activity</p>
                      <h2>Latest timeline</h2>
                    </div>
                    <span className="pill pill-muted">{events.length} events</span>
                  </div>

                  {events.length > 0 ? (
                    <div className="timeline-stack">
                      {events.map((event) => (
                        <TimelineItem event={event} key={event.id} />
                      ))}
                    </div>
                  ) : (
                    <p className="muted-copy">No timeline entries are available for this window yet.</p>
                  )}
                </section>
              </>
            ) : (
              <section className="thread-card empty-card">
                <p className="kicker">Empty state</p>
                <h2>No selected window</h2>
                <p>{emptyMainCopy}</p>
              </section>
            )}
          </div>
        </div>

        <form className="composer-shell" onSubmit={handleAiSearch}>
          <div className="composer-card">
            <label className="composer-label" htmlFor="ai-search">
              Ask for a window
            </label>
            <textarea
              id="ai-search"
              onChange={(event) => setAiQuery(event.target.value)}
              placeholder='Try "the frontend server", "the window editing README", or "the Ghostty tab with logs".'
              rows={2}
              value={aiQuery}
            />
            <div className="composer-toolbar">
              <p className="composer-note">
                {snapshot?.aiEnabled
                  ? "AI ranking is enabled."
                  : "AI is off, so prompt search falls back to local ranking."}
              </p>
              <button
                className={`send-button${hasAiQuery ? " send-button-ready" : ""}`}
                type="submit"
              >
                {loadingAi ? "..." : ">"}
              </button>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}
