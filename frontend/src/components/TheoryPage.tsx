import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Filler,
);

// ── Types ─────────────────────────────────────────────────────────────────────

type FactorImpact = {
  factor: string;
  baseline_avg_profit: number;
  stressed_avg_profit: number;
  delta_avg_profit: number;
  baseline_bankruptcy_probability: number;
  stressed_bankruptcy_probability: number;
  delta_bankruptcy_probability: number;
  explanation: string;
};

type TheoryReport = {
  expected_profit: number;
  profit_std_dev: number;
  confidence_interval_low: number;
  confidence_interval_high: number;
  bankruptcy_probability: number;
  bankruptcy_confidence_interval_low: number;
  bankruptcy_confidence_interval_high: number;
  required_simulations_for_target_error: number;
  mathematical_notes: string[];
  factor_impacts: FactorImpact[];
  ai_explanation?: string;
};

type TheoryPageProps = {
  report: TheoryReport | null;
  onGenerate: () => Promise<void>;
  isLoading: boolean;
};

// ── Shared chart style ────────────────────────────────────────────────────────

const GRID = "rgba(255,255,255,0.05)";
const TICK = { color: "rgba(122,144,179,1)", font: { size: 10 } };
const BASE_SCALES = {
  x: { grid: { color: GRID }, ticks: TICK },
  y: { grid: { color: GRID }, ticks: TICK },
};

const $k = (n: number) => {
  const abs = Math.abs(n);
  const s = n < 0 ? "-" : "";
  return abs >= 1000 ? `${s}$${(abs / 1000).toFixed(1)}k` : `${s}$${abs.toFixed(0)}`;
};

// ── Gaussian curve for profit CI ──────────────────────────────────────────────
function gaussianPoints(mean: number, std: number, points = 80) {
  const lo = mean - 3.5 * std;
  const hi = mean + 3.5 * std;
  const step = (hi - lo) / points;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= points; i++) {
    const x = lo + i * step;
    const y = Math.exp(-0.5 * ((x - mean) / std) ** 2) / (std * Math.sqrt(2 * Math.PI));
    xs.push(x);
    ys.push(y);
  }
  return { xs, ys };
}

