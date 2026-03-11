import React, { useEffect, useMemo, useRef, useState } from "react";
import LogsPage, { BackendAILog, FrontendLogEntry } from "./components/LogsPage";
import AnalysisDashboard, { SimChatMessage, SimulationResults } from "./components/AnalysisDashboard";
import StrategySelector, { Strategy } from "./components/StrategySelector";
import TheoryPage, { TheoryReport } from "./components/TheoryPage";
import SettingsPage from "./components/SettingsPage";
import CollaboratePage, { STORAGE_KEY as WORKSPACE_STORAGE_KEY } from "./components/CollaboratePage";
import BreweriesPage, { Brewery } from "./components/BreweriesPage";
import type { Workspace } from "./components/CollaboratePage";

type SimulationResponse = SimulationResults;

type AuthResponse = {
  token: string;
  username: string;
};

const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
const API_BASE_URL = rawApiBaseUrl.length > 0
  ? rawApiBaseUrl.replace(/\/+$/, "")
  : "/api";

function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const DEFAULT_ORDER_BY_STRATEGY: Record<Strategy, number> = {
  conservative: 120,
  balanced: 100,
  aggressive: 80,
  custom: 100,
  ai_recommended: 100,
};

function App() {
  const [activePage, setActivePage] = useState<
    "dashboard" | "logs" | "theory" | "collaborate" | "breweries" | "settings"
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
  const [comparisonResults, setComparisonResults] = useState<Record<string, SimulationResponse> | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(
    localStorage.getItem("auth_token"),
  );
  const [username, setUsername] = useState<string>(localStorage.getItem("auth_user") || "");
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [breweries, setBreweries] = useState<Brewery[]>([]);
  const [currentBrewery, setCurrentBrewery] = useState<Brewery | null>(null);
  const [authBootstrapLoading, setAuthBootstrapLoading] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authUsernameInput, setAuthUsernameInput] = useState("");
  const [authPasswordInput, setAuthPasswordInput] = useState("");
  const [authPasswordConfirmInput, setAuthPasswordConfirmInput] = useState("");
  const bootstrapStarted = useRef(false);
  const simulationAbortRef = useRef<AbortController | null>(null);

  function buildWorkspaceConfig() {
    return {
      strategy,
      customOrderQuantity,
      simulations,
      initialCash,
      demandStdDev,
      weeklyFixedCost,
      bankruptcyThreshold,
      salePrice,
      aiModel,
      breweries,
      currentBreweryId: currentBrewery?.id ?? null,
    };
  }

  function saveWorkspaceState(config: Record<string, unknown>, resultsData: Record<string, unknown> | null) {
    if (!currentWorkspace) return;
    authFetch(`${API_BASE_URL}/workspaces/${currentWorkspace.id}/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, results: resultsData }),
    }).catch(() => {});
  }

  function handleBreweriesChange(nextBreweries: Brewery[]) {
    setBreweries(nextBreweries);
    if (currentWorkspace) {
      const currentIdStillExists = currentBrewery ? nextBreweries.some((b) => b.id === currentBrewery.id) : false;
      const nextCurrent = currentIdStillExists ? currentBrewery : null;
      if (!currentIdStillExists) {
        setCurrentBrewery(null);
      }
      const config = {
        ...buildWorkspaceConfig(),
        breweries: nextBreweries,
        currentBreweryId: nextCurrent?.id ?? null,
      };
      saveWorkspaceState(config as Record<string, unknown>, results);
    }
  }
  const railItems: Array<{
    id: "dashboard" | "logs" | "theory" | "collaborate" | "breweries" | "settings";
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
      id: "collaborate",
      title: "Collaborate",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M14 17c0 1.5-1.5 2.5-4 2.5s-4-1-4-2.5 1.5-2.5 4-2.5 4 1 4 2.5z" />
          <path d="M14 10c0 1.5-1.5 2.5-4 2.5S6 11.5 6 10s1.5-2.5 4-2.5 4 1 4 2.5z" />
          <path d="M14 3c0 1.5-1.5 2.5-4 2.5S6 4.5 6 3s1.5-2.5 4-2.5 4 1 4 2.5z" />
        </svg>
      ),
    },
    {
      id: "breweries",
      title: "Breweries",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M10 2c-3.3 0-6 2.7-6 6 0 4.5 6 11 6 11s6-6.5 6-11c0-3.3-2.7-6-6-6z" />
          <circle cx="10" cy="8" r="2.2" />
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
        id: uid(),
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
        setUsername("");
      }
      return res;
    });
  }

  function setSession(data: AuthResponse) {
    setAuthToken(data.token);
    setUsername(data.username);
    localStorage.setItem("auth_token", data.token);
    localStorage.setItem("auth_user", data.username);
  }

  function clearSessionLocal() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    bootstrapStarted.current = false;
    setAuthToken(null);
    setUsername("");
    setCurrentWorkspace(null);
  }

  async function signOut() {
    const token = authToken;
    clearSessionLocal();
    if (!token) return;
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // already signed out locally
    }
  }

  async function submitAuth() {
    setError("");
    if (!authUsernameInput.trim() || !authPasswordInput.trim()) {
      setError("Enter username and password.");
      return;
    }
    if (authMode === "register") {
      if (authPasswordInput.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (authPasswordInput !== authPasswordConfirmInput) {
        setError("Passwords do not match.");
        return;
      }
    }
    setAuthBootstrapLoading(true);
    try {
      const endpoint = authMode === "login" ? "login" : "register";
      const response = await fetch(`${API_BASE_URL}/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: authUsernameInput.trim(),
          password: authPasswordInput,
        }),
      });
      const text = await response.text();
      if (!response.ok) {
        let detail = text;
        try {
          const json = JSON.parse(text) as { detail?: string };
          detail = json.detail ?? detail;
        } catch {
          // use raw text
        }
        throw new Error(detail || `HTTP ${response.status}`);
      }
      const data = JSON.parse(text) as AuthResponse;
      setSession(data);
      setAuthPasswordInput("");
      setAuthPasswordConfirmInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setAuthBootstrapLoading(false);
    }
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

      // If in a shared workspace, push config + results so others can load them
      if (currentWorkspace) {
        const config = {
          strategy,
          customOrderQuantity: effectiveStrategy === "custom" ? effectiveOrderQuantity : customOrderQuantity,
          simulations,
          initialCash,
          demandStdDev,
          weeklyFixedCost,
          bankruptcyThreshold,
          salePrice,
          aiModel,
          breweries,
          currentBreweryId: currentBrewery?.id ?? null,
        };
        saveWorkspaceState(config, data);
      }

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

  async function compareStrategies() {
    setIsComparing(true);
    setComparisonResults(null);
    const strategies = ["conservative", "balanced", "aggressive"] as const;
    const results: Record<string, SimulationResponse> = {};
    try {
      for (const s of strategies) {
        const payload = {
          strategy: s,
          simulations,
          initial_cash: initialCash,
          demand_std_dev: demandStdDev,
          weekly_fixed_cost: weeklyFixedCost,
          bankruptcy_cash_threshold: bankruptcyThreshold,
          sale_price: salePrice,
        };
        const res = await authFetch(`${API_BASE_URL}/simulate/stable`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) continue;
        results[s] = await res.json();
      }
      setComparisonResults(results);
    } catch {
      setError("Strategy comparison failed.");
    } finally {
      setIsComparing(false);
    }
  }

  function fetchInitialAdvisorSummary(simData: SimulationResponse) {
    setSimChat([
      {
        id: uid(),
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
            id: uid(),
            role: "assistant",
            content: body.summary || "No summary generated.",
          },
        ]);
      })
      .catch(() => {
        setSimChat([
          {
            id: uid(),
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
      id: uid(),
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
          id: uid(),
          role: "assistant",
          content: `Could not reach AI: ${text}`,
        };
        setSimChat((prev) => [...prev, errMsg]);
        return;
      }

      const data = (await response.json()) as { model: string; answer: string };
      const aiMsg: SimChatMessage = {
        id: uid(),
        role: "assistant",
        content: data.answer,
      };
      setSimChat((prev) => [...prev, aiMsg]);
      pushLog({ action: "ai.sim_chat.success", request: { message }, response: data, level: "info" });
    } catch (err) {
      const errMsg: SimChatMessage = {
        id: uid(),
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

  useEffect(() => {
    if (!authToken) {
      return;
    }
    if (activePage === "logs") {
      void loadBackendLogs();
    }
  }, [activePage, authToken]);

  // Restore current workspace from localStorage once we have auth
  useEffect(() => {
    if (!authToken) return;
    const storedId = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!storedId) return;
    authFetch(`${API_BASE_URL}/workspaces`)
      .then((r) => {
        if (!r.ok) return r.json().then(() => null);
        return r.json() as Promise<Workspace[]>;
      })
      .then((list) => {
        if (!list?.length) return;
        const id = parseInt(storedId, 10);
        const ws = list.find((w) => w.id === id);
        if (ws) setCurrentWorkspace(ws);
      })
      .catch(() => {});
  }, [authToken]); // eslint-disable-line react-hooks/exhaustive-deps

  function loadWorkspaceState(config: Record<string, unknown> | null, resultsData: Record<string, unknown> | null) {
    if (config) {
      if (typeof config.strategy === "string" && ["conservative", "balanced", "aggressive", "custom", "ai_recommended"].includes(config.strategy)) {
        setStrategy(config.strategy as Strategy);
      }
      if (typeof config.customOrderQuantity === "number") setCustomOrderQuantity(config.customOrderQuantity);
      if (typeof config.simulations === "number") setSimulations(config.simulations);
      if (typeof config.initialCash === "number") setInitialCash(config.initialCash);
      if (typeof config.demandStdDev === "number") setDemandStdDev(config.demandStdDev);
      if (typeof config.weeklyFixedCost === "number") setWeeklyFixedCost(config.weeklyFixedCost);
      if (typeof config.bankruptcyThreshold === "number") setBankruptcyThreshold(config.bankruptcyThreshold);
      if (typeof config.salePrice === "number") setSalePrice(config.salePrice);
      if (typeof config.aiModel === "string") setAiModel(config.aiModel);
      if (Array.isArray(config.breweries)) {
        const incoming = config.breweries.filter((b): b is Brewery => {
          if (!b || typeof b !== "object") return false;
          const x = b as Record<string, unknown>;
          return typeof x.name === "string" && typeof x.lat === "number" && typeof x.lng === "number";
        }).map((b, idx) => {
          const x = b as unknown as Record<string, unknown>;
          return {
            id: typeof x.id === "number" ? x.id : idx + 1,
            name: String(x.name ?? "Unnamed Brewery"),
            lat: Number(x.lat ?? 0),
            lng: Number(x.lng ?? 0),
            address: String(x.address ?? ""),
            description: String(x.description ?? ""),
            avg_monthly_revenue: Number(x.avg_monthly_revenue ?? 0),
            quality_score: Number(x.quality_score ?? 50),
            efficiency_score: Number(x.efficiency_score ?? 50),
            popularity_score: Number(x.popularity_score ?? 50),
            sustainability_score: Number(x.sustainability_score ?? 50),
            created_at: String(x.created_at ?? new Date().toISOString()),
          } satisfies Brewery;
        });
        setBreweries(incoming);
        if (typeof config.currentBreweryId === "number") {
          const found = incoming.find((b) => b.id === config.currentBreweryId) ?? null;
          setCurrentBrewery(found);
        } else {
          setCurrentBrewery(null);
        }
      }
    }
    if (resultsData && typeof resultsData === "object" && "avg_profit" in resultsData && "profits" in resultsData) {
      setResults(resultsData as SimulationResponse);
      setSimChat([]);
    }
  }

  if (!authToken) {
    return (
      <div className={darkMode ? "" : "theme-light"}>
        <div className="splash-screen">
          <div className="splash-card">
            <div className="splash-logo">
              <img src="/logo.png" alt="Supply Chain Command" width={52} height={52} />
            </div>
            <h2>Supply Chain Command</h2>
            <p>{authMode === "login" ? "Sign in to collaborate." : "Create an account for collaboration."}</p>
            {error ? <p className="error" style={{ marginTop: 8, marginBottom: 4 }}>{error}</p> : null}
            <div style={{ display: "grid", gap: 8, width: "100%" }}>
              <input
                type="text"
                placeholder="Username"
                value={authUsernameInput}
                onChange={(e) => setAuthUsernameInput(e.target.value)}
              />
              <input
                type="password"
                placeholder="Password"
                value={authPasswordInput}
                onChange={(e) => setAuthPasswordInput(e.target.value)}
              />
              {authMode === "register" ? (
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={authPasswordConfirmInput}
                  onChange={(e) => setAuthPasswordConfirmInput(e.target.value)}
                />
              ) : null}
              <button
                type="button"
                className="primary-button"
                disabled={authBootstrapLoading}
                onClick={() => void submitAuth()}
              >
                {authBootstrapLoading ? "Please wait..." : authMode === "login" ? "Sign in" : "Create account"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setAuthMode((m) => (m === "login" ? "register" : "login"));
                  setError("");
                }}
              >
                {authMode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`app-shell ${darkMode ? "" : "theme-light"}`}>
      <aside className="side-rail">
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
            <div className="topbar-brand-row">
              <img src="/logo.png" alt="" className="topbar-logo" />
            <span className="topbar-title">Supply Chain Command</span>
            </div>
            <span className="topbar-sub">
              {currentBrewery ? `${currentBrewery.name} · ` : ""}
              Monte Carlo · AI Planning · Risk Analysis
            </span>
          </div>
          <div className="topbar-right">
            <span className="user-chip">@{username || "guest"}</span>
            <button className="secondary-button" onClick={() => setDarkMode((v) => !v)}>
              {darkMode ? "Light" : "Dark"}
            </button>
            <button className="secondary-button" onClick={() => void signOut()}>
              Sign out
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

              {/* ── Compare Strategies ──────────────────────────────────── */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ fontSize: "0.78rem" }}
                  disabled={isComparing || isLoading}
                  onClick={compareStrategies}
                >
                  {isComparing ? "Comparing…" : "Compare All Strategies"}
                </button>
                {isComparing && <span className="muted" style={{ fontSize: "0.75rem" }}>Running Conservative, Balanced, Aggressive…</span>}
              </div>

              {comparisonResults && Object.keys(comparisonResults).length > 0 && (
                <section className="panel" style={{ overflowX: "auto" }}>
                  <h2 style={{ marginBottom: 12 }}>Strategy Comparison</h2>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid var(--border)" }}>
                        <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--text-2)" }}>Metric</th>
                        {Object.entries(comparisonResults).map(([s]) => (
                          <th key={s} style={{ textAlign: "right", padding: "6px 10px", color: "var(--text-2)", textTransform: "capitalize" }}>{s}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        ["Avg Profit", (r: SimulationResponse) => `$${r.avg_profit.toFixed(0)}`],
                        ["Median (P50)", (r: SimulationResponse) => `$${(r.profit_p50 ?? 0).toFixed(0)}`],
                        ["Worst Case", (r: SimulationResponse) => `$${r.worst_profit.toFixed(0)}`],
                        ["Best Case", (r: SimulationResponse) => `$${r.best_profit.toFixed(0)}`],
                        ["Std Dev", (r: SimulationResponse) => `$${(r.profit_std_dev ?? 0).toFixed(0)}`],
                        ["Bankruptcy %", (r: SimulationResponse) => `${(r.bankruptcy_probability * 100).toFixed(1)}%`],
                        ["Avg Stockouts", (r: SimulationResponse) => r.stockouts_average.toFixed(2)],
                        ["Sharpe", (r: SimulationResponse) => r.sharpe_ratio != null ? r.sharpe_ratio.toFixed(3) : "—"],
                        ["Service Level", (r: SimulationResponse) => r.avg_service_level != null ? `${(r.avg_service_level * 100).toFixed(1)}%` : "—"],
                        ["Simulations", (r: SimulationResponse) => String(r.actual_simulations ?? r.profits.length)],
                      ] as [string, (r: SimulationResponse) => string][]).map(([label, fmt]) => {
                        const vals = Object.values(comparisonResults);
                        const nums = vals.map((r) => {
                          const s = fmt(r).replace(/[$,%]/g, "");
                          return parseFloat(s);
                        });
                        const isBest = (idx: number) => {
                          if (label.includes("Bankruptcy") || label === "Std Dev" || label === "Avg Stockouts" || label === "Worst Case")
                            return nums[idx] === Math.min(...nums.filter((x) => !isNaN(x)));
                          return nums[idx] === Math.max(...nums.filter((x) => !isNaN(x)));
                        };
                        return (
                          <tr key={label} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "6px 10px", color: "var(--text-2)" }}>{label}</td>
                            {Object.values(comparisonResults).map((r, i) => (
                              <td key={i} style={{
                                textAlign: "right", padding: "6px 10px",
                                fontWeight: isBest(i) ? 700 : 400,
                                color: isBest(i) ? "#22c55e" : "var(--text)",
                              }}>
                                {fmt(r)}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              )}

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

              {results && currentWorkspace ? (
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ fontSize: "0.85rem" }}
                    onClick={() => {
                      const config = {
                        strategy,
                        customOrderQuantity,
                        simulations,
                        initialCash,
                        demandStdDev,
                        weeklyFixedCost,
                        bankruptcyThreshold,
                        salePrice,
                        aiModel,
                        breweries,
                        currentBreweryId: currentBrewery?.id ?? null,
                      };
                      authFetch(`${API_BASE_URL}/workspaces/${currentWorkspace.id}/state`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ config, results }),
                      }).then((r) => {
                        if (r.ok) pushLog({ action: "workspace.push", request: { workspace: currentWorkspace.name }, level: "info" });
                      });
                    }}
                  >
                    Push results to &quot;{currentWorkspace.name}&quot;
                  </button>
                </div>
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

          {activePage === "collaborate" ? (
            <CollaboratePage
              apiBaseUrl={API_BASE_URL}
              authFetch={authFetch}
              currentWorkspace={currentWorkspace}
              onCurrentWorkspaceChange={setCurrentWorkspace}
              onLoadWorkspaceState={loadWorkspaceState}
              breweries={breweries}
              currentBrewery={currentBrewery}
              onSaveWorkspaceState={(config, resultsData) => saveWorkspaceState(config, resultsData)}
            />
          ) : null}

          {activePage === "breweries" ? (
            <BreweriesPage
              apiBaseUrl={API_BASE_URL}
              authFetch={authFetch}
              breweries={breweries}
              onBreweriesChange={handleBreweriesChange}
              currentBrewery={currentBrewery}
              onCurrentBreweryChange={(b) => {
                setCurrentBrewery(b);
                if (currentWorkspace) {
                  const config = {
                    ...buildWorkspaceConfig(),
                    currentBreweryId: b?.id ?? null,
                  };
                  saveWorkspaceState(config as Record<string, unknown>, results);
                }
              }}
            />
          ) : null}

          {activePage === "settings" ? (
            <SettingsPage authToken={authToken} apiBaseUrl={API_BASE_URL} onAuthError={() => {
              clearSessionLocal();
            }} />
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default App;
