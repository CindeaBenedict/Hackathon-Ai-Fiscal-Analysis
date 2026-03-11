import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="splash-screen">
          <div className="splash-card" style={{ maxWidth: 440 }}>
            <h2 style={{ color: "#ef4444" }}>Something went wrong</h2>
            <p style={{ fontSize: "0.85rem", color: "#94a3b8", wordBreak: "break-word" }}>
              {this.state.error.message}
            </p>
            <pre style={{
              fontSize: "0.72rem", color: "#64748b", background: "#111827",
              border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8,
              padding: 12, maxHeight: 180, overflow: "auto", textAlign: "left",
              width: "100%", whiteSpace: "pre-wrap",
            }}>
              {this.state.error.stack}
            </pre>
            <button
              className="primary-button"
              style={{ marginTop: 8 }}
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
            >
              Clear data &amp; reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
