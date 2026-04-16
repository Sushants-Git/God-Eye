import { startTransition, useDeferredValue, useEffect, useState } from "react";

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
  session.title || `${session.terminalProgram || "terminal"} ${session.sessionId}`;

const SessionCard = ({
  session,
  active,
  onSelect
}: {
  session: SessionRecord;
  active: boolean;
  onSelect: (sessionId: string) => void;
}) => (
  <button
    className={`session-card${active ? " session-card-active" : ""}`}
    onClick={() => onSelect(session.sessionId)}
    type="button"
  >
    <div className="session-card-head">
      <div>
        <p className="eyebrow">{session.status === "running" ? "Running" : "Idle"}</p>
        <h3>{sessionLabel(session)}</h3>
      </div>
      <span className="score-pill">{relativeTime(session.lastSeenAt)}</span>
    </div>
    <p className="session-path">{session.cwd}</p>
    <p className="session-command">{session.lastCommand || "No command captured yet"}</p>
    <div className="session-meta-row">
      <span>{session.gitBranch || "no branch"}</span>
      <span>{session.commandCount} cmds</span>
      <span>{session.recentFiles.length} files</span>
    </div>
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
  <article className="timeline-item">
    <div className="timeline-meta">
      <span>{event.eventType.replaceAll("_", " ")}</span>
      <span>{relativeTime(event.createdAt)}</span>
    </div>
    <p>{event.command || event.summary}</p>
    <code>{event.cwd}</code>
    {event.files.length > 0 ? <small>{event.files.join(" • ")}</small> : null}
  </article>
);

const SourceCard = ({ source }: { source: SourceInfo }) => (
  <article className={`source-card${source.healthy ? "" : " source-card-warning"}`}>
    <div className="details-section-head">
      <div>
        <p className="eyebrow">Data source</p>
        <h3>
          {source.mode === "upstream"
            ? "Upstream server"
            : source.mode === "macos-windows"
              ? "macOS window poller"
              : "Local SQLite cache"}
        </h3>
      </div>
      <span className={`status-dot status-${source.healthy ? "running" : "idle"}`}>
        {source.healthy ? "healthy" : "degraded"}
      </span>
    </div>
    <p className="source-copy">{source.description}</p>
    <div className="source-grid">
      <div>
        <span>Upstream state URL</span>
        <strong>{source.upstreamStateUrl || "not configured"}</strong>
      </div>
      <div>
        <span>Local DB path</span>
        <strong>{source.databasePath}</strong>
      </div>
      <div>
        <span>Local cached sessions</span>
        <strong>{source.localSessionCount}</strong>
      </div>
      <div>
        <span>Local cached events</span>
        <strong>{source.localEventCount}</strong>
      </div>
    </div>
    {source.lastError ? <p className="source-error">{source.lastError}</p> : null}
  </article>
);

