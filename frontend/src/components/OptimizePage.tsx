import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  PointElement,
  ScatterController,
  Tooltip,
} from "chart.js";
import { Bar, Scatter } from "react-chartjs-2";

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  PointElement, ScatterController, Tooltip, Legend,
);

// ── Types ─────────────────────────────────────────────────────────────────────

export type OptimizeVariant = {
  label: string;
  strategy: string;
  order_quantity: number;
  avg_profit: number;
  profit_p10: number;
  profit_p50: number;
  profit_p90: number;
  profit_std_dev: number;
  bankruptcy_probability: number;
  bankruptcy_count: number;
  actual_simulations: number;
  sharpe_like: number;
};

export type OptimizeResult = {
  variants: OptimizeVariant[];
  best_avg_profit_label: string;
  best_risk_adjusted_label: string;
  safest_label: string;
  ai_recommendation?: string;
};

type Props = {
  onRun: (params: OptimizeParams) => void;
  isLoading: boolean;
  result: OptimizeResult | null;
  // pass-through sim params from dashboard
  initialCash: number;
  demandStdDev: number;
  weeklyFixedCost: number;
  bankruptcyThreshold: number;
  salePrice: number;
  simulations: number;
  aiModel: string;
};

export type OptimizeParams = {
  simulations: number;
  initial_cash: number;
  demand_std_dev: number;
  weekly_fixed_cost: number;
  bankruptcy_cash_threshold: number;
  sale_price: number;
  qty_sweep_min: number;
  qty_sweep_max: number;
  qty_sweep_step: number;
  model?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const $k = (n: number) => {
  const s = n < 0 ? "-" : "";
  const a = Math.abs(n);
  return a >= 1000 ? `${s}$${(a / 1000).toFixed(1)}k` : `${s}$${a.toFixed(0)}`;
};
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const GRID = "rgba(255,255,255,0.05)";
const TICK = { color: "rgba(122,144,179,1)", font: { size: 10 } };

// ── Badge ─────────────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: "0.60rem", fontWeight: 800, letterSpacing: "0.07em",
      textTransform: "uppercase" as const, padding: "2px 8px",
      borderRadius: 999, background: `${color}18`,
      border: `1px solid ${color}44`, color,
    }}>{label}</span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OptimizePage({
  onRun, isLoading, result,
  initialCash, demandStdDev, weeklyFixedCost,
  bankruptcyThreshold, salePrice, simulations, aiModel,
}: Props) {
  const [qMin, setQMin] = React.useState(60);
  const [qMax, setQMax] = React.useState(200);
  const [qStep, setQStep] = React.useState(20);

  function run() {
    onRun({
      simulations: Math.max(simulations, 150),
      initial_cash: initialCash,
      demand_std_dev: demandStdDev,
      weekly_fixed_cost: weeklyFixedCost,
      bankruptcy_cash_threshold: bankruptcyThreshold,
      sale_price: salePrice,
      qty_sweep_min: qMin,
      qty_sweep_max: qMax,
      qty_sweep_step: qStep,
      model: aiModel || undefined,
    });
  }

  return (
    <section className="panel">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="panel-header">
        <div>
          <h2>Profit Optimizer</h2>
          <p className="muted">
            Sweeps every strategy and order quantity to find your best risk/reward combination.
            Uses your current simulation parameters.
          </p>
        </div>
        <div className="actions-row">
          <button className="primary-button" onClick={run} disabled={isLoading}>
            {isLoading ? "Optimizing…" : "Run Optimizer"}
          </button>
        </div>
      </div>

      {/* ── Sweep config ───────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10, marginBottom: 16 }}>
        <label>
          Min order qty
          <input type="number" min={1} value={qMin} onChange={(e) => setQMin(Number(e.target.value))} />
        </label>
        <label>
          Max order qty
          <input type="number" min={1} value={qMax} onChange={(e) => setQMax(Number(e.target.value))} />
        </label>
        <label>
          Step size
          <input type="number" min={1} value={qStep} onChange={(e) => setQStep(Number(e.target.value))} />
        </label>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <p style={{ fontSize: "0.72rem", color: "var(--text-3)", lineHeight: 1.4 }}>
            Will run {3 + Math.max(0, Math.floor((qMax - qMin) / qStep) + 1 - [60,80,100].filter(q => q >= qMin && q <= qMax && q % qStep === qMin % qStep).length)} variants in parallel
          </p>
        </div>
      </div>

      {isLoading && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "24px 0" }}>
          <div style={{ width: 24, height: 24, border: "2px solid rgba(59,130,246,0.2)",
            borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          <p style={{ margin: 0, color: "var(--text-2)", fontSize: "0.85rem" }}>
            Running {3 + Math.floor((qMax - qMin) / qStep)} simulation variants in parallel…
          </p>
        </div>
      )}

      {result && !isLoading && <OptimizeResults result={result} />}
    </section>
  );
}

// ── Results component ─────────────────────────────────────────────────────────

function OptimizeResults({ result }: { result: OptimizeResult }) {
  const { variants, best_avg_profit_label, best_risk_adjusted_label, safest_label } = result;

  // Charts
  const labels = variants.map((v) => v.label.replace(" units/wk", "u").replace("Custom: ", ""));
  const barData = {
    labels,
    datasets: [
      {
        label: "P10",
        data: variants.map((v) => v.profit_p10),
        backgroundColor: "rgba(239,68,68,0.55)",
        borderRadius: 3,
        stack: "profRange",
      },
      {
        label: "P50 (median)",
        data: variants.map((v) => v.profit_p50 - v.profit_p10),
        backgroundColor: "rgba(59,130,246,0.60)",
        borderRadius: 3,
        stack: "profRange",
      },
      {
        label: "P90",
        data: variants.map((v) => v.profit_p90 - v.profit_p50),
        backgroundColor: "rgba(34,197,94,0.60)",
        borderRadius: 3,
        stack: "profRange",
      },
    ],
  };

  const scatterData = {
    datasets: [{
      label: "Variant",
      data: variants.map((v) => ({
        x: v.bankruptcy_probability * 100,
        y: v.avg_profit,
      })),
      backgroundColor: variants.map((v) =>
        v.label === best_avg_profit_label ? "#60a5fa" :
        v.label === best_risk_adjusted_label ? "#22c55e" :
        v.label === safest_label ? "#f59e0b" :
        "rgba(148,163,184,0.4)"
      ),
      pointRadius: variants.map((v) =>
        [best_avg_profit_label, best_risk_adjusted_label, safest_label].includes(v.label) ? 8 : 5
      ),
    }],
  };

  const BASE_OPTS = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: GRID }, ticks: { ...TICK, maxRotation: 35, autoSkip: true, maxTicksLimit: 10 } },
      y: { grid: { color: GRID }, ticks: { ...TICK, callback: (v: number | string) => $k(Number(v)) } },
    },
  };

  const best = variants.find((v) => v.label === best_avg_profit_label);
  const safe = variants.find((v) => v.label === safest_label);
  const ra   = variants.find((v) => v.label === best_risk_adjusted_label);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ── Winner cards ──────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        {[
          { v: best, title: "Max Profit",         color: "#60a5fa", badge: "💰 Best Returns" },
          { v: ra,   title: "Best Risk-Adjusted",  color: "#22c55e", badge: "⚖ Sharpe Winner" },
          { v: safe, title: "Safest",              color: "#f59e0b", badge: "🛡 Lowest Risk" },
        ].map(({ v, title, color, badge }) =>
          v ? (
            <div key={title} style={{
              background: "var(--s1)", border: `1px solid ${color}44`,
              borderTop: `3px solid ${color}`, borderRadius: "var(--r-md)", padding: "14px 16px",
            }}>
              <Badge label={badge} color={color} />
              <p style={{ margin: "8px 0 2px", fontSize: "0.80rem", fontWeight: 700, color: "var(--text)" }}>{v.label}</p>
              <p style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color }}>{$k(v.avg_profit)}</p>
              <p style={{ margin: "4px 0 0", fontSize: "0.72rem", color: "var(--text-2)" }}>
                P10 {$k(v.profit_p10)} · P90 {$k(v.profit_p90)}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: "0.72rem", color: v.bankruptcy_probability > 0.2 ? "#ef4444" : "#22c55e" }}>
                Bankruptcy: {pct(v.bankruptcy_probability)}
              </p>
            </div>
          ) : null
        )}
      </div>

      {/* ── Charts ────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14 }}>
        <div style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "14px 16px" }}>
          <p style={{ margin: "0 0 8px", fontSize: "0.70rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-2)" }}>
            Profit Range by Variant (P10 / Median / P90)
          </p>
          <div style={{ height: 240, width: "100%", position: "relative" }}>
            <Bar data={barData} options={{ ...BASE_OPTS, plugins: { legend: {
              display: true, position: "top" as const,
              labels: { color: "rgba(122,144,179,1)", font: { size: 10 }, boxWidth: 12 },
            }}, scales: { ...BASE_OPTS.scales, x: { ...BASE_OPTS.scales.x, stacked: true }, y: { ...BASE_OPTS.scales.y, stacked: true } } }} />
          </div>
        </div>

        <div style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "14px 16px" }}>
          <p style={{ margin: "0 0 4px", fontSize: "0.70rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-2)" }}>
            Risk vs Return
          </p>
          <p style={{ margin: "0 0 8px", fontSize: "0.65rem", color: "var(--text-3)" }}>
            <span style={{ color: "#60a5fa" }}>●</span> max profit &nbsp;
            <span style={{ color: "#22c55e" }}>●</span> best risk-adj &nbsp;
            <span style={{ color: "#f59e0b" }}>●</span> safest
          </p>
          <div style={{ height: 220, width: "100%", position: "relative" }}>
            <Scatter data={scatterData} options={{
              responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx) => {
                      const v = variants[ctx.dataIndex];
                      return [`${v.label}`, `Avg profit: ${$k(v.avg_profit)}`, `Bankruptcy: ${pct(v.bankruptcy_probability)}`];
                    },
                  },
                },
              },
              scales: {
                x: { grid: { color: GRID }, ticks: { ...TICK, callback: (v: string | number) => `${v}%` },
                  title: { display: true, text: "Bankruptcy %", color: "rgba(122,144,179,1)", font: { size: 10 } } },
                y: { grid: { color: GRID }, ticks: { ...TICK, callback: (v: string | number) => $k(Number(v)) },
                  title: { display: true, text: "Avg Profit", color: "rgba(122,144,179,1)", font: { size: 10 } } },
              },
            }} />
          </div>
        </div>
      </div>

      {/* ── AI Recommendation ─────────────────────────────────────────── */}
      {result.ai_recommendation && (
        <div style={{
          background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.22)",
          borderLeft: "3px solid #22c55e", borderRadius: "var(--r-md)", padding: "14px 16px",
        }}>
          <p style={{ margin: "0 0 10px", fontSize: "0.70rem", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.07em", color: "#22c55e" }}>
            🤖 AI Optimization Recommendation
          </p>
          <p style={{ margin: 0, fontSize: "0.86rem", lineHeight: 1.65, color: "var(--text)", whiteSpace: "pre-wrap" }}>
            {result.ai_recommendation}
          </p>
        </div>
      )}

      {/* ── Full ranked table ──────────────────────────────────────────── */}
      <div>
        <p style={{ margin: "0 0 8px", fontSize: "0.70rem", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-2)" }}>
          All Variants — Ranked by Average Profit
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["#", "Variant", "Avg Profit", "P10", "P50", "P90", "Std Dev", "Bankruptcy", "Risk-Adj"].map((h) => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "var(--text-2)",
                    fontWeight: 600, fontSize: "0.70rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {variants.map((v, i) => {
                const isBest  = v.label === best_avg_profit_label;
                const isSafe  = v.label === safest_label;
                const isRA    = v.label === best_risk_adjusted_label;
                const bkColor = v.bankruptcy_probability > 0.3 ? "#ef4444"
                  : v.bankruptcy_probability > 0.12 ? "#f59e0b" : "#22c55e";
                return (
                  <tr key={v.label} style={{
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    background: isBest ? "rgba(59,130,246,0.06)" : isRA ? "rgba(34,197,94,0.05)" : "transparent",
                  }}>
                    <td style={{ padding: "7px 10px", color: "var(--text-3)" }}>{i + 1}</td>
                    <td style={{ padding: "7px 10px", fontWeight: 600, color: "var(--text)" }}>
                      {v.label}
                      {isBest && <> <Badge label="💰" color="#60a5fa" /></>}
                      {isRA && <> <Badge label="⚖" color="#22c55e" /></>}
                      {isSafe && <> <Badge label="🛡" color="#f59e0b" /></>}
                    </td>
                    <td style={{ padding: "7px 10px", fontWeight: 700, color: v.avg_profit >= 0 ? "#60a5fa" : "#ef4444" }}>
                      {$k(v.avg_profit)}
                    </td>
                    <td style={{ padding: "7px 10px", color: "#f87171" }}>{$k(v.profit_p10)}</td>
                    <td style={{ padding: "7px 10px", color: "var(--text-2)" }}>{$k(v.profit_p50)}</td>
                    <td style={{ padding: "7px 10px", color: "#86efac" }}>{$k(v.profit_p90)}</td>
                    <td style={{ padding: "7px 10px", color: "var(--text-2)" }}>{$k(v.profit_std_dev)}</td>
                    <td style={{ padding: "7px 10px", fontWeight: 600, color: bkColor }}>{pct(v.bankruptcy_probability)}</td>
                    <td style={{ padding: "7px 10px", color: "var(--text-2)" }}>{v.sharpe_like.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Need React in scope for JSX
import React from "react";
