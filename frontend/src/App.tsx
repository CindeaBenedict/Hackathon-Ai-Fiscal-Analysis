import React, { useEffect, useMemo, useRef, useState } from "react";
import LogsPage, { BackendAILog, FrontendLogEntry } from "./components/LogsPage";
import AnalysisDashboard, { SimChatMessage, SimulationResults } from "./components/AnalysisDashboard";
import StrategySelector, { Strategy } from "./components/StrategySelector";
import TheoryPage, { TheoryReport } from "./components/TheoryPage";
import SettingsPage from "./components/SettingsPage";

type SimulationResponse = SimulationResults;

type AuthResponse = {
  token: string;
  username: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

const DEFAULT_ORDER_BY_STRATEGY: Record<Strategy, number> = {
  conservative: 120,
  balanced: 100,
  aggressive: 80,
  custom: 100,
  ai_recommended: 100,
};

function App() {
  const [activePage, setActivePage] = useState<
    "dashboard" | "logs" | "theory" | "settings"
  >("dashboard");
  const [darkMode, setDarkMode] = useState(true);
  const [strategy, setStrategy] = useState<Strategy>("custom");
  const [customOrderQuantity, setCustomOrderQuantity] = useState<number>(100);
  const [simulations, setSimulations] = useState<number>(500);
  const [initialCash, setInitialCash] = useState<number>(5000);
  const [demandStdDev, setDemandStdDev] = useState<number>(25);
  const [weeklyFixedCost, setWeeklyFixedCost] = useState<number>(3200);
  const [bankruptcyThreshold, setBankruptcyThreshold] = useState<number>(500);
  const [salePrice, setSalePrice] = useState<number>(50);
  const [aiModel, setAiModel] = useState<string>("llama3.2:1b");
  const [isLoading, setIsLoading] = useState(false);
  const [isTheoryLoading, setIsTheoryLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [results, setResults] = useState<SimulationResponse | null>(null);
  const [simChat, setSimChat] = useState<SimChatMessage[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [logs, setLogs] = useState<FrontendLogEntry[]>([]);
  const [backendLogs, setBackendLogs] = useState<BackendAILog[]>([]);
  const [theoryReport, setTheoryReport] = useState<TheoryReport | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(
    localStorage.getItem("auth_token"),
  );
  const [username, setUsername] = useState<string>(localStorage.getItem("auth_user") || "");
  const [authBootstrapLoading, setAuthBootstrapLoading] = useState(false);
  const [bootstrapRetry, setBootstrapRetry] = useState(0);
  const bootstrapStarted = useRef(false);
  const simulationAbortRef = useRef<AbortController | null>(null);
  const railItems: Array<{
    id: "dashboard" | "logs" | "theory" | "settings";
    title: string;
    icon: React.ReactNode;
  }> = [
    {
      id: "dashboard",
      title: "Dashboard",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="2" y="2" width="7" height="7" rx="1.5" />
          <rect x="11" y="2" width="7" height="7" rx="1.5" />
          <rect x="2" y="11" width="7" height="7" rx="1.5" />
          <rect x="11" y="11" width="7" height="7" rx="1.5" />
        </svg>
      ),
    },
    {
      id: "logs",
      title: "AI Logs",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <polyline points="4,6 7.5,10 4,14" />
          <line x1="10" y1="14" x2="16" y2="14" />
          <line x1="10" y1="10" x2="16" y2="10" />
          <line x1="10" y1="6"  x2="16" y2="6" />
        </svg>
      ),
    },
    {
      id: "theory",
      title: "Theory",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M6 3h8L11 10l3 7H6l3-7L6 3z" />
        </svg>
      ),
    },
    {
      id: "settings",
      title: "Settings",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="10" cy="10" r="2.5" />
          <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41" />
        </svg>
      ),
    },
  ];

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

  function authFetch(url: string, init?: RequestInit) {
    const headers = new Headers(init?.headers || {});
    if (authToken) {
      headers.set("Authorization", `Bearer ${authToken}`);
    }
    return fetch(url, { ...init, headers }).then((res) => {
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
        bootstrapStarted.current = false;
        setAuthToken(null);
        setBootstrapRetry((r) => r + 1);
      }
      return res;
    });
  }

  async function runSimulation() {
    if (!canSimulate && strategy !== "ai_recommended") {
      setError("Please provide valid simulation settings.");
      return;
    }
    if (strategy === "ai_recommended" && simulations < 1) {
      setError("Please set simulations to at least 1.");
      return;
    }

    const controller = new AbortController();
    simulationAbortRef.current = controller;

    try {
      setError("");
      setIsLoading(true);

      let effectiveStrategy: Strategy = strategy;
      let effectiveOrderQuantity: number | undefined =
        strategy === "custom" ? customOrderQuantity : undefined;

      if (strategy === "ai_recommended") {
        const recommendRes = await authFetch(`${API_BASE_URL}/ai/recommend-order-for-simulation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: aiModel,
            baseline_demand: 100,
            demand_std_dev: demandStdDev,
            initial_cash: initialCash,
            initial_inventory: 150,
            sale_price: salePrice,
            order_cost: 10,
            holding_cost: 2,
            stockout_penalty: 25,
            weekly_fixed_cost: weeklyFixedCost,
            bankruptcy_cash_threshold: bankruptcyThreshold,
            weeks: 12,
          }),
        });
        if (!recommendRes.ok) {
          const text = await recommendRes.text();
          pushLog({
            action: "ai.recommend_order.failed",
            request: {},
            error: text,
            level: "error",
          });
          throw new Error(`AI recommendation failed: ${text}`);
        }
        const recommendData = (await recommendRes.json()) as {
          recommended_order_quantity: number;
          model: string;
        };
        effectiveOrderQuantity = recommendData.recommended_order_quantity;
        setCustomOrderQuantity(recommendData.recommended_order_quantity);
        effectiveStrategy = "custom";
        pushLog({
          action: "ai.recommend_order.success",
          request: { model: aiModel },
          response: recommendData,
          level: "info",
        });
      }

      const requestPayload = {
        strategy: effectiveStrategy,
        order_quantity: effectiveStrategy === "custom" ? effectiveOrderQuantity : undefined,
        simulations,
        initial_cash: initialCash,
        demand_std_dev: demandStdDev,
        weekly_fixed_cost: weeklyFixedCost,
        bankruptcy_cash_threshold: bankruptcyThreshold,
        sale_price: salePrice,
      };
      const response = await authFetch(`${API_BASE_URL}/simulate/stable`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
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
      setSimChat([]);
      pushLog({
        action: "simulation.completed",
        request: requestPayload,
        response: {
          avg_profit: data.avg_profit,
          best_profit: data.best_profit,
          worst_profit: data.worst_profit,
          bankruptcy_probability: data.bankruptcy_probability,
          bankruptcy_count: data.bankruptcy_count,
          actual_simulations: data.actual_simulations,
        },
        level: "success",
      });

      // Initial AI analysis from the math results (non-blocking)
      fetchInitialAdvisorSummary(data);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Simulation stopped.");
        pushLog({
          action: "simulation.stopped",
          request: {},
          level: "info",
        });
      } else {
        setError(err instanceof Error ? err.message : "Unknown error.");
      }
    } finally {
      setIsLoading(false);
      simulationAbortRef.current = null;
    }
  }

  function stopSimulation() {
    if (simulationAbortRef.current) {
      simulationAbortRef.current.abort();
    }
  }

  function fetchInitialAdvisorSummary(simData: SimulationResponse) {
    setSimChat([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Analyzing results…",
      },
    ]);
    const payload = {
      model: aiModel,
      strategy,
      simulations: simData.actual_simulations ?? simulations,
      avg_profit: simData.avg_profit,
      profit_p10: simData.profit_p10 ?? undefined,
      profit_p50: simData.profit_p50 ?? undefined,
      profit_p90: simData.profit_p90 ?? undefined,
      worst_profit: simData.worst_profit,
      best_profit: simData.best_profit,
      bankruptcy_probability: simData.bankruptcy_probability,
      bankruptcy_count: simData.bankruptcy_count,
      stockouts_average: simData.stockouts_average,
    };
    authFetch(`${API_BASE_URL}/ai/advisor-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!res.ok) return res.text().then((t) => Promise.reject(new Error(t)));
        return res.json() as Promise<{ model: string; summary: string }>;
      })
      .then((body) => {
        setSimChat([
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: body.summary || "No summary generated.",
          },
        ]);
      })
      .catch(() => {
        setSimChat([
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Initial analysis could not be loaded. You can ask a question below.",
          },
        ]);
      });
  }

  async function sendSimChat(message: string, latestResults?: SimulationResponse) {
    const activeResults = latestResults ?? results;
    if (!activeResults) return;

    const userMsg: SimChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
    };
    setSimChat((prev) => [...prev, userMsg]);

    try {
      setIsAiLoading(true);
      const history = simChat.map((m) => ({ role: m.role, content: m.content }));

      const payload = {
        message,
        model: aiModel,
        history,
        strategy,
        simulations: activeResults.actual_simulations ?? simulations,
        avg_profit: activeResults.avg_profit,
        worst_profit: activeResults.worst_profit,
        best_profit: activeResults.best_profit,
        profit_std_dev: activeResults.profit_std_dev,
        profit_p10: activeResults.profit_p10,
        profit_p50: activeResults.profit_p50,
        profit_p90: activeResults.profit_p90,
        profit_p05: activeResults.profit_p05,
        stockouts_average: activeResults.stockouts_average,
        bankruptcy_probability: activeResults.bankruptcy_probability,
        bankruptcy_count: activeResults.bankruptcy_count,
        actual_simulations: activeResults.actual_simulations,
        sale_price: salePrice,
        weekly_fixed_cost: weeklyFixedCost,
        order_cost: 10,
        initial_cash: initialCash,
        bankruptcy_cash_threshold: bankruptcyThreshold,
      };

      const response = await authFetch(`${API_BASE_URL}/ai/sim-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        pushLog({ action: "ai.sim_chat.failed", request: { message }, error: text, level: "error" });
        const errMsg: SimChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Could not reach AI: ${text}`,
        };
        setSimChat((prev) => [...prev, errMsg]);
        return;
      }

      const data = (await response.json()) as { model: string; answer: string };
      const aiMsg: SimChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer,
      };
      setSimChat((prev) => [...prev, aiMsg]);
      pushLog({ action: "ai.sim_chat.success", request: { message }, response: data, level: "info" });
    } catch (err) {
      const errMsg: SimChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
      setSimChat((prev) => [...prev, errMsg]);
    } finally {
      setIsAiLoading(false);
    }
  }

  async function loadBackendLogs() {
    try {
      const response = await authFetch(`${API_BASE_URL}/ai/logs`);
      if (!response.ok) return;
      const data = (await response.json()) as BackendAILog[];
      setBackendLogs(data);
    } catch {
      // silently ignore — auto-refresh will retry
    }
  }

  async function clearBackendLogs() {
    await authFetch(`${API_BASE_URL}/ai/logs`, { method: "DELETE" });
    setBackendLogs([]);
  }

  async function generateTheoryReport() {
    try {
      setError("");
      setIsTheoryLoading(true);
      const payload = {
        strategy,
        order_quantity: strategy === "custom" ? customOrderQuantity : undefined,
        simulations,
        initial_cash: initialCash,
        demand_std_dev: demandStdDev,
        weekly_fixed_cost: weeklyFixedCost,
        bankruptcy_cash_threshold: bankruptcyThreshold,
        model: aiModel,
        confidence_level: 0.95,
        target_margin_of_error: 1000,
      };
      const response = await authFetch(`${API_BASE_URL}/theory/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const text = await response.text();
        pushLog({
          action: "theory.report.failed",
          request: payload,
          error: text,
          level: "error",
        });
        throw new Error(text);
      }
      const data = (await response.json()) as TheoryReport;
      setTheoryReport(data);
      pushLog({
        action: "theory.report.success",
        request: payload,
        response: {
          expected_profit: data.expected_profit,
          required_simulations_for_target_error:
            data.required_simulations_for_target_error,
        },
        level: "success",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate theory report.");
    } finally {
      setIsTheoryLoading(false);
    }
  }

  // Run once on mount. useRef prevents double-fire in React StrictMode dev.
  useEffect(() => {
    if (authToken || bootstrapStarted.current) return;
    bootstrapStarted.current = true;

    const BOOTSTRAP_TIMEOUT_MS = 15000;

    async function initGuest() {
      setAuthBootstrapLoading(true);
      setError("");
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), BOOTSTRAP_TIMEOUT_MS);
      try {
        const res = await fetch(`${API_BASE_URL}/auth/guest`, {
          method: "POST",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as AuthResponse;
        setAuthToken(data.token);
        setUsername(data.username);
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("auth_user", data.username);
      } catch (err) {
        clearTimeout(timeoutId);
        bootstrapStarted.current = false; // allow retry on error
        const message =
          err instanceof Error && err.name === "AbortError"
            ? "Backend did not respond in time. Check that the API URL is correct and CORS allows this origin."
            : err instanceof Error
              ? err.message
              : "Failed to start session.";
        setError(message);
      } finally {
        setAuthBootstrapLoading(false);
      }
    }
    void initGuest();
  }, [bootstrapRetry]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authToken) {
      return;
    }
    if (activePage === "logs") {
      void loadBackendLogs();
    }
  }, [activePage, authToken]);

  if (!authToken) {
    return (
      <div className={darkMode ? "" : "theme-light"}>
        <div className="splash-screen">
          <div className="splash-card">
            <div className="splash-logo">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <h2>Supply Chain Command</h2>
            {error ? (
              <>
                <p className="error" style={{ marginTop: 8, marginBottom: 12 }}>{error}</p>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    bootstrapStarted.current = false;
                    setError("");
                    setBootstrapRetry((r) => r + 1);
                  }}
                >
                  Retry
                </button>
              </>
            ) : (
              <>
                <p>Initializing your workspace&hellip;</p>
                <div className="spinner" />
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell ${darkMode ? "" : "theme-light"}`}>
      <aside className="side-rail">
        <div className="rail-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
        </div>
        {railItems.map((item) => (
          <button
            key={item.id}
            className={`rail-button ${activePage === item.id ? "active" : ""}`}
            title={item.title}
            onClick={() => setActivePage(item.id)}
          >
            {item.icon}
          </button>
        ))}
      </aside>

      <section className="content-area">
        <header className="topbar">
          <div className="topbar-brand">
            <span className="topbar-title">Supply Chain Command</span>
            <span className="topbar-sub">Monte Carlo · AI Planning · Risk Analysis</span>
          </div>
          <div className="topbar-right">
            <span className="status-pill">LIVE</span>
            <button className="secondary-button" onClick={() => setDarkMode((v) => !v)}>
              {darkMode ? "Light" : "Dark"}
            </button>
          </div>
        </header>

        <nav className="nav-tabs">
          {railItems.map((item) => (
            <button
              key={item.id}
              className={activePage === item.id ? "tab-active" : ""}
              onClick={() => setActivePage(item.id)}
            >
              {item.title}
            </button>
          ))}
        </nav>

        <div className="page-body">
          {activePage === "dashboard" ? (
            <>
              <StrategySelector
                strategy={strategy}
                customOrderQuantity={customOrderQuantity}
                simulations={simulations}
                initialCash={initialCash}
                demandStdDev={demandStdDev}
                weeklyFixedCost={weeklyFixedCost}
                bankruptcyThreshold={bankruptcyThreshold}
                salePrice={salePrice}
                aiModel={aiModel}
                onStrategyChange={(s) => {
                  setStrategy(s);
                  if (s !== "custom") {
                    setCustomOrderQuantity(DEFAULT_ORDER_BY_STRATEGY[s]);
                  }
                }}
                onCustomOrderQuantityChange={setCustomOrderQuantity}
                onSimulationsChange={setSimulations}
                onInitialCashChange={setInitialCash}
                onDemandStdDevChange={setDemandStdDev}
                onWeeklyFixedCostChange={setWeeklyFixedCost}
                onBankruptcyThresholdChange={setBankruptcyThreshold}
                onSalePriceChange={setSalePrice}
                onAiModelChange={setAiModel}
                onSimulate={runSimulation}
                onStop={stopSimulation}
                isLoading={isLoading}
                apiBaseUrl={API_BASE_URL}
              />
              {error ? <p className="error">{error}</p> : null}
              {results ? (
                <AnalysisDashboard
                  key={`${results.actual_simulations ?? 0}-${results.avg_profit}-${results.profits.length}`}
                  results={results}
                  chatMessages={simChat}
                  isAiLoading={isAiLoading}
                  aiModel={aiModel}
                  onSendMessage={(msg) => void sendSimChat(msg)}
                />
              ) : null}
            </>
          ) : null}

          {activePage === "logs" ? (
            <LogsPage
              logs={logs}
              backendLogs={backendLogs}
              onClearLocal={() => setLogs([])}
              onClearBackend={clearBackendLogs}
              onRefreshBackend={loadBackendLogs}
            />
          ) : null}

          {activePage === "theory" ? (
            <TheoryPage
              report={theoryReport}
              onGenerate={generateTheoryReport}
              isLoading={isTheoryLoading}
            />
          ) : null}

          {activePage === "settings" ? (
            <SettingsPage authToken={authToken} apiBaseUrl={API_BASE_URL} onAuthError={() => {
              localStorage.removeItem("auth_token");
              localStorage.removeItem("auth_user");
              bootstrapStarted.current = false;
              setAuthToken(null);
              setBootstrapRetry((r) => r + 1);
            }} />
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default App;
