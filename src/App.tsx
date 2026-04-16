import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  FolderOpen,
  GitBranch,
  Layers,
  Search,
  SendHorizonal,
  Terminal,
  X,
  Zap,
} from "lucide-react";

import { AppLogo } from "./logo-library";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  EventRecord,
  SearchMatch,
  SearchResponse,
  SessionRecord,
  SourceInfo,
  StateSnapshot,
} from "./types";

/* ── helpers ──────────────────────────────────────────────── */

const apiFetch = async <T,>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const res = await fetch(input, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
};

const relativeTime = (ts: number): string => {
  const delta = Math.round((ts - Date.now()) / 1000);
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(delta) < 60) return fmt.format(delta, "second");
  const m = Math.round(delta / 60);
  if (Math.abs(m) < 60) return fmt.format(m, "minute");
  const h = Math.round(m / 60);
  if (Math.abs(h) < 24) return fmt.format(h, "hour");
  return fmt.format(Math.round(h / 24), "day");
};

const sessionLabel = (s: SessionRecord) =>
  s.title || s.appDisplayName || s.terminalProgram || s.sessionId.slice(-8);

const shortPath = (p: string) => {
  if (!p) return "";
  const parts = p.split("/").filter(Boolean);
  return parts.length <= 2 ? p : `…/${parts.slice(-2).join("/")}`;
};

const EASE_OUT_CUBIC = [0.215, 0.61, 0.355, 1] as const;
const EASE_OUT_QUART = [0.165, 0.84, 0.44, 1] as const;

const focusWindow = (sessionId: string) =>
  apiFetch("/api/windows/focus", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  }).catch(() => {});

/* ── StatusDot ────────────────────────────────────────────── */
function StatusDot({ status }: { status: SessionRecord["status"] }) {
  if (status === "running")
    return <span className="w-2 h-2 rounded-full flex-none shrink-0 bg-[var(--brand)] status-dot-running mt-0.5" />;
  if (status === "minimized")
    return <span className="w-2 h-2 rounded-full flex-none shrink-0 bg-[rgba(160,120,190,0.35)] mt-0.5" />;
  return <span className="w-2 h-2 rounded-full flex-none shrink-0 bg-[rgba(160,120,190,0.2)] mt-0.5" />;
}

