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

type LogsPageProps = {
  logs: FrontendLogEntry[];
  onClear: () => void;
};

function LogsPage({ logs, onClear }: LogsPageProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>AI + Simulation Logs</h2>
          <p className="muted">Inspect requests and responses from the frontend.</p>
        </div>
        <button className="secondary-button" onClick={onClear}>
          Clear Logs
        </button>
      </div>

      {logs.length === 0 ? (
        <p className="muted">No logs yet. Run a simulation or AI action.</p>
      ) : (
        <div className="logs-list">
          {logs.map((entry) => (
            <article key={entry.id} className={`log-item log-${entry.level}`}>
              <header>
                <strong>{entry.action}</strong>
                <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
              </header>
              <details>
                <summary>Request</summary>
                <pre>{JSON.stringify(entry.request, null, 2)}</pre>
              </details>
              {entry.response ? (
                <details>
                  <summary>Response</summary>
                  <pre>{JSON.stringify(entry.response, null, 2)}</pre>
                </details>
              ) : null}
              {entry.error ? <p className="log-error">{entry.error}</p> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default LogsPage;