export default function App() {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [filterQuery, setFilterQuery] = useState("");
  const [aiQuery, setAiQuery] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [error, setError] = useState("");
  const deferredFilterQuery = useDeferredValue(filterQuery);

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

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Terminal Scout</p>
          <h1>See every terminal as a task, not a tab.</h1>
          <p className="hero-text">
            Track live sessions, group them by repo, inspect recent file activity, and jump to the
            most likely window with a prompt instead of scanning a wall of terminals.
          </p>
        </div>
        <div className="hero-stats">
          <div className="stat-card">
            <span>Total windows</span>
            <strong>{snapshot?.stats.totalSessions ?? 0}</strong>
          </div>
          <div className="stat-card">
            <span>Running now</span>
            <strong>{snapshot?.stats.runningSessions ?? 0}</strong>
          </div>
          <div className="stat-card">
            <span>Repos active</span>
            <strong>{snapshot?.stats.repos ?? 0}</strong>
          </div>
        </div>
      </section>

      <section className="search-strip">
        <form className="ai-panel" onSubmit={handleAiSearch}>
          <label className="panel-label" htmlFor="ai-search">
            Ask for a window
          </label>
          <div className="panel-row">
            <input
              id="ai-search"
              onChange={(event) => setAiQuery(event.target.value)}
              placeholder='Try "the frontend server for the vee repo" or "the window editing README"'
              value={aiQuery}
            />
            <button type="submit">{loadingAi ? "Searching..." : "Find window"}</button>
          </div>
          <p className="panel-note">
            {snapshot?.aiEnabled
              ? "AI ranking is enabled with OpenAI."
              : "OpenAI is not configured, so prompt search falls back to local ranking."}
          </p>
          {aiAnswer ? <p className="ai-answer">{aiAnswer}</p> : null}
          <CandidateList matches={matches} onSelect={setSelectedSessionId} />
        </form>

        <div className="filter-panel">
          <label className="panel-label" htmlFor="session-filter">
            Filter locally
          </label>
          <input
            id="session-filter"
            onChange={(event) => setFilterQuery(event.target.value)}
            placeholder="repo, branch, command, file"
            value={filterQuery}
          />
          <p className="panel-note">
            Fast local filtering stays responsive while live updates stream in.
          </p>
        </div>
      </section>

      {snapshot?.source ? <SourceCard source={snapshot.source} /> : null}

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="workspace">
        <aside className="session-list">
          {filteredSessions.length === 0 ? (
            <div className="empty-state">
              {snapshot?.source.mode === "upstream"
                ? "The configured upstream source returned no sessions. Check the source card for the URL and any fetch error."
                : snapshot?.source.mode === "macos-windows"
                  ? "The macOS window poller is active but no visible windows were captured. Check Accessibility permissions and the source card for any collector error."
                : "No sessions are in the local cache yet. That cache is only populated by POST /api/ingest or the zsh hook."}
            </div>
          ) : (
            filteredSessions.map((session) => (
              <SessionCard
                active={session.sessionId === selectedSessionId}
                key={session.sessionId}
                onSelect={setSelectedSessionId}
                session={session}
              />
            ))
          )}
        </aside>

        <section className="details-panel">
          {activeSession ? (
            <>
              <header className="details-header">
                <div>
                  <p className="eyebrow">Selected window</p>
                  <h2>{sessionLabel(activeSession)}</h2>
                </div>
                <span className={`status-dot status-${activeSession.status}`}>
                  {activeSession.status}
                </span>
              </header>

              <div className="details-grid">
                <article className="detail-card">
                  <span>Current directory</span>
                  <strong>{activeSession.cwd}</strong>
                </article>
                <article className="detail-card">
                  <span>Repo + branch</span>
                  <strong>
                    {activeSession.repoRoot || "no repo"} {activeSession.gitBranch || ""}
                  </strong>
                </article>
                <article className="detail-card">
                  <span>Last command</span>
                  <strong>{activeSession.lastCommand || "No command yet"}</strong>
                </article>
                <article className="detail-card">
                  <span>Shell identity</span>
                  <strong>
                    {activeSession.terminalProgram || "terminal"} {activeSession.tty || ""}
                  </strong>
                </article>
              </div>

              <section className="detail-card">
                <div className="details-section-head">
                  <h3>Recent files</h3>
                  <span>{activeSession.recentFiles.length}</span>
                </div>
                {activeSession.recentFiles.length > 0 ? (
                  <div className="file-list">
                    {activeSession.recentFiles.map((filePath) => (
                      <code key={filePath}>{filePath}</code>
                    ))}
                  </div>
                ) : (
                  <p className="muted-copy">File hints appear as you run editors and file commands.</p>
                )}
              </section>

              <section className="timeline">
                <div className="details-section-head">
                  <h3>Activity timeline</h3>
                  <span>{events.length} events</span>
                </div>
                {events.length > 0 ? (
                  events.map((event) => <TimelineItem event={event} key={event.id} />)
                ) : (
                  <div className="empty-state">No timeline entries yet.</div>
                )}
              </section>
            </>
          ) : (
            <div className="empty-state">
              {snapshot?.source.mode === "upstream"
                ? "No sessions are available from the configured upstream source yet."
                : snapshot?.source.mode === "macos-windows"
                  ? "No macOS windows have been captured yet. The collector only stores visible window metadata."
                : "Open a terminal and source the tracking script, or configure an upstream local server as the primary source."}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
