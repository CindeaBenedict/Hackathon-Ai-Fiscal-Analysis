type Metrics = {
  avg_profit: number;
  best_profit: number;
  worst_profit: number;
  profit_p10?: number;
  profit_p50?: number;
  profit_p90?: number;
  stockouts_average: number;
  bankruptcy_probability: number;
  bankruptcy_count: number;
};

type ResultsDashboardProps = {
  metrics: Metrics;
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function card(label: string, value: string, accent?: "green" | "red" | "yellow") {
  const colors: Record<string, string> = {
    green: "#22c55e", red: "#ef4444", yellow: "#f59e0b",
  };
  return (
    <article className="metric-card">
      <p>{label}</p>
      <strong style={accent ? { color: colors[accent] } : undefined}>{value}</strong>
    </article>
  );
}

function ResultsDashboard({ metrics }: ResultsDashboardProps) {
  const bkPct = (metrics.bankruptcy_probability * 100).toFixed(1);
  const avgAccent = metrics.avg_profit >= 0 ? "green" : "red";
  const bkAccent = metrics.bankruptcy_probability > 0.1 ? "red" : metrics.bankruptcy_probability > 0.03 ? "yellow" : "green";

  return (
    <section className="panel">
      <h2>Key Metrics</h2>
      <div className="metrics-grid">
        {card("Average Profit", currency.format(metrics.avg_profit), avgAccent)}
        {metrics.profit_p10 != null && card("P10 (bad case)", currency.format(metrics.profit_p10), metrics.profit_p10 < 0 ? "red" : undefined)}
        {metrics.profit_p50 != null && card("P50 (median)", currency.format(metrics.profit_p50), metrics.profit_p50 >= 0 ? "green" : "red")}
        {metrics.profit_p90 != null && card("P90 (good case)", currency.format(metrics.profit_p90), "green")}
        {card("Worst Run", currency.format(metrics.worst_profit), "red")}
        {card("Best Run", currency.format(metrics.best_profit), "green")}
        {card("Bankruptcy Rate", `${bkPct}%`, bkAccent)}
        {card("Bankruptcy Runs", String(metrics.bankruptcy_count))}
        {card("Avg Weekly Stockouts", metrics.stockouts_average.toFixed(2))}
      </div>
    </section>
  );
}

export default ResultsDashboard;
