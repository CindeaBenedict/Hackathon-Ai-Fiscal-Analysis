import React, { useEffect, useRef } from "react";
import SimulationChart from "./SimulationChart";

export type SimulationResults = {
  avg_profit: number;
  best_profit: number;
  worst_profit: number;
  profit_std_dev?: number;
  profit_p05?: number;
  profit_p10?: number;
  profit_p25?: number;
  profit_p50?: number;
  profit_p75?: number;
  profit_p90?: number;
  profit_p95?: number;
  profit_cvar95?: number;
  profit_skewness?: number;
  profit_kurtosis?: number;
  sharpe_ratio?: number | null;
  sortino_ratio?: number | null;
  avg_max_drawdown?: number;
  avg_service_level?: number;
  avg_bankruptcy_week?: number | null;
  profit_ci_low?: number;
  profit_ci_high?: number;
  stockouts_average: number;
  bankruptcy_probability: number;
  bankruptcy_count: number;
  actual_simulations?: number;
  profit_ci_half_width?: number;
  bankruptcy_ci_half_width?: number;
  inventory_traces: number[][];
  profits: number[];
};

export type SimChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Props = {
  results: SimulationResults;
  chatMessages: SimChatMessage[];
  isAiLoading: boolean;
  aiModel: string;
  onSendMessage: (text: string) => void;
};

const $$ = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
  }).format(n);

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function StatRow({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "6px 0",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        gap: 8,
      }}
    >
      <span style={{ fontSize: "0.77rem", color: "var(--text-2)", flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <strong
          style={{
            fontSize: "0.90rem",
            color: color ?? "var(--text)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </strong>
        {sub && <span style={{ fontSize: "0.67rem", color: "var(--text-3)" }}>{sub}</span>}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: "0.63rem",
        fontWeight: 700,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        color: "var(--text-3)",
        margin: "12px 0 3px",
      }}
    >
      {children}
    </p>
  );
}

function BankruptcyBar({ probability }: { probability: number }) {
  const p = Math.min(probability * 100, 100);
  const color = p > 30 ? "#ef4444" : p > 12 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          height: 5,
          borderRadius: 999,
          background: "rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${p}%`,
            height: "100%",
            borderRadius: 999,
            background: color,
            transition: "width 0.7s ease",
            boxShadow: `0 0 8px ${color}88`,
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 3,
        }}
      >
        <span style={{ fontSize: "0.62rem", color: "var(--text-3)" }}>0%</span>
        <span style={{ fontSize: "0.68rem", color, fontWeight: 700 }}>
          {p.toFixed(1)}% bankrupt
        </span>
        <span style={{ fontSize: "0.62rem", color: "var(--text-3)" }}>100%</span>
      </div>
    </div>
  );
}

function ChatBubble({ msg }: { msg: SimChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        marginBottom: 10,
      }}
    >
      <span
        style={{
          fontSize: "0.62rem",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: isUser ? "#60a5fa" : "#22c55e",
          marginBottom: 4,
        }}
      >
        {isUser ? "You" : "AI Advisor"}
      </span>
      <div
        style={{
          maxWidth: "92%",
          padding: "10px 13px",
          borderRadius: isUser ? "12px 12px 2px 12px" : "2px 12px 12px 12px",
          background: isUser
            ? "rgba(59,130,246,0.12)"
            : "rgba(34,197,94,0.07)",
          border: isUser
            ? "1px solid rgba(59,130,246,0.22)"
            : "1px solid rgba(34,197,94,0.18)",
          fontSize: "0.84rem",
          lineHeight: 1.58,
          color: "var(--text)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {msg.content}
      </div>
    </div>
  );
}

const QUICK_REPLIES = [
  "Why did so many runs go bankrupt?",
  "What drives the profit variance?",
  "How can I reduce the bankruptcy rate?",
  "Explain the P10 vs P90 gap",
  "Is this strategy worth the risk?",
];

