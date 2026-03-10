type Metrics = {
  avg_profit: number;
  best_profit: number;
  worst_profit: number;
  stockouts_average: number;
  bankruptcy_probability: number;
};

type ResultsDashboardProps = {
  metrics: Metrics;
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function ResultsDashboard({ metrics }: ResultsDashboardProps) {
  return (
    <section className="panel">
      <h2>Key Metrics</h2>
      <div className="metrics-grid">
        <article className="metric-card">
          <p>Average Profit</p>
          <strong>{currency.format(metrics.avg_profit)}</strong>
        </article>
        <article className="metric-card">
          <p>Worst Case</p>
          <strong>{currency.format(metrics.worst_profit)}</strong>
        </article>
        <article className="metric-card">
          <p>Best Case</p>
          <strong>{currency.format(metrics.best_profit)}</strong>
        </article>
        <article className="metric-card">
          <p>Bankruptcy Probability</p>
          <strong>{(metrics.bankruptcy_probability * 100).toFixed(1)}%</strong>
        </article>
        <article className="metric-card">
          <p>Average Weekly Stockouts</p>
          <strong>{metrics.stockouts_average.toFixed(2)}</strong>
        </article>
      </div>
    </section>
  );
}

export default ResultsDashboard;
