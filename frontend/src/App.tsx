import { useMemo, useState } from "react";
import ResultsDashboard from "./components/ResultsDashboard";
import SimulationChart from "./components/SimulationChart";
import StrategySelector, { Strategy } from "./components/StrategySelector";

type SimulationResponse = {
  avg_profit: number;
  best_profit: number;
  worst_profit: number;
  stockouts_average: number;
  bankruptcy_probability: number;
  inventory_traces: number[][];
  profits: number[];
};

const API_BASE_URL = "http://127.0.0.1:8000";

function App() {
  const [strategy, setStrategy] = useState<Strategy>("balanced");
  const [customOrderQuantity, setCustomOrderQuantity] = useState<number>(120);
  const [simulations, setSimulations] = useState<number>(100);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [results, setResults] = useState<SimulationResponse | null>(null);

  const canSimulate = useMemo(() => {
    if (simulations < 1) {
      return false;
    }
    if (strategy === "custom" && customOrderQuantity < 0) {
      return false;
    }
    return true;
  }, [customOrderQuantity, simulations, strategy]);

  async function runSimulation() {
    if (!canSimulate) {
      setError("Please provide valid simulation settings.");
      return;
    }

    try {
      setError("");
      setIsLoading(true);

      const response = await fetch(`${API_BASE_URL}/simulate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          strategy,
          order_quantity: strategy === "custom" ? customOrderQuantity : undefined,
          simulations,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Simulation failed: ${text}`);
      }

      const data: SimulationResponse = await response.json();
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header>
        <h1>Brewery Supply Chain Uncertainty Simulator</h1>
        <p>
          Explore how fixed ordering strategies perform under uncertain demand and
          disruptions over a 12-week horizon.
        </p>
      </header>

      <StrategySelector
        strategy={strategy}
        customOrderQuantity={customOrderQuantity}
        simulations={simulations}
        onStrategyChange={setStrategy}
        onCustomOrderQuantityChange={setCustomOrderQuantity}
        onSimulationsChange={setSimulations}
        onSimulate={runSimulation}
        isLoading={isLoading}
      />

      {error ? <p className="error">{error}</p> : null}

      {results ? (
        <>
          <ResultsDashboard metrics={results} />
          <SimulationChart
            inventoryTraces={results.inventory_traces}
            profits={results.profits}
          />
        </>
      ) : null}
    </main>
  );
}

export default App;