export default function AnalysisDashboard({ results: r, chatMessages, isAiLoading, aiModel, onSendMessage }: Props) {
  const n = r.actual_simulations ?? r.profits.length;
  const bkColor =
    r.bankruptcy_probability > 0.3
      ? "#ef4444"
      : r.bankruptcy_probability > 0.12
      ? "#f59e0b"
      : "#22c55e";

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isAiLoading]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = inputRef.current?.value.trim();
    if (!val) return;
    onSendMessage(val);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="dashboard-two-col">
        {/* Math panel */}
        <section
          style={{
            background: "var(--s0)",
            border: "1px solid rgba(59,130,246,0.20)",
            borderTop: "3px solid #3b82f6",
            borderRadius: "var(--r-lg)",
            padding: "16px 18px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span
              style={{
                fontSize: "0.68rem",
                fontWeight: 800,
                letterSpacing: "0.10em",
                color: "#60a5fa",
                textTransform: "uppercase",
              }}
            >
              Math Model
            </span>
            <span style={{ fontSize: "0.65rem", color: "var(--text-3)", marginLeft: "auto" }}>
              n={n.toLocaleString()}
              {r.profit_ci_half_width != null &&
                ` · CI ±${$$(r.profit_ci_half_width)}`}
            </span>
          </div>

          <SectionLabel>Expected return</SectionLabel>
          <StatRow
            label="Average profit"
            value={$$(r.avg_profit)}
            color={r.avg_profit >= 0 ? "#60a5fa" : "#ef4444"}
          />
          {r.profit_std_dev != null && (
            <StatRow
              label="Std dev (σ)"
              value={$$(r.profit_std_dev)}
              sub="volatility"
              color="#93c5fd"
            />
          )}

          <SectionLabel>Outcome distribution</SectionLabel>
          {r.profit_p05 != null && (
            <StatRow label="VaR 95% (P05)" value={$$(r.profit_p05)} sub="worst 5%" color="#ef4444" />
          )}
          {r.profit_cvar95 != null && (
            <StatRow label="CVaR 95%" value={$$(r.profit_cvar95)} sub="Expected Shortfall" color="#ef4444" />
          )}
          {r.profit_p10 != null && (
            <StatRow label="P10 — bad case" value={$$(r.profit_p10)} color="#f87171" />
          )}
          {r.profit_p25 != null && (
            <StatRow label="P25 — lower quartile" value={$$(r.profit_p25)} color="#fbbf24" />
          )}
          {r.profit_p50 != null && (
            <StatRow label="P50 — median" value={$$(r.profit_p50)} color="#93c5fd" />
          )}
          {r.profit_p75 != null && (
            <StatRow label="P75 — upper quartile" value={$$(r.profit_p75)} color="#86efac" />
          )}
          {r.profit_p90 != null && (
            <StatRow label="P90 — good case" value={$$(r.profit_p90)} color="#22c55e" />
          )}
          {r.profit_p95 != null && (
            <StatRow label="P95 — best 5%" value={$$(r.profit_p95)} sub="upside" color="#22c55e" />
          )}

          <SectionLabel>Distribution shape</SectionLabel>
          {r.profit_skewness != null && (
            <StatRow
              label="Skewness"
              value={r.profit_skewness.toFixed(3)}
              sub={r.profit_skewness < -0.5 ? "left-skewed (downside heavy)" : r.profit_skewness > 0.5 ? "right-skewed (upside potential)" : "roughly symmetric"}
              color={r.profit_skewness < -0.5 ? "#ef4444" : r.profit_skewness > 0.5 ? "#22c55e" : "#93c5fd"}
            />
          )}
          {r.profit_kurtosis != null && (
            <StatRow
              label="Excess kurtosis"
              value={r.profit_kurtosis.toFixed(3)}
              sub={r.profit_kurtosis > 1 ? "heavy tails (extreme events)" : r.profit_kurtosis < -1 ? "light tails" : "near-normal tails"}
              color={r.profit_kurtosis > 1 ? "#f59e0b" : "#93c5fd"}
            />
          )}

          <SectionLabel>Range</SectionLabel>
          <StatRow label="Best run" value={$$(r.best_profit)} color="#22c55e" />
          <StatRow label="Worst run" value={$$(r.worst_profit)} color="#ef4444" />

          <SectionLabel>Risk</SectionLabel>
          <StatRow label="Bankruptcy rate" value={pct(r.bankruptcy_probability)} color={bkColor} />
          <StatRow label="Bankrupt runs" value={`${r.bankruptcy_count} / ${n}`} color={bkColor} />
          {r.avg_bankruptcy_week != null && (
            <StatRow label="Avg bankruptcy week" value={`W${r.avg_bankruptcy_week.toFixed(1)}`} sub="when cash runs out" color="#ef4444" />
          )}
          <StatRow label="Avg weekly stockouts" value={r.stockouts_average.toFixed(2)} />
          {r.avg_service_level != null && (
            <StatRow
              label="Service level"
              value={pct(r.avg_service_level)}
              sub="weeks without stockout"
              color={r.avg_service_level >= 0.9 ? "#22c55e" : r.avg_service_level >= 0.7 ? "#f59e0b" : "#ef4444"}
            />
          )}
          {r.avg_max_drawdown != null && (
            <StatRow label="Avg max drawdown" value={$$(r.avg_max_drawdown)} sub="peak-to-trough cash" color="#ef4444" />
          )}

          <SectionLabel>Risk-adjusted returns</SectionLabel>
          {r.sharpe_ratio != null && (
            <StatRow
              label="Sharpe ratio"
              value={r.sharpe_ratio.toFixed(3)}
              sub="return per unit of risk"
              color={r.sharpe_ratio > 0.5 ? "#22c55e" : r.sharpe_ratio > 0 ? "#fbbf24" : "#ef4444"}
            />
          )}
          {r.sortino_ratio != null && isFinite(r.sortino_ratio) && (
            <StatRow
              label="Sortino ratio"
              value={r.sortino_ratio.toFixed(3)}
              sub="return per downside risk"
              color={r.sortino_ratio > 0.5 ? "#22c55e" : r.sortino_ratio > 0 ? "#fbbf24" : "#ef4444"}
            />
          )}
          <BankruptcyBar probability={r.bankruptcy_probability} />
        </section>

        {/* AI Chat panel */}
        <section
          style={{
            background: "var(--s0)",
            border: "1px solid rgba(34,197,94,0.20)",
            borderTop: "3px solid #22c55e",
            borderRadius: "var(--r-lg)",
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            minHeight: 420,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexShrink: 0 }}>
            <span
              style={{
                fontSize: "0.68rem",
                fontWeight: 800,
                letterSpacing: "0.10em",
                color: "#22c55e",
                textTransform: "uppercase",
              }}
            >
              AI Advisor
            </span>
            <span style={{ fontSize: "0.65rem", color: "var(--text-3)", marginLeft: "auto" }}>
              {aiModel}
            </span>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              paddingRight: 4,
              marginBottom: 10,
              minHeight: 0,
            }}
          >
            {chatMessages.length === 0 && !isAiLoading ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  gap: 8,
                  opacity: 0.5,
                  padding: "30px 0",
                }}
              >
                <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-2)" }}>
                  Ask questions about these results
                </p>
                <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--text-3)" }}>
                  e.g. why did so many runs go bankrupt?
                </p>
              </div>
            ) : (
              <>
                {chatMessages.map((msg) => (
                  <ChatBubble key={msg.id} msg={msg} />
                ))}
                {isAiLoading && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        border: "2px solid rgba(34,197,94,0.2)",
                        borderTopColor: "#22c55e",
                        borderRadius: "50%",
                        animation: "spin 0.7s linear infinite",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: "0.78rem", color: "var(--text-2)" }}>Thinking…</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </>
            )}
          </div>

          {chatMessages.length > 0 && !isAiLoading && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8, flexShrink: 0 }}>
              {QUICK_REPLIES.map((q) => (
                <button
                  key={q}
                  onClick={() => onSendMessage(q)}
                  style={{
                    border: "1px solid rgba(34,197,94,0.22)",
                    borderRadius: 999,
                    background: "transparent",
                    color: "#6ee7b7",
                    fontSize: "0.70rem",
                    padding: "3px 10px",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    ((e.target as HTMLButtonElement).style.background = "rgba(34,197,94,0.10)")
                  }
                  onMouseLeave={(e) =>
                    ((e.target as HTMLButtonElement).style.background = "transparent")
                  }
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="chat-form">
            <input
              ref={inputRef}
              placeholder="Ask about these results…"
              disabled={isAiLoading}
              style={{
                flex: 1,
                border: "1px solid rgba(34,197,94,0.22)",
                borderRadius: "var(--r-sm)",
                background: "var(--s1)",
                color: "var(--text)",
                padding: "8px 10px",
                fontSize: "0.84rem",
                outline: "none",
              }}
              onFocus={(e) =>
                ((e.target as HTMLInputElement).style.borderColor = "rgba(34,197,94,0.5)")
              }
              onBlur={(e) =>
                ((e.target as HTMLInputElement).style.borderColor = "rgba(34,197,94,0.22)")
              }
            />
            <button
              type="submit"
              disabled={isAiLoading}
              style={{
                border: "none",
                borderRadius: "var(--r-sm)",
                background: "#22c55e",
                color: "#000",
                fontWeight: 700,
                fontSize: "0.84rem",
                padding: "8px 14px",
                cursor: isAiLoading ? "not-allowed" : "pointer",
                opacity: isAiLoading ? 0.5 : 1,
                transition: "opacity 0.15s",
                flexShrink: 0,
              }}
            >
              Send
            </button>
          </form>
        </section>
      </div>

      {/* Charts full width below */}
      <SimulationChart
        inventoryTraces={r.inventory_traces}
        profits={r.profits}
      />
    </div>
  );
}
