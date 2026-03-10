import { useMemo, useState } from "react";
import LogsPage, { FrontendLogEntry } from "./components/LogsPage";
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

type AIAdvisorResponse = {
  model: string;
  summary: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

function App() {
  const [activePage, setActivePage] = useState<"dashboard" | "logs">("dashboard");
  const [strategy, setStrategy] = useState<Strategy>("balanced");
  const [customOrderQuantity, setCustomOrderQuantity] = useState<number>(120);
  const [simulations, setSimulations] = useState<number>(100);
  const [aiModel, setAiModel] = useState<string>("llama3.2:1b");
  const [isLoading, setIsLoading] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [results, setResults] = useState<SimulationResponse | null>(null);
  const [aiSummary, setAiSummary] = useState<string>("");
  const [logs, setLogs] = useState<FrontendLogEntry[]>([]);

  const canSimulate = useMemo(() => {
    if (simulations < 1) {
      return false;
    }
    if (strategy === "custom" && customOrderQuantity < 0) {
      return false;
    }
    return true;
  }, [customOrderQuantity, simulations, strategy]);

  function pushLog(entry: Omit<FrontendLogEntry, "id" | "timestamp">) {
    setLogs((prev) => [
      {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
      ...prev,
    ]);
  }

  async function runSimulation() {
    if (!canSimulate) {
      setError("Please provide valid simulation settings.");
      return;
    }

    try {
      setError("");
      setIsLoading(true);

      const requestPayload = {
        strategy,
        order_quantity: strategy === "custom" ? customOrderQuantity : undefined,
        simulations,
      };
      const response = await fetch(`${API_BASE_URL}/simulate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const text = await response.text();
        pushLog({
          action: "simulation.failed",
          request: requestPayload,
          error: text,
          level: "error",
        });
        throw new Error(`Simulation failed: ${text}`);
      }

      const data: SimulationResponse = await response.json();
      setResults(data);
      pushLog({
        action: "simulation.completed",
        request: requestPayload,
        response: {
          avg_profit: data.avg_profit,
          best_profit: data.best_profit,
          worst_profit: data.worst_profit,
        },
        level: "success",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setIsLoading(false);
    }
  }

  async function runAiAdvisor() {
    if (!canSimulate) {
      setError("Please provide valid simulation settings.");
      return;
    }

    try {
      setError("");
      setIsAiLoading(true);
      const requestPayload = {
        strategy,
        order_quantity: strategy === "custom" ? customOrderQuantity : undefined,
        simulations,
        model: aiModel,
      };
      const response = await fetch(`${API_BASE_URL}/ai/advisor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      if (!response.ok) {
        const text = await response.text();
        pushLog({
          action: "ai.advisor.failed",
          request: requestPayload,
          error: text,
          level: "error",
        });
        throw new Error(`AI advisor failed: ${text}`);
      }
      const data: AIAdvisorResponse = await response.json();
      setAiSummary(data.summary);
      pushLog({
        action: "ai.advisor.completed",
        request: requestPayload,
        response: data,
        level: "info",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setIsAiLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Supply Chain Decision Studio</h1>
          <p>Monte Carlo planning with AI-assisted risk interpretation.</p>
        </div>
        <nav className="nav-tabs">
          <button
            className={activePage === "dashboard" ? "tab-active" : ""}
            onClick={() => setActivePage("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={activePage === "logs" ? "tab-active" : ""}
            onClick={() => setActivePage("logs")}
          >
            AI Logs
          </button>
        </nav>
      </header>

      {activePage === "dashboard" ? (
        <>
          <StrategySelector
            strategy={strategy}
            customOrderQuantity={customOrderQuantity}
            simulations={simulations}
            aiModel={aiModel}
            onStrategyChange={setStrategy}
            onCustomOrderQuantityChange={setCustomOrderQuantity}
            onSimulationsChange={setSimulations}
            onAiModelChange={setAiModel}
            onSimulate={runSimulation}
            onRunAiAdvisor={runAiAdvisor}
            isLoading={isLoading}
            isAiLoading={isAiLoading}
          />

          {error ? <p className="error">{error}</p> : null}

          {aiSummary ? (
            <section className="panel ai-summary">
              <h2>AI Advisor Insight</h2>
              <p>{aiSummary}</p>
            </section>
          ) : null}

          {results ? (
        <>
          <ResultsDashboard metrics={results} />
          <SimulationChart
            inventoryTraces={results.inventory_traces}
            profits={results.profits}
          />
        </>
          ) : null}
        </>
      ) : (
        <LogsPage logs={logs} onClear={() => setLogs([])} />
      )}
    </main>
  );
}

export default App;
