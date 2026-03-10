export type Strategy = "conservative" | "balanced" | "aggressive" | "custom";

type StrategySelectorProps = {
  strategy: Strategy;
  customOrderQuantity: number;
  simulations: number;
  initialCash: number;
  demandStdDev: number;
  weeklyFixedCost: number;
  bankruptcyThreshold: number;
  salePrice: number;
  aiModel: string;
  onStrategyChange: (value: Strategy) => void;
  onCustomOrderQuantityChange: (value: number) => void;
  onSimulationsChange: (value: number) => void;
  onInitialCashChange: (value: number) => void;
  onDemandStdDevChange: (value: number) => void;
  onWeeklyFixedCostChange: (value: number) => void;
  onBankruptcyThresholdChange: (value: number) => void;
  onSalePriceChange: (value: number) => void;
  onAiModelChange: (value: string) => void;
  onSimulate: () => void;
  isLoading: boolean;
};

function StrategySelector({
  strategy,
  customOrderQuantity,
  simulations,
  initialCash,
  demandStdDev,
  weeklyFixedCost,
  bankruptcyThreshold,
  salePrice,
  aiModel,
  onStrategyChange,
  onCustomOrderQuantityChange,
  onSimulationsChange,
  onInitialCashChange,
  onDemandStdDevChange,
  onWeeklyFixedCostChange,
  onBankruptcyThresholdChange,
  onSalePriceChange,
  onAiModelChange,
  onSimulate,
  isLoading,
}: StrategySelectorProps) {
  const orderQty = strategy === "conservative" ? 150 : strategy === "balanced" ? 120 : strategy === "aggressive" ? 100 : customOrderQuantity;
  const grossMargin = salePrice - 10; // order_cost is $10
  const weeklyGross = 100 * grossMargin; // baseline demand 100
  const weeklyNet = weeklyGross - weeklyFixedCost;
  const marginHealthy = weeklyNet > 0;
  return (
    <section className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Simulation Controls</h2>
        <span style={{
          fontSize: "0.75rem", fontWeight: 600, padding: "4px 10px",
          borderRadius: 999,
          background: marginHealthy ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          border: `1px solid ${marginHealthy ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: marginHealthy ? "#22c55e" : "#ef4444",
        }}>
          Weekly margin: ${weeklyNet.toLocaleString()}/wk {marginHealthy ? "✓ viable" : "⚠ unprofitable"}
        </span>
      </div>
      <div className="controls-grid">
        <label>
          Strategy
          <select
            value={strategy}
            onChange={(event) => onStrategyChange(event.target.value as Strategy)}
          >
            <option value="conservative">Conservative (150 units)</option>
            <option value="balanced">Balanced (120 units)</option>
            <option value="aggressive">Aggressive (100 units)</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        <label>
          Custom Order Quantity
          <input
            type="number"
            min={0}
            value={customOrderQuantity}
            onChange={(event) => onCustomOrderQuantityChange(Number(event.target.value))}
            disabled={strategy !== "custom"}
          />
        </label>

        <label>
          Simulations
          <input
            type="number"
            min={1}
            max={2000}
            value={simulations}
            onChange={(event) => onSimulationsChange(Number(event.target.value))}
          />
        </label>

        <label>
          AI Model
          <input
            type="text"
            value={aiModel}
            onChange={(event) => onAiModelChange(event.target.value)}
            placeholder="llama3.2:1b"
          />
        </label>
        <label>
          Initial Cash
          <input
            type="number"
            min={0}
            value={initialCash}
            onChange={(event) => onInitialCashChange(Number(event.target.value))}
          />
        </label>
        <label>
          Demand Std Dev
          <input
            type="number"
            min={0}
            value={demandStdDev}
            onChange={(event) => onDemandStdDevChange(Number(event.target.value))}
          />
        </label>
        <label>
          Bankruptcy Threshold
          <input
            type="number"
            value={bankruptcyThreshold}
            onChange={(event) => onBankruptcyThresholdChange(Number(event.target.value))}
          />
        </label>
        <label>
          Weekly Fixed Cost ($)
          <input
            type="number"
            min={0}
            value={weeklyFixedCost}
            onChange={(event) => onWeeklyFixedCostChange(Number(event.target.value))}
          />
        </label>
        <label>
          Sale Price ($/unit)
          <input
            type="number"
            min={1}
            value={salePrice}
            onChange={(event) => onSalePriceChange(Number(event.target.value))}
          />
        </label>
      </div>
      <p style={{ fontSize: "0.75rem", color: "var(--text-2)", marginBottom: 12 }}>
        Order cost: $10/unit fixed · Gross margin: ${grossMargin}/unit · {orderQty} units ordered/week
      </p>

      <div className="actions-row">
        <button className="primary-button" onClick={onSimulate} disabled={isLoading}>
          {isLoading ? "Running…" : "Run Simulation"}
        </button>
        <span style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>
          AI advisor starts automatically after simulation
        </span>
      </div>
    </section>
  );
}

export default StrategySelector;
