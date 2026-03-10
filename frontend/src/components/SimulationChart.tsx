import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Filler,
);

type SimulationChartProps = {
  inventoryTraces: number[][];
  profits: number[];
};

const CHART_COLORS = {
  blue: "rgba(59,130,246,0.7)",
  blueDim: "rgba(59,130,246,0.18)",
  green: "rgba(34,197,94,0.75)",
  red: "rgba(239,68,68,0.75)",
  grid: "rgba(255,255,255,0.05)",
  text: "rgba(122,144,179,1)",
};

const BASE_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 400 },
  plugins: { legend: { display: false }, tooltip: { mode: "index" as const } },
  scales: {
    x: {
      grid: { color: CHART_COLORS.grid },
      ticks: { color: CHART_COLORS.text, font: { size: 10 } },
    },
    y: {
      grid: { color: CHART_COLORS.grid },
      ticks: { color: CHART_COLORS.text, font: { size: 10 } },
    },
  },
};

// ── Histogram helper ──────────────────────────────────────────────────────────
function buildHistogram(values: number[], bins = 22) {
  if (!values.length) return { labels: [], counts: [], colors: [] };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binSize = (max - min) / bins || 1;
  const counts = Array(bins).fill(0);
  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / binSize), bins - 1);
    counts[idx]++;
  }
  const labels = counts.map((_, i) => {
    const lo = min + i * binSize;
    const k = Math.abs(lo) >= 1000 ? `${(lo / 1000).toFixed(1)}k` : lo.toFixed(0);
    return `$${k}`;
  });
  const colors = counts.map((_, i) => {
    const midpoint = min + (i + 0.5) * binSize;
    return midpoint >= 0 ? CHART_COLORS.green : CHART_COLORS.red;
  });
  return { labels, counts, colors };
}

export default function SimulationChart({ inventoryTraces, profits }: SimulationChartProps) {
  const traces = inventoryTraces.slice(0, 12);
  const weekLabels =
    traces.length > 0
      ? Array.from({ length: traces[0].length }, (_, i) => (i === 0 ? "Start" : `W${i}`))
      : [];

  const inventoryData = {
    labels: weekLabels,
    datasets: traces.map((trace, i) => ({
      label: `Run ${i + 1}`,
      data: trace,
      borderColor:
        i === 0
          ? "rgba(59,130,246,0.65)"
          : i === 1
          ? "rgba(239,68,68,0.55)"
          : "rgba(148,163,184,0.18)",
      backgroundColor: "transparent",
      borderWidth: i < 2 ? 1.5 : 1,
      pointRadius: 0,
      fill: false,
      tension: 0.3,
    })),
  };

  const { labels: hLabels, counts: hCounts, colors: hColors } = buildHistogram(profits);
  const histData = {
    labels: hLabels,
    datasets: [
      {
        label: "Runs",
        data: hCounts,
        backgroundColor: hColors,
        borderRadius: 2,
        barPercentage: 0.95,
        categoryPercentage: 1.0,
      },
    ],
  };

  const zeroLinePlugin = {
    id: "zeroLine",
    afterDraw(chart: ChartJS) {
      const { ctx, scales } = chart;
      if (!scales.y) return;
      const y = scales.y.getPixelForValue(0);
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(scales.x.left, y);
      ctx.lineTo(scales.x.right, y);
      ctx.stroke();
      ctx.restore();
    },
  };

  return (
    <section className="panel">
      <h2>Simulation Outputs</h2>
      <div style={{ display: "grid", gap: 14 }}>
        {/* Inventory traces */}
        <div style={{
          background: "var(--s1)", border: "1px solid var(--border)",
          borderRadius: "var(--r-md)", padding: "14px 16px",
        }}>
          <p style={{ margin: "0 0 10px", fontSize: "0.72rem", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-2)" }}>
            Inventory over 12 weeks — sample of {traces.length} runs
          </p>
          {/* height must be set on the wrapper, not the chart, for maintainAspectRatio:false */}
          <div style={{ height: 200, width: "100%", position: "relative" }}>
            <Line data={inventoryData} options={BASE_OPTIONS} />
          </div>
        </div>

        {/* Profit histogram */}
        <div style={{
          background: "var(--s1)", border: "1px solid var(--border)",
          borderRadius: "var(--r-md)", padding: "14px 16px",
        }}>
          <p style={{ margin: "0 0 10px", fontSize: "0.72rem", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-2)" }}>
            Profit distribution — {profits.length.toLocaleString()} runs &nbsp;·&nbsp;
            <span style={{ color: "#22c55e" }}>■</span> profit &nbsp;
            <span style={{ color: "#ef4444" }}>■</span> loss
          </p>
          <div style={{ height: 200, width: "100%", position: "relative" }}>
            <Bar
              data={histData}
              options={{
                ...BASE_OPTIONS,
                scales: {
                  ...BASE_OPTIONS.scales,
                  x: {
                    ...BASE_OPTIONS.scales.x,
                    ticks: {
                      color: CHART_COLORS.text,
                      font: { size: 9 },
                      maxRotation: 35,
                      autoSkip: true,
                      maxTicksLimit: 12,
                    },
                  },
                },
              }}
              plugins={[zeroLinePlugin]}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