/* ── WindowCard ───────────────────────────────────────────── */
function WindowCard({
  session,
  active,
  onSelect,
  index,
}: {
  session: SessionRecord;
  active: boolean;
  onSelect: (id: string) => void;
  index: number;
}) {
  const prefersReduced = useReducedMotion();
  const isMinimized = session.status === "minimized";
  const isRunning = session.status === "running";

  const stagger = Math.min(index * 0.03, 0.4);

  return (
    <motion.button
      initial={prefersReduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: isMinimized ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{
        opacity: { delay: stagger, duration: 0.18, ease: EASE_OUT_CUBIC },
        y: { delay: stagger, duration: 0.2, ease: EASE_OUT_CUBIC },
      }}
      whileHover={prefersReduced ? {} : { y: -2 }}
      whileTap={prefersReduced ? {} : { scale: 0.985 }}
      onClick={() => onSelect(session.sessionId)}
      type="button"
      style={{
        willChange: "transform",
        background: "#ffffff",
      }}
      className={cn(
        "group text-left w-full rounded-xl p-3.5 border flex flex-col gap-2 cursor-pointer",
        "transition-[border-color,box-shadow] duration-150",
        active && "border-[var(--brand)] shadow-[0_0_0_3px_rgba(162,59,103,0.1),0_2px_12px_rgba(162,59,103,0.1)]",
        !active && isRunning && "border-[rgba(162,59,103,0.4)] shadow-[0_1px_6px_rgba(162,59,103,0.08)]",
        !active && isMinimized && "border-[rgba(160,120,190,0.15)]",
        !active && !isRunning && !isMinimized && [
          "border-[rgba(160,120,190,0.18)]",
          "hover:border-[rgba(162,59,103,0.28)]",
          "shadow-[0_1px_3px_rgba(91,59,103,0.06)]",
          "hover:shadow-[0_4px_16px_rgba(91,59,103,0.1)]",
        ]
      )}
    >
      {/* Header row — logo + name + status dot */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <AppLogo
            appDisplayName={session.appDisplayName}
            appIdentifier={session.appIdentifier}
            size="sm"
            title={session.title}
          />
          <div className="min-w-0">
            <p className={cn(
              "text-[13px] font-semibold leading-tight truncate",
              active ? "text-[var(--brand)]" : "text-[var(--ink)]"
            )}>
              {sessionLabel(session)}
            </p>
            {session.appDisplayName && session.title && session.title !== session.appDisplayName && (
              <p className="text-[11px] text-[var(--ink-muted)] leading-snug truncate mt-px">
                {session.appDisplayName}
              </p>
            )}
          </div>
        </div>
        <StatusDot status={session.status} />
      </div>

      {/* CWD */}
      {session.cwd && (
        <div className="flex items-center gap-1.5 min-w-0">
          <FolderOpen size={10} className="text-[var(--ink-muted)] flex-none shrink-0" />
          <code className="text-[10px] font-mono text-[var(--ink-muted)] truncate">{shortPath(session.cwd)}</code>
        </div>
      )}

      {/* Branch */}
      {session.gitBranch && (
        <div className="flex items-center gap-1.5">
          <GitBranch size={10} className="text-[var(--brand)] flex-none shrink-0" />
          <span className="text-[10px] bg-[rgba(162,59,103,0.09)] text-[var(--brand)] rounded px-1.5 py-0.5 font-medium">
            {session.gitBranch}
          </span>
        </div>
      )}

      {/* Last command */}
      {session.lastCommand && (
        <code className="block text-[10px] font-mono bg-[#f5edfa] text-[#7a4a7a] rounded-md px-2.5 py-1.5 truncate">
          {session.lastCommand}
        </code>
      )}

      {/* Footer — only non-zero counts */}
      <div className="flex items-center justify-between gap-2 mt-auto">
        <div className="flex items-center gap-1">
          {session.recentFiles.length > 0 && (
            <Badge variant="outline" className="text-[9px] gap-0.5 py-0.5 px-1.5">
              <FileText size={8} />
              {session.recentFiles.length}
            </Badge>
          )}
          {session.commandCount > 0 && (
            <Badge variant="outline" className="text-[9px] gap-0.5 py-0.5 px-1.5">
              <Terminal size={8} />
              {session.commandCount}
            </Badge>
          )}
          {isMinimized && (
            <Badge variant="muted" className="text-[9px]">minimized</Badge>
          )}
        </div>
        <span className="text-[9px] text-[var(--ink-muted)] flex items-center gap-0.5 shrink-0">
          <Clock size={8} />
          {relativeTime(session.lastSeenAt)}
        </span>
      </div>
    </motion.button>
  );
}

/* ── DetailPanel ──────────────────────────────────────────── */
function DetailPanel({
  session,
  events,
  onClose,
}: {
  session: SessionRecord;
  events: EventRecord[];
  onClose: () => void;
}) {
  const [focusing, setFocusing] = useState(false);

  const handleFocus = async () => {
    setFocusing(true);
    try {
      await apiFetch("/api/windows/focus", {
        method: "POST",
        body: JSON.stringify({ sessionId: session.sessionId }),
      });
    } finally {
      setFocusing(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 border-b border-[var(--border)] flex-none"
        style={{ background: "rgba(255,255,255,0.7)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <AppLogo
            appDisplayName={session.appDisplayName}
            appIdentifier={session.appIdentifier}
            size="lg"
            title={session.title}
          />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-[var(--ink)] leading-tight truncate">
              {sessionLabel(session)}
            </h2>
            {session.appDescription &&
              !session.appDescription.includes("captured by Terminal Scout") && (
                <p className="text-[11px] text-[var(--ink-muted)] mt-0.5 line-clamp-2">
                  {session.appDescription}
                </p>
              )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-none mt-0.5">
          <Badge variant={session.status === "running" ? "running" : "muted"} className="text-[10px]">
            {session.status === "running" && (
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] status-dot-running inline-block" />
            )}
            {session.status}
          </Badge>
          <Button
            variant="outline" size="sm"
            onClick={handleFocus}
            disabled={focusing}
            className="text-[10px] h-6 px-2 gap-1"
          >
            <ExternalLink size={10} />
            {focusing ? "…" : "Focus"}
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X size={14} />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          {session.cwd && (
            <MetaCell label="Directory" span2>
              <code className="text-[11px] font-mono break-all leading-relaxed">{session.cwd}</code>
            </MetaCell>
          )}
          {(session.repoRoot || session.gitBranch) && (
            <MetaCell label="Repo & branch">
              <span className="text-xs font-medium">{session.repoRoot ? shortPath(session.repoRoot) : "—"}</span>
              {session.gitBranch && (
                <Badge variant="brand" className="mt-1 self-start text-[10px]">
                  <GitBranch size={8} />{session.gitBranch}
                </Badge>
              )}
            </MetaCell>
          )}
          {session.lastCommand && (
            <MetaCell label="Last command" span2>
              <code className="text-[11px] font-mono text-[#7a4a7a] break-all leading-relaxed">
                {session.lastCommand}
              </code>
            </MetaCell>
          )}
          <MetaCell label="App">
            <span className="text-xs font-medium">{session.appDisplayName || session.terminalProgram || "—"}</span>
            {session.appIdentifier && (
              <code className="text-[9px] font-mono text-[var(--ink-muted)] mt-0.5 truncate block">
                {session.appIdentifier}
              </code>
            )}
          </MetaCell>
          <MetaCell label="Session">
            <code className="text-[9px] font-mono text-[var(--ink-muted)] break-all leading-relaxed">
              {session.sessionId.replace("mac-window:", "")}
            </code>
            {session.commandCount > 0 && (
              <span className="text-[10px] text-[var(--ink-muted)] mt-0.5">{session.commandCount} cmds</span>
            )}
          </MetaCell>
        </div>

        {/* Terminal content preview */}
        {session.contentPreview && (
          <div>
            <SectionHead icon={<Terminal size={11} />} label="Terminal content" />
            <code className="mt-2 block text-[10px] font-mono bg-white border border-[var(--border)] rounded-lg px-3 py-2.5 text-[var(--ink-muted)] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
              {session.contentPreview}
            </code>
          </div>
        )}

        {/* Recent files */}
        {session.recentFiles.length > 0 && (
          <div>
            <SectionHead icon={<FileText size={11} />} label="Recent files" count={session.recentFiles.length} />
            <div className="flex flex-col gap-1 mt-2">
              {session.recentFiles.map((f) => (
                <code key={f}
                  className="text-[10px] font-mono px-2.5 py-1.5 rounded-md bg-white border border-[var(--border)] text-[#7a4a7a] truncate block">
                  {f}
                </code>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div>
          <SectionHead icon={<Activity size={11} />} label="Activity" count={events.length} />
          {events.length > 0 ? (
            <div className="flex flex-col gap-1.5 mt-2">
              {events.map((ev) => <TimelineCard key={ev.id} event={ev} />)}
            </div>
          ) : (
            <p className="text-xs text-[var(--ink-muted)] mt-2">No events recorded.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaCell({ label, children, span2 }: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div className={cn(
      "flex flex-col gap-1 p-2.5 rounded-lg border border-[var(--border)] min-w-0",
      span2 && "col-span-2"
    )} style={{ background: "#ffffff" }}>
      <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--ink-muted)]">{label}</span>
      {children}
    </div>
  );
}

function SectionHead({ icon, label, count }: { icon: React.ReactNode; label: string; count?: number }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-[var(--ink-muted)]">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      {count !== undefined && <Badge variant="muted" className="text-[9px]">{count}</Badge>}
    </div>
  );
}

function TimelineCard({ event }: { event: EventRecord }) {
  return (
    <div className="rounded-lg border border-[var(--border)] p-2.5 flex flex-col gap-1"
      style={{ background: "#ffffff" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
          {event.eventType.replace(/_/g, " ")}
        </span>
        <span className="text-[9px] text-[var(--ink-muted)]">{relativeTime(event.createdAt)}</span>
      </div>
      {(event.command || event.summary) && (
        <p className="text-[11px] text-[var(--ink)] leading-snug">{event.command || event.summary}</p>
      )}
      {event.cwd && (
        <code className="text-[9px] font-mono text-[var(--ink-muted)] bg-[#f5edfa] rounded px-1.5 py-0.5">
          {event.cwd}
        </code>
      )}
    </div>
  );
}

/* ── SourceBadge ──────────────────────────────────────────── */
function SourceBadge({ source }: { source: SourceInfo }) {
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs",
      source.healthy ? "border-[var(--border)] bg-white" : "border-[rgba(162,59,103,0.3)] bg-[var(--brand-soft)]"
    )}>
      {source.healthy
        ? <CheckCircle2 size={11} className="text-emerald-500 flex-none" />
        : <AlertCircle size={11} className="text-[var(--brand)] flex-none" />}
      <span className="text-[var(--ink-muted)] truncate text-[11px]">
        {source.mode === "upstream" ? "Upstream" : source.mode === "macos-windows" ? "macOS windows" : "SQLite local"}
      </span>
      <Badge variant={source.healthy ? "muted" : "brand"} className="ml-auto text-[9px]">
        {source.healthy ? "live" : "degraded"}
      </Badge>
    </div>
  );
}

/* ── AiSearchBar ──────────────────────────────────────────── */
function AiSearchBar({
  aiEnabled,
  onResult,
  onError,
}: {
  aiEnabled: boolean;
  onResult: (query: string, result: SearchResponse) => void;
  onError: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const doSearch = async () => {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    try {
      const result = await apiFetch<SearchResponse>(
        "/api/ai/search",
        { method: "POST", body: JSON.stringify({ query: q }) }
      );
      onResult(q, result);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const ready = query.trim().length > 0;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-muted)]">
        Ask for a window
      </label>
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void doSearch();
            }
          }}
          placeholder={aiEnabled ? `"the frontend server"…` : "Describe the window…"}
          rows={2}
          className={cn(
            "w-full rounded-lg border border-[var(--border)]",
            "px-3 py-2 pr-10 text-[11px] text-[var(--ink)] placeholder:text-[var(--ink-muted)]",
            "resize-none font-sans leading-relaxed",
            "focus:outline-none focus:border-[rgba(162,59,103,0.5)] focus:ring-2 focus:ring-[rgba(162,59,103,0.1)]",
            "transition-all duration-150"
          )}
          style={{ background: "#ffffff" }}
        />
        <motion.button
          type="button"
          disabled={!ready || loading}
          onClick={() => void doSearch()}
          animate={ready ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          style={{ willChange: "transform" }}
          className="absolute right-2 bottom-2 w-6 h-6 rounded-md bg-[var(--brand)] text-white flex items-center justify-center disabled:pointer-events-none hover:bg-[var(--brand-hover)] transition-colors"
        >
          {loading
            ? <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
                className="w-3 h-3 border-[1.5px] border-white border-t-transparent rounded-full block"
              />
            : <SendHorizonal size={11} />}
        </motion.button>
      </div>
      <p className="text-[9px] text-[var(--ink-muted)]">
        {aiEnabled ? "AI · Enter to send" : "Local ranking · Enter to send"}
      </p>
    </div>
  );
}

/* ── SearchBanner ─────────────────────────────────────────── */
function SearchBanner({
  query, answer, matches, prompt, mode, onSelect, onDismiss,
}: {
  query: string; answer: string; matches: SearchMatch[];
  prompt: string | null; mode: SearchResponse["mode"];
  onSelect: (id: string) => void; onDismiss: () => void;
}) {
  const [showPrompt, setShowPrompt] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: EASE_OUT_CUBIC }}
      className="mb-4 rounded-xl border border-[var(--border)] p-4 flex flex-col gap-2.5 shadow-[0_2px_12px_rgba(91,59,103,0.07)]"
      style={{ background: "#ffffff" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--brand)] mb-1">
            Result for "{query}"
          </p>
          <p className="text-[13px] text-[var(--ink)] leading-relaxed">{answer}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-none mt-0.5">
          {prompt && (
            <button
              type="button"
              onClick={() => setShowPrompt((open) => !open)}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--ink-muted)] transition-colors hover:bg-[#f5edfa] hover:text-[var(--ink)]"
            >
              <FileText size={11} />
              {showPrompt ? "Hide prompt" : "See prompt"}
            </button>
          )}
          <Button variant="ghost" size="icon" onClick={onDismiss} className="flex-none">
            <X size={13} />
          </Button>
        </div>
      </div>
      {showPrompt && prompt && (
        <div className="rounded-lg border border-[var(--border)] bg-[#fcf8ff] p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-muted)]">
            {mode === "ai" ? "Prompt sent to the LLM" : "Prompt prepared for the LLM"}
          </p>
          <p className="text-[11px] leading-relaxed text-[var(--ink-muted)]">
            All available windows are included. Local ranking still runs first to provide ordering hints, and Ghostty or terminal windows include extra context like content previews when available.
          </p>
          <pre className="max-h-72 overflow-auto rounded-md border border-[var(--border)] bg-white p-3 text-[10px] leading-relaxed text-[var(--ink)] whitespace-pre-wrap break-words">
            {prompt}
          </pre>
        </div>
      )}
      {matches.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {matches.map((m) => (
            <button key={m.sessionId} type="button"
              onClick={() => onSelect(m.sessionId)}
              className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[#f5edfa] text-left text-[11px] transition-all duration-150 hover:bg-white hover:border-[rgba(162,59,103,0.3)] hover:-translate-y-0.5 active:scale-[0.98]"
              style={{ willChange: "transform" }}>
              <strong className="font-semibold text-[var(--ink)]">
                {m.sessionId.replace("mac-window:", "").split(":").slice(0, -1).join(":")}
              </strong>
              <span className="text-[var(--ink-muted)]">{m.summary.slice(0, 55)}</span>
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

/* ── App ──────────────────────────────────────────────────── */
export default function App() {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [filterQuery, setFilterQuery] = useState("");
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiMatches, setAiMatches] = useState<SearchMatch[]>([]);
  const [aiPrompt, setAiPrompt] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<SearchResponse["mode"]>("local");
  const deferredFilter = useDeferredValue(filterQuery);

  /* ── fetch state (no auto-select on first load) ── */
  const refreshState = async (autoSelect = false) => {
    const next = await apiFetch<StateSnapshot>("/api/state");
    setSnapshot(next);
    if (autoSelect) {
      setSelectedId((cur) => cur || ""); // never force-select
    }
  };

  useEffect(() => {
    refreshState().catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to load state")
    );
  }, []);

  /* ── events for selected session ── */
  useEffect(() => {
    if (!selectedId) { setEvents([]); return; }
    apiFetch<{ events: EventRecord[] }>(`/api/sessions/${selectedId}`)
      .then((r) => setEvents(r.events))
      .catch(() => {});
  }, [selectedId]);

  /* ── WebSocket + polling fallback ── */
  useEffect(() => {
    let active = true;
    let reconnect: number | undefined;
    let poll: number | undefined;
    let socket: WebSocket | null = null;

    const startPoll = () => {
      if (poll) return;
      poll = window.setInterval(() => {
        refreshState().catch(() => setError("Backend unavailable"));
      }, 2000);
    };

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${proto}://${location.host}/ws`);
      socket.addEventListener("open", () => {
        setError("");
        if (poll) { clearInterval(poll); poll = undefined; }
      });
      socket.addEventListener("message", (ev) => {
        try {
          const payload = JSON.parse(ev.data as string);
          if (payload.type !== "state:update") return;
          const next = payload.data as StateSnapshot;
          startTransition(() => {
            setSnapshot(next);
            // Only keep selection if session still exists; never auto-select new one
            setSelectedId((cur) => {
              if (!cur) return "";
              return next.sessions.some((s) => s.sessionId === cur) ? cur : "";
            });
          });
        } catch { /* ignore */ }
      });
      socket.addEventListener("close", () => {
        if (!active) return;
        startPoll();
        reconnect = window.setTimeout(connect, 1500);
      });
      socket.addEventListener("error", () => socket?.close());
    };

    connect();
    return () => {
      active = false;
      if (reconnect) clearTimeout(reconnect);
      if (poll) clearInterval(poll);
      socket?.close();
    };
  }, []);

  /* ── derived ── */
  const sessions = snapshot?.sessions ?? [];
  const activeSession = sessions.find((s) => s.sessionId === selectedId) ?? null;
  const norm = deferredFilter.trim().toLowerCase();
  const filtered = norm
    ? sessions.filter((s) =>
        [
          s.sessionId, s.title, s.terminalProgram, s.appIdentifier,
          s.appDisplayName, s.appDescription, s.cwd, s.repoRoot,
          s.gitBranch, s.lastCommand, s.recentFiles.join(" "),
          s.contentPreview ?? "",
        ].join(" ").toLowerCase().includes(norm)
      )
    : sessions;

  return (
    <div className="flex h-screen overflow-hidden"
      style={{ background: "linear-gradient(160deg, rgb(246,228,252) 0%, rgb(253,248,255) 50%)" }}>

      {/* ── Sidebar ── */}
      <aside className="w-60 flex-none flex flex-col h-full border-r border-[var(--border)] overflow-hidden"
        style={{ background: "rgba(250,244,255,0.94)", backdropFilter: "blur(20px)" }}>

        {/* Brand */}
        <div className="px-4 pt-5 pb-4 border-b border-[var(--border)]">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--brand)] mb-1.5">God Eye</p>
          <h1 className="text-lg font-bold text-[var(--ink)] leading-none tracking-tight mb-2">Window Map</h1>
          <p className="text-[11px] text-[var(--ink-muted)] leading-relaxed">
            Every open app, terminal, and context.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-1.5 p-3 border-b border-[var(--border)]">
          {[
            { icon: <Layers size={12} />, label: "Total", value: snapshot?.stats.totalSessions ?? 0 },
            { icon: <Zap size={12} />, label: "Active", value: snapshot?.stats.runningSessions ?? 0 },
            { icon: <GitBranch size={12} />, label: "Repos", value: snapshot?.stats.repos ?? 0 },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1 rounded-lg p-2 border border-[var(--border)]"
              style={{ background: "#ffffff" }}>
              <span className="text-[var(--ink-muted)]">{s.icon}</span>
              <span className="text-base font-bold text-[var(--ink)] leading-none">{s.value}</span>
              <span className="text-[9px] text-[var(--ink-muted)] font-medium">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="px-3 py-2.5 border-b border-[var(--border)]">
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] pointer-events-none" />
            <Input
              placeholder="Filter…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="pl-7 text-[11px] py-1.5 rounded-lg"
            />
          </div>
        </div>

        {/* Source */}
        {snapshot?.source && (
          <div className="px-3 py-2.5 border-b border-[var(--border)]">
            <SourceBadge source={snapshot.source} />
          </div>
        )}

        {/* AI Search */}
        <div className="mt-auto p-3 border-t border-[var(--border)]">
          <AiSearchBar
            aiEnabled={snapshot?.aiEnabled ?? false}
            onResult={(q, result) => {
              setSearchQuery(q);
              setAiAnswer(result.answer);
              setAiMatches(result.matches);
              setAiPrompt(result.prompt);
              setSearchMode(result.mode);
              if (result.matches[0]) {
                setSelectedId(result.matches[0].sessionId);
              }
            }}
            onError={setError}
          />
        </div>
      </aside>

      {/* ── Canvas + Detail panel ── */}
      <main className="flex-1 min-w-0 h-full flex overflow-hidden">

        {/* Scrollable card grid */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* Error bar */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="mb-3.5 flex items-center gap-2 text-[12px] text-[var(--brand)] rounded-lg px-3 py-2.5 border border-[rgba(162,59,103,0.2)]"
                style={{ background: "#ffffff" }}>
                <AlertCircle size={13} className="flex-none" />
                {error}
                <button type="button" onClick={() => setError("")} className="ml-auto text-[var(--ink-muted)] hover:text-[var(--ink)]">
                  <X size={12} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Search result banner */}
          <AnimatePresence>
            {searchQuery && (
              <SearchBanner
                query={searchQuery}
                answer={aiAnswer}
                matches={aiMatches}
                prompt={aiPrompt}
                mode={searchMode}
                onSelect={setSelectedId}
                onDismiss={() => {
                  setSearchQuery("");
                  setAiPrompt(null);
                }}
              />
            )}
          </AnimatePresence>

          {/* Canvas header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-muted)]">
                Windows
              </p>
              <Badge variant="muted">{filtered.length}</Badge>
            </div>
            {filterQuery && (
              <button type="button" onClick={() => setFilterQuery("")}
                className="flex items-center gap-1 text-[10px] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors">
                <X size={10} />Clear
              </button>
            )}
          </div>

          {/* Grid */}
          {filtered.length === 0
            ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <div className="w-10 h-10 rounded-xl border border-[var(--border)] flex items-center justify-center"
                  style={{ background: "#ffffff" }}>
                  <Terminal size={18} className="text-[var(--ink-muted)]" />
                </div>
                <p className="text-[13px] font-semibold text-[var(--ink)]">No windows</p>
                <p className="text-[11px] text-[var(--ink-muted)] max-w-[26ch] leading-relaxed">
                  {filterQuery ? "Try a different filter." : "Set TERMINAL_SCOUT_MAC_WINDOWS=1 or source the shell script."}
                </p>
              </motion.div>
            )
            : (
              <div className="grid gap-2.5"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(232px, 1fr))" }}>
                <AnimatePresence mode="popLayout" initial={false}>
                  {filtered.map((session, i) => (
                    <WindowCard
                      key={session.sessionId}
                      session={session}
                      active={session.sessionId === selectedId}
                      onSelect={setSelectedId}
                      index={i}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
        </div>

        {/* ── Right detail panel ── */}
        <AnimatePresence>
          {activeSession && (
            <motion.aside
              key="detail"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ x: { duration: 0.22, ease: EASE_OUT_QUART } }}
              style={{
                willChange: "transform",
                boxShadow: "-4px 0 20px rgba(91,59,103,0.08)",
                background: "rgba(250,245,255,0.98)",
                backdropFilter: "blur(20px)",
              }}
              className="w-[340px] flex-none h-full border-l border-[var(--border)] overflow-hidden"
            >
              <DetailPanel session={activeSession} events={events} onClose={() => setSelectedId("")} />
            </motion.aside>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
