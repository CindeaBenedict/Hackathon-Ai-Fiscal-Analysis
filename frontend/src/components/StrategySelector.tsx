import { useEffect, useState } from "react";

export type Strategy = "conservative" | "balanced" | "aggressive" | "custom" | "ai_recommended";

// ── Model presets ─────────────────────────────────────────────────────────────

type ModelPreset = {
  label: string;
  model: string;
  provider: "ollama" | "claude" | "openai";
  note: string;
};

const MODEL_PRESETS: ModelPreset[] = [
  { provider: "ollama", model: "llama3.2:1b",               label: "Llama 3.2 1B",     note: "Fast · local · default" },
  { provider: "ollama", model: "llama3",                    label: "Llama 3 8B",       note: "Better quality · local" },
  { provider: "ollama", model: "mistral",                   label: "Mistral 7B",       note: "Good reasoning · local" },
  { provider: "claude", model: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", note: "Fast · API key needed" },
  { provider: "claude", model: "claude-sonnet-4-6",         label: "Claude Sonnet 4.6",note: "Best balance · API key" },
  { provider: "claude", model: "claude-opus-4-6",           label: "Claude Opus 4.6",  note: "Best quality · API key" },
  { provider: "openai", model: "gpt-4o-mini",               label: "GPT-4o Mini",      note: "Fast · API key needed" },
  { provider: "openai", model: "gpt-4o",                    label: "GPT-4o",           note: "Best quality · API key" },
];

const PROVIDER_COLORS = {
  ollama: { border: "rgba(59,130,246,0.35)", active: "#3b82f6", bg: "rgba(59,130,246,0.10)" },
  claude: { border: "rgba(168,85,247,0.35)", active: "#a855f7", bg: "rgba(168,85,247,0.10)" },
  openai: { border: "rgba(16,185,129,0.35)", active: "#10b981", bg: "rgba(16,185,129,0.10)" },
};

const PROVIDER_LABELS = { ollama: "🏠 Local (Ollama)", claude: "✦ Anthropic Claude", openai: "⬡ OpenAI" };

// ── Provider status types ─────────────────────────────────────────────────────

type ProviderStatus = {
  ollama: { available: boolean; models: string[]; pulling?: string[] };
  claude: { available: boolean; models: string[] };
  openai: { available: boolean; models: string[] };
};

// ── Props ─────────────────────────────────────────────────────────────────────

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
  onStop: () => void;
  isLoading: boolean;
};

