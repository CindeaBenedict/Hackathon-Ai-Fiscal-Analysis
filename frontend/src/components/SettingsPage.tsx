import React, { useCallback, useEffect, useState } from "react";

type AIKeysResponse = {
  anthropic_set: boolean;
  anthropic_masked: string;
  openai_set: boolean;
  openai_masked: string;
};

type SettingsPageProps = {
  authToken: string | null;
  apiBaseUrl: string;
};

export default function SettingsPage({ authToken, apiBaseUrl }: SettingsPageProps) {
  const [keys, setKeys] = useState<AIKeysResponse | null>(null);
  const [anthropicInput, setAnthropicInput] = useState("");
  const [openaiInput, setOpenaiInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      const r = await fetch(`${apiBaseUrl}/ai/keys`);
      if (!r.ok) throw new Error("Failed to load");
      const data: AIKeysResponse = await r.json();
      setKeys(data);
    } catch {
      setKeys({
        anthropic_set: false,
        anthropic_masked: "(not set)",
        openai_set: false,
        openai_masked: "(not set)",
      });
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const r = await fetch(`${apiBaseUrl}/ai/keys`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          anthropic: anthropicInput.trim() || undefined,
          openai: openaiInput.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.detail ?? "Failed to save");
      }
      const data: AIKeysResponse = await r.json();
      setKeys(data);
      setAnthropicInput("");
      setOpenaiInput("");
      setMessage({ type: "ok", text: "API keys saved. Claude/OpenAI models will use them." });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Failed to save" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel" style={{ maxWidth: "32rem" }}>
      <h2>Settings</h2>
      <p className="muted">
        Set API keys to use Claude or OpenAI models in the app. Keys are stored on the server and
        take effect immediately. Leave a field empty to keep the current key.
      </p>

      <h3 style={{ marginTop: "1.25rem", marginBottom: "0.5rem" }}>API keys</h3>
      <div className="controls-grid" style={{ gridTemplateColumns: "1fr", marginTop: "0.5rem" }}>
        <label>
          Claude (Anthropic) API key
          <input
            type="text"
            autoComplete="off"
            placeholder={keys?.anthropic_set ? keys.anthropic_masked : "Paste your Claude API key here"}
            value={anthropicInput}
            onChange={(e) => setAnthropicInput(e.target.value)}
          />
        </label>
        <label>
          OpenAI API key
          <input
            type="text"
            autoComplete="off"
            placeholder={keys?.openai_set ? keys.openai_masked : "Paste your OpenAI API key here"}
            value={openaiInput}
            onChange={(e) => setOpenaiInput(e.target.value)}
          />
        </label>
      </div>

      {message && (
        <p className={message.type === "ok" ? "success" : "error"} style={{ marginTop: "0.75rem" }}>
          {message.text}
        </p>
      )}

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <button
          type="button"
          className="primary-button"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save API keys"}
        </button>
      </div>
    </section>
  );
}
