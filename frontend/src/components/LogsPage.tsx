import { useEffect, useRef, useState } from "react";

export type LogLevel = "info" | "success" | "error";

export type FrontendLogEntry = {
  id: string;
  timestamp: string;
  action: string;
  request: unknown;
  response?: unknown;
  error?: string;
  level: LogLevel;
};

export type BackendAILog = {
  timestamp: string;
  action: string;
  model: string;
  prompt: string;
  response?: string;
  error?: string;
  duration_ms?: number;
  prompt_chars?: number;
  response_chars?: number;
};

type LogsPageProps = {
  logs: FrontendLogEntry[];
  backendLogs: BackendAILog[];
  onClearLocal: () => void;
  onClearBackend: () => void;
  onRefreshBackend: () => void;
};

function formatMs(ms?: number) {
  if (ms == null) return null;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function ActionBadge({ action, error }: { action: string; error?: string }) {
  const isError = !!error || action.includes("error");
  const isSuccess = action.includes("success") && !isError;
  const color = isError ? "#ef4444" : isSuccess ? "#22c55e" : "#60a5fa";
  const bg = isError ? "rgba(239,68,68,0.10)" : isSuccess ? "rgba(34,197,94,0.10)" : "rgba(96,165,250,0.10)";
  const short = action.replace(/^ai\./, "").replace(/\./g, " › ");
  return (
    <span style={{
      fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "0.05em", padding: "2px 8px", borderRadius: 999,
      background: bg, color, border: `1px solid ${color}33`,
    }}>{short}</span>
  );
}

function BackendLogCard({ log }: { log: BackendAILog }) {
  const [open, setOpen] = useState(false);
  const isError = !!log.error || log.action.includes("error");

  return (
    <article style={{
      background: "var(--s1)", border: "1px solid var(--border)",
      borderLeft: `3px solid ${isError ? "var(--danger)" : "var(--accent)"}`,
      borderRadius: "var(--r-sm)", overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: "10px 14px", display: "flex", alignItems: "center",
          gap: 10, textAlign: "left",
        }}
      >
        <ActionBadge action={log.action} error={log.error} />
        <span style={{ flex: 1, fontSize: "0.78rem", color: "var(--text-2)", fontFamily: "monospace" }}>
          {log.model}
        </span>
        {log.duration_ms != null && (
          <span style={{ fontSize: "0.72rem", color: "var(--text-3)", fontWeight: 600 }}>
            {formatMs(log.duration_ms)}
          </span>
        )}
        {log.prompt_chars != null && (
          <span style={{ fontSize: "0.7rem", color: "var(--text-3)" }}>
            {log.prompt_chars}→{log.response_chars ?? "?"} chars
          </span>
        )}
        <span style={{ fontSize: "0.7rem", color: "var(--text-3)" }}>
          {new Date(log.timestamp).toLocaleTimeString()}
        </span>
        <span style={{ fontSize: "0.75rem", color: "var(--text-3)", marginLeft: 4 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              Prompt sent to {log.model}
            </p>
            <pre style={{
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              background: "var(--s0)", border: "1px solid var(--border)",
              borderRadius: "var(--r-xs)", padding: "10px 12px",
              fontSize: "0.78rem", color: "var(--text)", lineHeight: 1.55,
              maxHeight: 280, overflowY: "auto", margin: 0,
            }}>{log.prompt}</pre>
          </div>

          {log.response && (
            <div>
              <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                Model response
              </p>
              <pre style={{
                whiteSpace: "pre-wrap", wordBreak: "break-word",
                background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.18)",
                borderRadius: "var(--r-xs)", padding: "10px 12px",
                fontSize: "0.78rem", color: "var(--text)", lineHeight: 1.55,
                maxHeight: 300, overflowY: "auto", margin: 0,
              }}>{log.response}</pre>
            </div>
          )}

          {log.error && (
            <div>
              <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--danger)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                Error
              </p>
              <pre style={{
                whiteSpace: "pre-wrap", wordBreak: "break-word",
                background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)",
                borderRadius: "var(--r-xs)", padding: "10px 12px",
                fontSize: "0.78rem", color: "#fca5a5", lineHeight: 1.55, margin: 0,
              }}>{log.error}</pre>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function FrontendLogCard({ entry }: { entry: FrontendLogEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <article style={{
      background: "var(--s1)", border: "1px solid var(--border)",
      borderLeft: `3px solid ${entry.level === "error" ? "var(--danger)" : entry.level === "success" ? "var(--success)" : "var(--accent)"}`,
      borderRadius: "var(--r-sm)", overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, textAlign: "left",
        }}
      >
        <ActionBadge action={entry.action} error={entry.error} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: "0.7rem", color: "var(--text-3)" }}>
          {new Date(entry.timestamp).toLocaleTimeString()}
        </span>
        <span style={{ fontSize: "0.75rem", color: "var(--text-3)", marginLeft: 4 }}>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {entry.request != null && (
            <pre style={{
              whiteSpace: "pre-wrap", background: "var(--s0)", border: "1px solid var(--border)",
              borderRadius: "var(--r-xs)", padding: "8px 10px", fontSize: "0.76rem",
              color: "var(--text-2)", lineHeight: 1.5, maxHeight: 200, overflowY: "auto", margin: 0,
            }}>{JSON.stringify(entry.request, null, 2)}</pre>
          )}
          {entry.response != null && (
            <pre style={{
              whiteSpace: "pre-wrap", background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.18)",
              borderRadius: "var(--r-xs)", padding: "8px 10px", fontSize: "0.76rem",
              color: "var(--text)", lineHeight: 1.5, maxHeight: 200, overflowY: "auto", margin: 0,
            }}>{typeof entry.response === "string" ? entry.response : JSON.stringify(entry.response, null, 2)}</pre>
          )}
          {entry.error && (
            <pre style={{
              whiteSpace: "pre-wrap", background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.22)", borderRadius: "var(--r-xs)",
              padding: "8px 10px", fontSize: "0.76rem", color: "#fca5a5", margin: 0,
            }}>{entry.error}</pre>
          )}
        </div>
      )}
    </article>
  );
}

