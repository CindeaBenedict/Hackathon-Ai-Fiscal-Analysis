import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
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
  Legend,
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
function buildHistogram(values: number[], bins = 22, binEdges?: { min: number; max: number }) {
  if (!values.length) return { labels: [] as string[], counts: [] as number[], colors: [] as string[] };
  const min = binEdges ? binEdges.min : Math.min(...values);
  const max = binEdges ? binEdges.max : Math.max(...values);
  const binSize = (max - min) / bins || 1;
  const counts = Array(bins).fill(0);
  for (const v of values) {
    const idx = Math.min(Math.max(0, Math.floor((v - min) / binSize)), bins - 1);
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
  const sampledProfits = profits.slice(0, traces.length);
  let bestTraceIdx = -1;
  let worstTraceIdx = -1;
  if (sampledProfits.length > 0) {
    bestTraceIdx = 0;
    worstTraceIdx = 0;
    for (let i = 1; i < sampledProfits.length; i++) {
      if (sampledProfits[i] > sampledProfits[bestTraceIdx]) bestTraceIdx = i;
      if (sampledProfits[i] < sampledProfits[worstTraceIdx]) worstTraceIdx = i;
    }
  }
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
        i === bestTraceIdx
          ? "rgba(59,130,246,0.75)"
          : i === worstTraceIdx
          ? "rgba(239,68,68,0.75)"
          : "rgba(148,163,184,0.18)",
      backgroundColor: "transparent",
      borderWidth: i === bestTraceIdx || i === worstTraceIdx ? 1.6 : 1,
      pointRadius: 0,
      fill: false,
      tension: 0.3,
    })),
  };

  const bins = 22;
  const { labels: hLabels, counts: hCounts, colors: hColors } = buildHistogram(profits, bins);
  const histData = {
    labels: hLabels,
    datasets: [
      {
        label: "Monte Carlo",
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
      <p style={{ margin: "0 0 14px", fontSize: "0.72rem", color: "var(--text-2)" }}>
        <span style={{ color: "#60a5fa", fontWeight: 600 }}>■ Monte Carlo</span>
        {" "}({profits.length.toLocaleString()} runs)
      </p>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{
          background: "var(--s1)",
          border: "1px solid rgba(59,130,246,0.22)",
          borderLeft: "4px solid #3b82f6",
          borderRadius: "var(--r-md)",
          padding: "14px 16px",
        }}>
          <p style={{ margin: "0 0 10px", fontSize: "0.72rem", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.07em", color: "#60a5fa" }}>
            Monte Carlo — Inventory over 12 weeks (sample of {traces.length} runs)
          </p>
          <div style={{ height: 200, width: "100%", position: "relative" }}>
            <Line data={inventoryData} options={BASE_OPTIONS} />
          </div>
        </div>

        <div style={{
          background: "var(--s1)",
          border: "1px solid rgba(59,130,246,0.22)",
          borderLeft: "4px solid #3b82f6",
          borderRadius: "var(--r-md)",
          padding: "14px 16px",
        }}>
          <p style={{ margin: "0 0 10px", fontSize: "0.72rem", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.07em", color: "#60a5fa" }}>
            Profit distribution ({profits.length.toLocaleString()} runs)
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