// ── Component ─────────────────────────────────────────────────────────────────

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
  onStop,
  isLoading,
}: StrategySelectorProps) {
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [customModel, setCustomModel] = useState("");

  const orderQty = strategy === "conservative" ? 120
    : strategy === "balanced" ? 100
    : strategy === "aggressive" ? 80
    : strategy === "ai_recommended" ? (customOrderQuantity > 0 ? customOrderQuantity : "—")
    : customOrderQuantity;
  const grossMargin = salePrice - 10;
  const weeklyNet = 100 * grossMargin - weeklyFixedCost;
  const marginHealthy = weeklyNet > 0;

  // Poll provider status once on mount
  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((data: ProviderStatus) => setProviderStatus(data))
      .catch(() => null);
  }, []);

  const activePreset = MODEL_PRESETS.find((p) => p.model === aiModel);
  const activeProvider = activePreset?.provider ?? "ollama";

  const groups = (["ollama", "claude", "openai"] as const).map((prov) => ({
    prov,
    presets: MODEL_PRESETS.filter((p) => p.provider === prov),
  }));

  return (
    <section className="panel">
      {/* ── Header with margin indicator ─────────────────────────────── */}
      <div className="strategy-header-row">
        <h2 style={{ margin: 0 }}>Simulation Controls</h2>
        <span style={{
          fontSize: "0.73rem", fontWeight: 600, padding: "4px 10px",
          borderRadius: 999,
          background: marginHealthy ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
          border: `1px solid ${marginHealthy ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: marginHealthy ? "#22c55e" : "#ef4444",
        }}>
          Weekly margin: ${weeklyNet.toLocaleString()}/wk {marginHealthy ? "✓ viable" : "⚠ unprofitable"}
        </span>
      </div>

      {/* ── Simulation parameters ─────────────────────────────────────── */}
      <div className="controls-grid">
        <label>
          Strategy
          <select
            value={strategy}
            onChange={(e) => onStrategyChange(e.target.value as Strategy)}
          >
            <option value="conservative">Conservative (120 units)</option>
            <option value="balanced">Balanced (100 units)</option>
            <option value="aggressive">Aggressive (80 units)</option>
            <option value="ai_recommended">AI-recommended (model picks Q)</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label>
          Custom Order Qty
          <input type="number" min={0} value={customOrderQuantity}
            onChange={(e) => onCustomOrderQuantityChange(Number(e.target.value))}
            disabled={strategy !== "custom"}
            placeholder={strategy === "ai_recommended" ? "Set by AI when you Run" : undefined}
            title={strategy === "ai_recommended" ? "Set by AI when you run the simulation" : undefined}
          />
        </label>
        <label>
          Simulations
          <input type="number" min={1} max={2000} value={simulations}
            onChange={(e) => onSimulationsChange(Number(e.target.value))} />
        </label>
        <label>
          Initial Cash ($)
          <input type="number" min={0} value={initialCash}
            onChange={(e) => onInitialCashChange(Number(e.target.value))} />
        </label>
        <label>
          Demand Std Dev
          <input type="number" min={0} value={demandStdDev}
            onChange={(e) => onDemandStdDevChange(Number(e.target.value))} />
        </label>
        <label>
          Bankruptcy Threshold
          <input type="number" value={bankruptcyThreshold}
            onChange={(e) => onBankruptcyThresholdChange(Number(e.target.value))} />
        </label>
        <label>
          Weekly Fixed Cost ($)
          <input type="number" min={0} value={weeklyFixedCost}
            onChange={(e) => onWeeklyFixedCostChange(Number(e.target.value))} />
        </label>
        <label>
          Sale Price ($/unit)
          <input type="number" min={1} value={salePrice}
            onChange={(e) => onSalePriceChange(Number(e.target.value))} />
        </label>
      </div>

      <p style={{ fontSize: "0.73rem", color: "var(--text-2)", marginBottom: 16 }}>
        Order cost: $10/unit · Gross margin: ${grossMargin}/unit · {strategy === "ai_recommended" ? "Q from AI" : `${orderQty} units`} ordered/week
      </p>

      {/* ── AI Model picker ───────────────────────────────────────────── */}
      <div style={{
        background: "var(--s1)", border: "1px solid var(--border)",
        borderRadius: "var(--r-md)", padding: "12px 14px", marginBottom: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: "0.70rem", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.07em", color: "var(--text-2)" }}>
            AI Model
          </span>
          {activePreset && (
            <span style={{
              fontSize: "0.68rem", padding: "2px 8px", borderRadius: 999,
              background: PROVIDER_COLORS[activeProvider].bg,
              border: `1px solid ${PROVIDER_COLORS[activeProvider].border}`,
              color: PROVIDER_COLORS[activeProvider].active,
            }}>
              {activePreset.label} · {activePreset.note}
            </span>
          )}
        </div>

        {groups.map(({ prov, presets }) => {
          const status = providerStatus?.[prov];
          const isAvailable = status?.available ?? (prov === "ollama");
          const isPulling = prov === "ollama" && (providerStatus?.ollama?.pulling?.length ?? 0) > 0;

          return (
            <div key={prov} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: "0.68rem", color: "var(--text-2)", fontWeight: 600 }}>
                  {PROVIDER_LABELS[prov]}
                </span>
                {prov !== "ollama" && !isAvailable && (
                  <span style={{ fontSize: "0.62rem", color: "#f59e0b",
                    background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.25)",
                    borderRadius: 999, padding: "1px 7px" }}>
                    API key not set — see .env
                  </span>
                )}
                {prov === "ollama" && isPulling && (
                  <span style={{ fontSize: "0.62rem", color: "#60a5fa",
                    background: "rgba(59,130,246,0.10)", border: "1px solid rgba(59,130,246,0.25)",
                    borderRadius: 999, padding: "1px 7px" }}>
                    ⟳ downloading model…
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {presets.map((p) => {
                  const active = aiModel === p.model;
                  const colors = PROVIDER_COLORS[p.provider];
                  const ollamaDownloaded = prov === "ollama"
                    ? (providerStatus?.ollama.models ?? []).some(
                        (m) => m === p.model || m.startsWith(p.model.split(":")[0])
                      )
                    : true;

                  return (
                    <button
                      key={p.model}
                      onClick={() => onAiModelChange(p.model)}
                      title={p.model}
                      style={{
                        border: `1px solid ${active ? colors.active : colors.border}`,
                        borderRadius: "var(--r-xs)",
                        background: active ? colors.bg : "transparent",
                        color: active ? colors.active : "var(--text-2)",
                        fontSize: "0.77rem",
                        fontWeight: active ? 700 : 500,
                        padding: "5px 11px",
                        cursor: "pointer",
                        transition: "all 0.15s",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      {p.label}
                      {prov === "ollama" && ollamaDownloaded && (
                        <span style={{ fontSize: "0.60rem", color: "#22c55e" }}>●</span>
                      )}
                      {prov === "ollama" && !ollamaDownloaded && providerStatus && (
                        <span style={{ fontSize: "0.60rem", color: "var(--text-3)" }}>○</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Custom model input */}
        <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
          <input
            placeholder="Custom model name…"
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customModel.trim()) {
                onAiModelChange(customModel.trim());
                setCustomModel("");
              }
            }}
            style={{ flex: 1, fontSize: "0.80rem" }}
          />
          <button
            className="secondary-button"
            style={{ fontSize: "0.78rem", padding: "6px 12px" }}
            onClick={() => {
              if (customModel.trim()) {
                onAiModelChange(customModel.trim());
                setCustomModel("");
              }
            }}
          >
            Use
          </button>
        </div>
        <p style={{ margin: "6px 0 0", fontSize: "0.68rem", color: "var(--text-3)" }}>
          ● = already downloaded · ○ = will auto-download on first use
        </p>
      </div>

      {/* ── Run button ────────────────────────────────────────────────── */}
      <div className="actions-row">
        <button className="primary-button" onClick={onSimulate} disabled={isLoading}>
          {isLoading ? "Running…" : "Run Simulation"}
        </button>
        {isLoading && (
          <button
            type="button"
            className="secondary-button"
            onClick={onStop}
            style={{
              borderColor: "rgba(239,68,68,0.5)",
              color: "#f87171",
            }}
          >
            Stop
          </button>
        )}
      </div>
    </section>
  );
}

export default StrategySelector;