function LogsPage({
  logs,
  backendLogs,
  onClearLocal,
  onClearBackend,
  onRefreshBackend,
}: LogsPageProps) {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (autoRefresh) {
      onRefreshBackend();
      intervalRef.current = setInterval(onRefreshBackend, 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>AI Interaction Logs</h2>
          <p className="muted">
            Full prompt + response traces between the app and the local LLM.
          </p>
        </div>
        <div className="actions-row">
          <button
            className="secondary-button"
            style={autoRefresh ? { borderColor: "var(--accent)", color: "var(--accent-hi)" } : undefined}
            onClick={() => setAutoRefresh(v => !v)}
          >
            {autoRefresh ? "⏸ Auto-refresh ON" : "▶ Auto-refresh OFF"}
          </button>
          <button className="secondary-button" onClick={onRefreshBackend}>Refresh</button>
          <button className="secondary-button" onClick={onClearBackend}>Clear Backend</button>
          <button className="secondary-button" onClick={onClearLocal}>Clear Frontend</button>
        </div>
      </div>

      {/* Backend AI logs */}
      <h3 style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
        Backend AI Logs — {backendLogs.length} entries
      </h3>
      {backendLogs.length === 0 ? (
        <p className="muted" style={{ marginBottom: 20 }}>
          No backend AI logs yet. Click <strong>Run AI Advisor</strong> on the Dashboard.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
          {backendLogs.map((log, i) => (
            <BackendLogCard key={`${log.timestamp}-${i}`} log={log} />
          ))}
        </div>
      )}

      {/* Frontend logs */}
      <h3 style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
        Frontend API Logs — {logs.length} entries
      </h3>
      {logs.length === 0 ? (
        <p className="muted">No frontend logs yet. Run a simulation or AI action.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {logs.map((entry) => (
            <FrontendLogCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}

export default LogsPage;
