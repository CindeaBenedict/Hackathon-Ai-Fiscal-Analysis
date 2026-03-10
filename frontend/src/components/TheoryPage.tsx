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

function TheoryPage({ report, onGenerate, isLoading }: TheoryPageProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Theory + Real-World Factors</h2>
          <p className="muted">
            Pure math Monte Carlo diagnostics and practical risk factor interpretation.
          </p>
        </div>
        <button className="primary-button" onClick={() => void onGenerate()} disabled={isLoading}>
          {isLoading ? "Computing..." : "Generate Theory Report"}
        </button>
      </div>

      {!report ? (
        <p className="muted">No report yet. Generate one from current simulation settings.</p>
      ) : (
        <>
          <div className="metrics-grid">
            <article className="metric-card">
              <p>Expected Profit</p>
              <strong>{report.expected_profit.toFixed(2)}</strong>
            </article>
            <article className="metric-card">
              <p>Profit Std Dev</p>
              <strong>{report.profit_std_dev.toFixed(2)}</strong>
            </article>
            <article className="metric-card">
              <p>Profit CI</p>
              <strong>
                [{report.confidence_interval_low.toFixed(0)},{" "}
                {report.confidence_interval_high.toFixed(0)}]
              </strong>
            </article>
            <article className="metric-card">
              <p>Bankruptcy CI</p>
              <strong>
                [{(report.bankruptcy_confidence_interval_low * 100).toFixed(1)}%,{" "}
                {(report.bankruptcy_confidence_interval_high * 100).toFixed(1)}%]
              </strong>
            </article>
            <article className="metric-card">
              <p>Required Simulations</p>
              <strong>{report.required_simulations_for_target_error}</strong>
            </article>
          </div>

          <h3>Mathematical Basis</h3>
          <div className="logs-list">
            {report.mathematical_notes.map((note, idx) => (
              <article key={idx} className="log-item">
                {note}
              </article>
            ))}
          </div>

          <h3>Real-World Factor Impacts</h3>
          <div className="logs-list">
            {report.factor_impacts.map((factor) => (
              <article key={factor.factor} className="log-item">
                <header>
                  <strong>{factor.factor}</strong>
                  <span>
                    dProfit {factor.delta_avg_profit.toFixed(0)} | dBankr{" "}
                    {(factor.delta_bankruptcy_probability * 100).toFixed(1)}%
                  </span>
                </header>
                <p className="muted">{factor.explanation}</p>
              </article>
            ))}
          </div>

          {report.ai_explanation ? (
            <>
              <h3>AI Theoretical Interpretation</h3>
              <article className="chat-bubble assistant">
                <p>{report.ai_explanation}</p>
              </article>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

export type { TheoryReport };
export default TheoryPage;
