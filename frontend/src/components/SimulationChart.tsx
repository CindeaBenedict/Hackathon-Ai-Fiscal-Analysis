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
  Legend,
  Filler,
);

type SimulationChartProps = {
  inventoryTraces: number[][];
  profits: number[];
};

function buildInventoryDatasets(inventoryTraces: number[][]) {
  // Plot up to 10 traces to keep the chart compact.
  const sampled = inventoryTraces.slice(0, 10);
  return sampled.map((trace, index) => ({
    label: `Run ${index + 1}`,
    data: trace,
    borderColor: "rgba(37, 99, 235, 0.25)",
    backgroundColor: "rgba(37, 99, 235, 0.05)",
    borderWidth: 1,
    pointRadius: 0,
    fill: false,
  }));
}

function SimulationChart({ inventoryTraces, profits }: SimulationChartProps) {
  const weekLabels =
    inventoryTraces.length > 0
      ? Array.from({ length: inventoryTraces[0].length }, (_, i) => `W${i}`)
      : [];

  const inventoryData = {
    labels: weekLabels,
    datasets: buildInventoryDatasets(inventoryTraces),
  };

  const profitLabels = profits.map((_, i) => `Run ${i + 1}`);
  const profitData = {
    labels: profitLabels,
    datasets: [
      {
        label: "Final Profit",
        data: profits,
        backgroundColor: profits.map((value) =>
          value >= 0 ? "rgba(22, 163, 74, 0.7)" : "rgba(220, 38, 38, 0.7)",
        ),
      },
    ],
  };

  return (
    <section className="panel">
      <h2>Simulation Outputs</h2>
      <div className="chart-grid">
        <div className="chart-card">
          <h3>Inventory Over 12 Weeks</h3>
          <Line
            data={inventoryData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
            }}
          />
        </div>
        <div className="chart-card">
          <h3>Profit Distribution</h3>
          <Bar
            data={profitData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
            }}
          />
        </div>
      </div>
    </section>
  );
}

export default SimulationChart;