// ── Small metric card ─────────────────────────────────────────────────────────
function MCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: "var(--s1)", border: "1px solid var(--border)",
      borderRadius: "var(--r-md)", padding: "12px 14px",
    }}>
      <p style={{ margin: "0 0 6px", fontSize: "0.67rem", fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-2)" }}>
        {label}
      </p>
      <strong style={{ fontSize: "1.0rem", color: color ?? "var(--text)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </strong>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function TheoryPage({ report, onGenerate, isLoading }: TheoryPageProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Theory + Real-World Factors</h2>
          <p className="muted">
            Pure math diagnostics, confidence intervals, and stress-tested factor impacts.
          </p>
        </div>
        <button className="primary-button" onClick={() => void onGenerate()} disabled={isLoading}>
          {isLoading ? "Computing…" : "Generate Theory Report"}
        </button>
      </div>

      {!report ? (
        <p className="muted">
          No report yet. Click <strong>Generate Theory Report</strong> to run the analysis.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ── Summary metrics ─────────────────────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 10 }}>
            <MCard
              label="Expected Profit"
              value={$k(report.expected_profit)}
              color={report.expected_profit >= 0 ? "#60a5fa" : "#ef4444"}
            />
            <MCard label="Std Deviation" value={$k(report.profit_std_dev)} color="#93c5fd" />
            <MCard
              label="95% Profit CI"
              value={`${$k(report.confidence_interval_low)} → ${$k(report.confidence_interval_high)}`}
            />
            <MCard
              label="Bankruptcy Rate"
              value={`${(report.bankruptcy_probability * 100).toFixed(1)}%`}
              color={report.bankruptcy_probability > 0.25 ? "#ef4444" : report.bankruptcy_probability > 0.1 ? "#f59e0b" : "#22c55e"}
            />
            <MCard
              label="Bankruptcy 95% CI"
              value={`${(report.bankruptcy_confidence_interval_low * 100).toFixed(1)}% – ${(report.bankruptcy_confidence_interval_high * 100).toFixed(1)}%`}
            />
            <MCard label="Runs needed (target)" value={report.required_simulations_for_target_error.toLocaleString()} />
          </div>

          {/* ── Profit Distribution Bell Curve ─────────────────────────── */}
          <div style={{
            background: "var(--s1)", border: "1px solid var(--border)",
            borderRadius: "var(--r-md)", padding: "14px 16px",
          }}>
            <p style={{ margin: "0 0 10px", fontSize: "0.72rem", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-2)" }}>
              Theoretical Profit Distribution — Normal Approximation
            </p>
            <ProfitBellChart report={report} />
          </div>

          {/* ── Factor Impact charts ────────────────────────────────────── */}
          {report.factor_impacts.length > 0 && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {/* Profit impact per factor */}
                <div style={{
                  background: "var(--s1)", border: "1px solid var(--border)",
                  borderRadius: "var(--r-md)", padding: "14px 16px",
                }}>
                  <p style={{ margin: "0 0 10px", fontSize: "0.72rem", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-2)" }}>
                    Profit Impact per Factor
                  </p>
                  <div style={{ height: 220, width: "100%", position: "relative" }}>
                    <FactorProfitChart factors={report.factor_impacts} baseline={report.expected_profit} />
                  </div>
                </div>

                {/* Bankruptcy impact per factor */}
                <div style={{
                  background: "var(--s1)", border: "1px solid var(--border)",
                  borderRadius: "var(--r-md)", padding: "14px 16px",
                }}>
                  <p style={{ margin: "0 0 10px", fontSize: "0.72rem", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-2)" }}>
                    Bankruptcy Risk per Factor
                  </p>
                  <div style={{ height: 220, width: "100%", position: "relative" }}>
                    <FactorBankruptcyChart factors={report.factor_impacts} baseline={report.bankruptcy_probability} />
                  </div>
                </div>
              </div>

              {/* Factor detail rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ margin: "0 0 4px", fontSize: "0.72rem", fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-2)" }}>
                  Factor Details
                </p>
                {report.factor_impacts.map((f) => (
                  <FactorRow key={f.factor} factor={f} />
                ))}
              </div>
            </>
          )}

          {/* ── Math notes ─────────────────────────────────────────────── */}
          <div>
            <p style={{ margin: "0 0 8px", fontSize: "0.72rem", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-2)" }}>
              Mathematical Basis
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {report.mathematical_notes.map((note, idx) => (
                <div key={idx} style={{
                  background: "var(--s0)", border: "1px solid var(--border)",
                  borderLeft: "3px solid rgba(59,130,246,0.4)",
                  borderRadius: "var(--r-xs)", padding: "8px 12px",
                  fontSize: "0.82rem", color: "var(--text-2)", lineHeight: 1.5,
                }}>
                  {note}
                </div>
              ))}
            </div>
          </div>

          {/* ── AI Interpretation ──────────────────────────────────────── */}
          {report.ai_explanation ? (
            <div>
              <p style={{ margin: "0 0 8px", fontSize: "0.72rem", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.07em", color: "#22c55e" }}>
                AI Theoretical Interpretation
              </p>
              <div style={{
                background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.18)",
                borderRadius: "var(--r-md)", padding: "14px 16px",
                fontSize: "0.86rem", lineHeight: 1.6, color: "var(--text)", whiteSpace: "pre-wrap",
              }}>
                {report.ai_explanation}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

// ── Bell curve chart ──────────────────────────────────────────────────────────
function ProfitBellChart({ report }: { report: TheoryReport }) {
  const { xs, ys } = gaussianPoints(report.expected_profit, report.profit_std_dev);

  const ciLow = report.confidence_interval_low;
  const ciHigh = report.confidence_interval_high;
  const mean = report.expected_profit;

  const labels = xs.map((x) => $k(x));

  // shade the CI region green, outside red
  const greenPoints = ys.map((y, i) => (xs[i] >= ciLow && xs[i] <= ciHigh ? y : 0));
  const redLow = ys.map((y, i) => (xs[i] < ciLow ? y : 0));
  const redHigh = ys.map((y, i) => (xs[i] > ciHigh ? y : 0));

  const data = {
    labels,
    datasets: [
      {
        label: "95% CI",
        data: greenPoints,
        borderColor: "rgba(34,197,94,0.6)",
        backgroundColor: "rgba(34,197,94,0.12)",
        fill: true,
        borderWidth: 1,
        pointRadius: 0,
        tension: 0.4,
      },
      {
        label: "Tail",
        data: redLow,
        borderColor: "rgba(239,68,68,0.4)",
        backgroundColor: "rgba(239,68,68,0.10)",
        fill: true,
        borderWidth: 1,
        pointRadius: 0,
        tension: 0.4,
      },
      {
        label: "Tail",
        data: redHigh,
        borderColor: "rgba(239,68,68,0.4)",
        backgroundColor: "rgba(239,68,68,0.10)",
        fill: true,
        borderWidth: 1,
        pointRadius: 0,
        tension: 0.4,
      },
    ],
  };

  // Find index of x=0 and x=mean for annotation lines
  const zeroIdx = xs.findIndex((x) => x >= 0);
  const meanIdx = xs.findIndex((x) => x >= mean);

  const verticalLinesPlugin = {
    id: "vertLines",
    afterDraw(chart: ChartJS) {
      const { ctx, scales } = chart;
      if (!scales.x || !scales.y) return;

      const drawLine = (idx: number, color: string, label: string) => {
        if (idx < 0 || idx >= labels.length) return;
        const x = scales.x.getPixelForValue(idx);
        const top = scales.y.top;
        const bottom = scales.y.bottom;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = "bold 10px Inter, sans-serif";
        ctx.fillText(label, x + 4, top + 12);
        ctx.restore();
      };

      drawLine(zeroIdx, "rgba(255,255,255,0.25)", "$0");
      drawLine(meanIdx, "rgba(96,165,250,0.9)", "μ=" + $k(mean));
    },
  };

  return (
    <div style={{ height: 200, width: "100%", position: "relative" }}>
      <Line
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 400 },
          plugins: { legend: { display: false } },
          scales: {
            ...BASE_SCALES,
            y: {
              ...BASE_SCALES.y,
              ticks: { ...TICK, callback: () => "" },
              grid: { color: GRID },
            },
            x: {
              ...BASE_SCALES.x,
              ticks: { ...TICK, maxTicksLimit: 8, autoSkip: true },
            },
          },
        }}
        plugins={[verticalLinesPlugin]}
      />
    </div>
  );
}

// ── Factor profit chart ───────────────────────────────────────────────────────
function FactorProfitChart({
  factors,
  baseline,
}: {
  factors: FactorImpact[];
  baseline: number;
}) {
  const labels = factors.map((f) => f.factor.replace(" Stress", "").replace(" Event", ""));
  const baseData = factors.map(() => baseline);
  const stressedData = factors.map((f) => f.stressed_avg_profit);

  const data = {
    labels,
    datasets: [
      {
        label: "Baseline",
        data: baseData,
        backgroundColor: "rgba(59,130,246,0.55)",
        borderRadius: 3,
      },
      {
        label: "Stressed",
        data: stressedData,
        backgroundColor: stressedData.map((v) =>
          v < baseline ? "rgba(239,68,68,0.65)" : "rgba(34,197,94,0.65)"
        ),
        borderRadius: 3,
      },
    ],
  };

  return (
    <Bar
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: {
          legend: {
            display: true,
            labels: { color: "rgba(122,144,179,1)", font: { size: 10 }, boxWidth: 12 },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${$k(ctx.parsed.y ?? 0)}`,
            },
          },
        },
        scales: {
          ...BASE_SCALES,
          x: {
            ...BASE_SCALES.x,
            ticks: { ...TICK, maxRotation: 30, autoSkip: false, font: { size: 9 } },
          },
        },
      }}
    />
  );
}

// ── Factor bankruptcy chart ───────────────────────────────────────────────────
function FactorBankruptcyChart({
  factors,
  baseline,
}: {
  factors: FactorImpact[];
  baseline: number;
}) {
  const labels = factors.map((f) => f.factor.replace(" Stress", "").replace(" Event", ""));
  const baseData = factors.map(() => +(baseline * 100).toFixed(1));
  const stressedData = factors.map((f) => +(f.stressed_bankruptcy_probability * 100).toFixed(1));

  const data = {
    labels,
    datasets: [
      {
        label: "Baseline %",
        data: baseData,
        backgroundColor: "rgba(59,130,246,0.55)",
        borderRadius: 3,
      },
      {
        label: "Stressed %",
        data: stressedData,
        backgroundColor: stressedData.map((v) =>
          v > baseline * 100 ? "rgba(239,68,68,0.65)" : "rgba(34,197,94,0.65)"
        ),
        borderRadius: 3,
      },
    ],
  };

  return (
    <Bar
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: {
          legend: {
            display: true,
            labels: { color: "rgba(122,144,179,1)", font: { size: 10 }, boxWidth: 12 },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${(ctx.parsed.y ?? 0).toFixed(1)}%`,
            },
          },
        },
        scales: {
          ...BASE_SCALES,
          x: {
            ...BASE_SCALES.x,
            ticks: { ...TICK, maxRotation: 30, autoSkip: false, font: { size: 9 } },
          },
          y: {
            ...BASE_SCALES.y,
            ticks: {
              ...TICK,
              callback: (v: string | number) => `${v}%`,
            },
          },
        },
      }}
    />
  );
}

// ── Factor detail row ─────────────────────────────────────────────────────────
function FactorRow({ factor: f }: { factor: FactorImpact }) {
  const profitDelta = f.delta_avg_profit;
  const bkDelta = f.delta_bankruptcy_probability * 100;
  const profitColor = profitDelta >= 0 ? "#22c55e" : "#ef4444";
  const bkColor = bkDelta <= 0 ? "#22c55e" : "#ef4444";

  return (
    <div style={{
      background: "var(--s0)", border: "1px solid var(--border)",
      borderRadius: "var(--r-sm)", padding: "10px 14px",
      display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0 16px",
      alignItems: "start",
    }}>
      <div>
        <strong style={{ fontSize: "0.84rem", display: "block", marginBottom: 3 }}>{f.factor}</strong>
        <span style={{ fontSize: "0.78rem", color: "var(--text-2)" }}>{f.explanation}</span>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <span style={{ fontSize: "0.67rem", color: "var(--text-3)", display: "block" }}>Profit Δ</span>
        <strong style={{ fontSize: "0.88rem", color: profitColor }}>{$k(profitDelta)}</strong>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <span style={{ fontSize: "0.67rem", color: "var(--text-3)", display: "block" }}>Bankr. Δ</span>
        <strong style={{ fontSize: "0.88rem", color: bkColor }}>
          {bkDelta > 0 ? "+" : ""}{bkDelta.toFixed(1)}%
        </strong>
      </div>
    </div>
  );
}

export type { TheoryReport };
export default TheoryPage;
