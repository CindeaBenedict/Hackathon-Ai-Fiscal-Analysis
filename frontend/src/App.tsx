import React, { useEffect, useMemo, useRef, useState } from "react";
import DataChatPage, { ChatMessage } from "./components/DataChatPage";
import DataUploadPage, { DataFileSummary } from "./components/DataUploadPage";
import LogsPage, { BackendAILog, FrontendLogEntry } from "./components/LogsPage";
import AnalysisDashboard, { SimChatMessage, SimulationResults } from "./components/AnalysisDashboard";
import StrategySelector, { Strategy } from "./components/StrategySelector";
import TheoryPage, { TheoryReport } from "./components/TheoryPage";

type SimulationResponse = SimulationResults;


type DataChatResponse = {
  model: string;
  answer: string;
};

type AuthResponse = {
  token: string;
  username: string;
};

type ProcessFileResponse = {
  file_id: string;
  inferred_mapping: Record<string, unknown>;
  processed_row_count: number;
  processed_sample_rows: Record<string, unknown>[];
  ai_notes?: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

function App() {
  const [activePage, setActivePage] = useState<
    "dashboard" | "logs" | "dataUpload" | "dataChat" | "theory"
  >("dashboard");
  const [darkMode, setDarkMode] = useState(true);
  const [strategy, setStrategy] = useState<Strategy>("balanced");
  const [customOrderQuantity, setCustomOrderQuantity] = useState<number>(120);
  const [simulations, setSimulations] = useState<number>(500);
  const [initialCash, setInitialCash] = useState<number>(5000);
  const [demandStdDev, setDemandStdDev] = useState<number>(25);
  const [weeklyFixedCost, setWeeklyFixedCost] = useState<number>(3200);
  const [bankruptcyThreshold, setBankruptcyThreshold] = useState<number>(500);
  const [salePrice, setSalePrice] = useState<number>(50);
  const [aiModel, setAiModel] = useState<string>("llama3.2:1b");
  const [isLoading, setIsLoading] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isTheoryLoading, setIsTheoryLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [results, setResults] = useState<SimulationResponse | null>(null);
  const [simChat, setSimChat] = useState<SimChatMessage[]>([]);
  const [logs, setLogs] = useState<FrontendLogEntry[]>([]);
  const [backendLogs, setBackendLogs] = useState<BackendAILog[]>([]);
  const [dataFiles, setDataFiles] = useState<DataFileSummary[]>([]);
  const [dataChatMessages, setDataChatMessages] = useState<ChatMessage[]>([]);
  const [theoryReport, setTheoryReport] = useState<TheoryReport | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(
    localStorage.getItem("auth_token"),
  );
  const [username, setUsername] = useState<string>(localStorage.getItem("auth_user") || "");
  const [authBootstrapLoading, setAuthBootstrapLoading] = useState(false);
  const bootstrapStarted = useRef(false);
  const [processedByFile, setProcessedByFile] = useState<
    Record<string, { inferred_mapping: Record<string, unknown>; ai_notes?: string }>
  >({});
  const railItems: Array<{
    id: "dashboard" | "logs" | "dataUpload" | "dataChat" | "theory";
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
      id: "dataUpload",
      title: "Data Upload",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M10 12V4" />
          <polyline points="7,7 10,4 13,7" />
          <path d="M4 14v2a1 1 0 001 1h10a1 1 0 001-1v-2" />
        </svg>
      ),
    },
    {
      id: "dataChat",
      title: "Data Chat",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 5a2 2 0 012-2h10a2 2 0 012 2v7a2 2 0 01-2 2H8l-4 3V5z" />
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
    return fetch(url, { ...init, headers });
  }

  function logout() {
    setAuthToken(null);
    setUsername("");
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
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
      setSimChat([]);  // clear previous chat
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
      // Auto-send initial diagnosis to sim chat
      const bkPct = data.bankruptcy_probability * 100;
      const autoMsg =
        bkPct > 30
          ? `Bankruptcy hit ${bkPct.toFixed(1)}% of runs. Explain the exact math behind why the business fails so often — break it down week by week.`
          : bkPct > 12
          ? `Bankruptcy affected ${bkPct.toFixed(1)}% of runs with an average profit of $${Math.round(data.avg_profit).toLocaleString()}. Explain what's driving the risk and what's holding the good runs together.`
          : `The simulation looks healthy with only ${bkPct.toFixed(1)}% bankruptcy and average profit $${Math.round(data.avg_profit).toLocaleString()}. Explain the math that makes this strategy work and what could still go wrong.`;
      void sendSimChat(autoMsg, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setIsLoading(false);
    }
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
          content: `⚠ Could not reach AI: ${text}`,
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
        content: `⚠ Error: ${err instanceof Error ? err.message : "Unknown error"}`,
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

  async function refreshDataFiles() {
    const response = await authFetch(`${API_BASE_URL}/data/files`);
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const data = (await response.json()) as DataFileSummary[];
    setDataFiles(data);
  }

  async function uploadDataFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await authFetch(`${API_BASE_URL}/data/upload`, {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    await refreshDataFiles();
    pushLog({
      action: "data.upload.success",
      request: { file: file.name },
      response: await response.json(),
      level: "success",
    });
  }

  async function clearDataFiles() {
    await authFetch(`${API_BASE_URL}/data/files`, { method: "DELETE" });
    setDataFiles([]);
    setProcessedByFile({});
  }

  async function sendDataChat(message: string) {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };
    setDataChatMessages((prev) => [...prev, userMessage]);

    const payload = { message, model: aiModel };
    const response = await authFetch(`${API_BASE_URL}/ai/data-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      pushLog({
        action: "ai.data_chat.failed",
        request: payload,
        error: text,
        level: "error",
      });
      throw new Error(text);
    }
    const data = (await response.json()) as DataChatResponse;
    const aiMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: data.answer,
      timestamp: new Date().toISOString(),
    };
    setDataChatMessages((prev) => [...prev, aiMessage]);
    pushLog({
      action: "ai.data_chat.success",
      request: payload,
      response: data,
      level: "info",
    });
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

    async function initGuest() {
      setAuthBootstrapLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/auth/guest`, { method: "POST" });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as AuthResponse;
        setAuthToken(data.token);
        setUsername(data.username);
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("auth_user", data.username);
      } catch (err) {
        bootstrapStarted.current = false; // allow retry on error
        setError(err instanceof Error ? err.message : "Failed to start session.");
      } finally {
        setAuthBootstrapLoading(false);
      }
    }
    void initGuest();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!authToken) {
      return;
    }
    if (activePage === "logs") {
      void loadBackendLogs();
    }
  }, [activePage, authToken]);

  useEffect(() => {
    if (!authToken) {
      return;
    }
    if (activePage === "dataUpload") {
      void refreshDataFiles();
    }
  }, [activePage, authToken]);

  async function processUploadedFile(fileId: string) {
    try {
      const response = await authFetch(`${API_BASE_URL}/ai/process-file/${fileId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: aiModel }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as ProcessFileResponse;
      setProcessedByFile((prev) => ({
        ...prev,
        [fileId]: { inferred_mapping: data.inferred_mapping, ai_notes: data.ai_notes },
      }));
      pushLog({
        action: "ai.process_file.success",
        request: { file_id: fileId, model: aiModel },
        response: data,
        level: "success",
      });
    } catch (err) {
      pushLog({
        action: "ai.process_file.failed",
        request: { file_id: fileId, model: aiModel },
        error: err instanceof Error ? err.message : "Processing failed",
        level: "error",
      });
      setError(err instanceof Error ? err.message : "Failed to process file.");
    }
  }

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
            <p>Initializing your workspace&hellip;</p>
            <div className="spinner" />
            {error ? <p className="error">{error}</p> : null}
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
            <span className="user-chip">{username}</span>
            <button className="secondary-button" onClick={logout}>Sign out</button>
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
                onStrategyChange={setStrategy}
                onCustomOrderQuantityChange={setCustomOrderQuantity}
                onSimulationsChange={setSimulations}
                onInitialCashChange={setInitialCash}
                onDemandStdDevChange={setDemandStdDev}
                onWeeklyFixedCostChange={setWeeklyFixedCost}
                onBankruptcyThresholdChange={setBankruptcyThreshold}
                onSalePriceChange={setSalePrice}
                onAiModelChange={setAiModel}
                onSimulate={runSimulation}
                isLoading={isLoading}
              />
              {error ? <p className="error">{error}</p> : null}
              {results ? (
                <AnalysisDashboard
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

          {activePage === "dataUpload" ? (
            <DataUploadPage
              files={dataFiles}
              processedByFile={processedByFile}
              onUpload={uploadDataFile}
              onRefresh={refreshDataFiles}
              onClear={clearDataFiles}
              onProcessFile={processUploadedFile}
            />
          ) : null}

          {activePage === "dataChat" ? (
            <DataChatPage
              messages={dataChatMessages}
              model={aiModel}
              onModelChange={setAiModel}
              onSend={sendDataChat}
            />
          ) : null}

          {activePage === "theory" ? (
            <TheoryPage
              report={theoryReport}
              onGenerate={generateTheoryReport}
              isLoading={isTheoryLoading}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default App;
