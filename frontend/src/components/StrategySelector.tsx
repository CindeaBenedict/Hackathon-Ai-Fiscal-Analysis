export type Strategy = "conservative" | "balanced" | "aggressive" | "custom";

type StrategySelectorProps = {
  strategy: Strategy;
  customOrderQuantity: number;
  simulations: number;
  onStrategyChange: (value: Strategy) => void;
  onCustomOrderQuantityChange: (value: number) => void;
  onSimulationsChange: (value: number) => void;
  onSimulate: () => void;
  isLoading: boolean;
};

function StrategySelector({
  strategy,
  customOrderQuantity,
  simulations,
  onStrategyChange,
  onCustomOrderQuantityChange,
  onSimulationsChange,
  onSimulate,
  isLoading,
}: StrategySelectorProps) {
  return (
    <section className="panel">
      <h2>Simulation Controls</h2>
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
      </div>

      <button className="primary-button" onClick={onSimulate} disabled={isLoading}>
        {isLoading ? "Running..." : "Simulate"}
      </button>
    </section>
  );
}

export default StrategySelector;
