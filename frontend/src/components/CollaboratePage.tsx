import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Brewery } from "./BreweriesPage";
import type { Supplier } from "./SuppliersPage";

export type Workspace = {
  id: number;
  invite_code: string;
  name: string;
  description: string;
};

type WorkspaceWithState = Workspace & {
  state?: {
    config: Record<string, unknown> | null;
    results: Record<string, unknown> | null;
    updated_at: string;
    updated_by: string | null;
  } | null;
};

type WorkspaceMember = {
  username: string;
  role: string;
};

type WorkspaceBreweryAnalysisItem = {
  brewery_id: number;
  brewery_name: string;
  ops_score: number;
  sourcing_score: number;
  combined_score: number;
  estimated_extra_order_cost: number;
  estimated_extra_weekly_fixed_cost: number;
  supplier_coverage_ratio: number;
  avg_supplier_lead_time_days: number;
};

type WorkspaceAnalysis = {
  brewery_count: number;
  supplier_count: number;
  category_coverage_ratio: number;
  best_brewery_id: number | null;
  best_brewery_name: string | null;
  rankings: WorkspaceBreweryAnalysisItem[];
};

type CollaboratePageProps = {
  apiBaseUrl: string;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  aiModel: string;
  currentWorkspace: Workspace | null;
  onCurrentWorkspaceChange: (ws: Workspace | null) => void;
  onLoadWorkspaceState?: (config: Record<string, unknown> | null, results: Record<string, unknown> | null) => void;
  breweries: Brewery[];
  suppliers: Supplier[];
  currentBrewery: Brewery | null;
  onSaveWorkspaceState?: (config: Record<string, unknown>, results: Record<string, unknown> | null) => void;
};

const STORAGE_KEY = "supply_chain_current_workspace_id";

export default function CollaboratePage({
  apiBaseUrl,
  authFetch,
  aiModel,
  currentWorkspace,
  onCurrentWorkspaceChange,
  onLoadWorkspaceState,
  breweries,
  suppliers,
  currentBrewery,
  onSaveWorkspaceState,
}: CollaboratePageProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [createName, setCreateName] = useState("Shared Workspace");
  const [createDescription, setCreateDescription] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [liveSyncEnabled, setLiveSyncEnabled] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [workspaceBreweries, setWorkspaceBreweries] = useState<Brewery[]>([]);
  const [workspaceSuppliers, setWorkspaceSuppliers] = useState<Supplier[]>([]);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [demoSeedLoading, setDemoSeedLoading] = useState(false);
  const [aiReportLoading, setAiReportLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [workspaceAnalysis, setWorkspaceAnalysis] = useState<WorkspaceAnalysis | null>(null);
  const lastWorkspaceStateUpdatedAt = useRef<string | null>(null);
  const snapshotInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);

  const extractBreweriesFromConfig = (config: Record<string, unknown> | null): Brewery[] => {
    if (!config || !Array.isArray(config.breweries)) return [];
    return config.breweries
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x, idx) => ({
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
      }));
  };

  const extractSuppliersFromConfig = (config: Record<string, unknown> | null): Supplier[] => {
    if (!config || !Array.isArray(config.suppliers)) return [];
    return config.suppliers
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((x, idx) => ({
        id: typeof x.id === "number" ? x.id : idx + 1,
        name: String(x.name ?? "Unnamed Supplier"),
        category: String(x.category ?? "other") as Supplier["category"],
        lat: Number(x.lat ?? 0),
        lng: Number(x.lng ?? 0),
        address: String(x.address ?? ""),
        unit_price: Number(x.unit_price ?? 0),
        shipping_cost_per_km: Number(x.shipping_cost_per_km ?? 0),
        lead_time_days: Number(x.lead_time_days ?? 3),
        created_at: String(x.created_at ?? new Date().toISOString()),
      }));
  };

  const stripHtml = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const sanitizeHtml = (raw: string): string => {
    const allowedTags = new Set(["B", "I", "U", "STRONG", "EM", "P", "BR", "UL", "OL", "LI", "H1", "H2", "H3"]);
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, "text/html");
    const walk = (node: Node) => {
      const children = Array.from(node.childNodes);
      for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child as HTMLElement;
          if (!allowedTags.has(el.tagName)) {
            const text = doc.createTextNode(el.textContent || "");
            el.replaceWith(text);
          } else {
            // Remove all attrs in allowed tags for safety.
            Array.from(el.attributes).forEach((a) => el.removeAttribute(a.name));
            walk(el);
          }
        }
      }
    };
    walk(doc.body);
    return doc.body.innerHTML;
  };

  const loadWorkspaces = useCallback(async () => {
    try {
      const r = await authFetch(`${apiBaseUrl}/workspaces`);
      if (!r.ok) return;
      const data = (await r.json()) as Workspace[];
      setWorkspaces(data);
      if (currentWorkspace) {
        const fresh = data.find((w) => w.id === currentWorkspace.id);
        if (fresh) {
          setEditDescription(fresh.description || "");
          if (editorRef.current) editorRef.current.innerHTML = sanitizeHtml(fresh.description || "");
        }
      }
    } catch {
      setWorkspaces([]);
    }
  }, [apiBaseUrl, authFetch, currentWorkspace]);

  const loadMembers = useCallback(async () => {
    if (!currentWorkspace) {
      setMembers([]);
      return;
    }
    try {
      const r = await authFetch(`${apiBaseUrl}/workspaces/${currentWorkspace.id}/members`);
      if (!r.ok) return;
      const data = (await r.json()) as WorkspaceMember[];
      setMembers(data);
    } catch {
      setMembers([]);
    }
  }, [apiBaseUrl, authFetch, currentWorkspace]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (!currentWorkspace) return;
    setEditDescription(currentWorkspace.description || "");
    setWorkspaceAnalysis(null);
    if (editorRef.current) editorRef.current.innerHTML = sanitizeHtml(currentWorkspace.description || "");
    lastWorkspaceStateUpdatedAt.current = null;
    try {
      localStorage.setItem(STORAGE_KEY, String(currentWorkspace.id));
    } catch {
      // ignore
    }
  }, [currentWorkspace]);

  const handleCreate = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const r = await authFetch(`${apiBaseUrl}/workspaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim() || "Shared Workspace",
          description: createDescription.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? "Failed to create workspace");
      }
      const ws = (await r.json()) as Workspace;
      setWorkspaces((prev) => [ws, ...prev]);
      onCurrentWorkspaceChange(ws);
      setCreateDescription("");
      setMessage({ type: "ok", text: `Workspace "${ws.name}" created.` });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Failed to create" });
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    const code = joinCode.trim();
    if (!code) {
      setMessage({ type: "err", text: "Enter an invite code." });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const r = await authFetch(`${apiBaseUrl}/workspaces/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: code.toUpperCase() }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? "Failed to join workspace");
      }
      const ws = (await r.json()) as Workspace;
      setWorkspaces((prev) => (prev.some((w) => w.id === ws.id) ? prev : [ws, ...prev]));
      onCurrentWorkspaceChange(ws);
      setJoinCode("");
      setMessage({ type: "ok", text: `Joined "${ws.name}".` });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Failed to join" });
    } finally {
      setLoading(false);
    }
  };

  const handleLoadFromWorkspace = async () => {
    if (!currentWorkspace || !onLoadWorkspaceState) return;
    try {
      const r = await authFetch(`${apiBaseUrl}/workspaces/${currentWorkspace.id}`);
      if (!r.ok) return;
      const data = (await r.json()) as WorkspaceWithState;
      if (data.state?.config || data.state?.results) {
        onLoadWorkspaceState(data.state?.config ?? null, data.state?.results ?? null);
        setWorkspaceBreweries(extractBreweriesFromConfig(data.state?.config ?? null));
        setWorkspaceSuppliers(extractSuppliersFromConfig(data.state?.config ?? null));
        if (data.state?.updated_at) {
          lastWorkspaceStateUpdatedAt.current = data.state.updated_at;
          setLastSyncedAt(data.state.updated_at);
        }
        setMessage({ type: "ok", text: "Loaded shared config and results." });
      } else {
        setMessage({ type: "err", text: "No saved state in this workspace yet." });
      }
    } catch {
      setMessage({ type: "err", text: "Could not load workspace state." });
    }
  };

  const activateWorkspace = async (ws: Workspace | null) => {
    onCurrentWorkspaceChange(ws);
    if (!ws || !onLoadWorkspaceState) return;
    try {
      const r = await authFetch(`${apiBaseUrl}/workspaces/${ws.id}`);
      if (!r.ok) return;
      const data = (await r.json()) as WorkspaceWithState;
      onLoadWorkspaceState(data.state?.config ?? null, data.state?.results ?? null);
      setWorkspaceBreweries(extractBreweriesFromConfig(data.state?.config ?? null));
      setWorkspaceSuppliers(extractSuppliersFromConfig(data.state?.config ?? null));
      if (data.state?.updated_at) {
        lastWorkspaceStateUpdatedAt.current = data.state.updated_at;
        setLastSyncedAt(data.state.updated_at);
      }
    } catch {
      // ignore; workspace selection still updates
    }
  };

  const saveDescription = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    setMessage(null);
    try {
      const r = await authFetch(`${apiBaseUrl}/workspaces/${currentWorkspace.id}/description`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: editDescription }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? "Failed to update description");
      }
      const updated = (await r.json()) as Workspace;
      setWorkspaces((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
      onCurrentWorkspaceChange(updated);
      setMessage({ type: "ok", text: "Workspace description updated." });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Could not update description" });
    } finally {
      setLoading(false);
    }
  };

  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1800);
    });
  };

  const downloadWorkspaceCsv = async () => {
    if (!currentWorkspace) return;
    try {
      const r = await authFetch(`${apiBaseUrl}/workspaces/${currentWorkspace.id}/export.csv`);
      if (!r.ok) throw new Error("Download failed.");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${currentWorkspace.name.replace(/\s+/g, "_").toLowerCase()}_export.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setMessage({ type: "err", text: "Could not download CSV." });
    }
  };

  const downloadWorkspaceSnapshot = async () => {
    if (!currentWorkspace) return;
    setSnapshotLoading(true);
    try {
      const r = await authFetch(`${apiBaseUrl}/workspaces/${currentWorkspace.id}`);
      if (!r.ok) throw new Error("Could not load workspace.");
      const data = (await r.json()) as WorkspaceWithState;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${currentWorkspace.name.replace(/\s+/g, "_").toLowerCase()}_snapshot.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage({ type: "ok", text: "Local snapshot downloaded." });
    } catch {
      setMessage({ type: "err", text: "Could not download snapshot." });
    } finally {
      setSnapshotLoading(false);
    }
  };

  const applyEditorCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    if (editorRef.current) {
      setEditDescription(sanitizeHtml(editorRef.current.innerHTML));
    }
  };

  const generateAiReport = async () => {
    if (!currentWorkspace || !workspaceAnalysis) return;
    setAiReportLoading(true);
    setMessage(null);
    try {
      const r = await authFetch(`${apiBaseUrl}/ai/workspaces/${currentWorkspace.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: aiModel, analysis: workspaceAnalysis }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? "Report failed");
      }
      const data = (await r.json()) as { model: string; report: string };
      const safeText = String(data.report || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const reportHtml = `<h2>AI Workspace Report</h2><p>${safeText.replace(/\n/g, "<br/>")}</p>`;
      const merged = sanitizeHtml(`${editDescription ? `${editDescription}<br/><br/>` : ""}${reportHtml}`);
      setEditDescription(merged);
      if (editorRef.current) editorRef.current.innerHTML = merged;
      setMessage({ type: "ok", text: "AI report generated and inserted into workspace notes." });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Could not generate report." });
    } finally {
      setAiReportLoading(false);
    }
  };

  const crunchWorkspaceData = async () => {
    if (!currentWorkspace) return;
    setAnalysisLoading(true);
    setMessage(null);
    try {
      const r = await authFetch(`${apiBaseUrl}/workspaces/${currentWorkspace.id}/analysis`, { method: "POST" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? "Could not crunch workspace data.");
      }
      const data = (await r.json()) as WorkspaceAnalysis;
      setWorkspaceAnalysis(data);
      setMessage({
        type: "ok",
        text: `Data crunched. Best brewery: ${data.best_brewery_name || "N/A"}.`,
      });
    } catch (e) {
      setWorkspaceAnalysis(null);
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Could not crunch workspace data." });
    } finally {
      setAnalysisLoading(false);
    }
  };

  const mergeBreweries = (base: Brewery[], incoming: Brewery[]): Brewery[] => {
    const key = (b: Brewery) => `${b.name.toLowerCase()}|${b.lat.toFixed(5)}|${b.lng.toFixed(5)}`;
    const map = new Map<string, Brewery>();
    for (const b of base) map.set(key(b), b);
    for (const b of incoming) map.set(key(b), b);
    return Array.from(map.values());
  };

  const mergeSuppliers = (base: Supplier[], incoming: Supplier[]): Supplier[] => {
    const key = (s: Supplier) => `${s.name.toLowerCase()}|${s.category}|${s.lat.toFixed(5)}|${s.lng.toFixed(5)}`;
    const map = new Map<string, Supplier>();
    for (const s of base) map.set(key(s), s);
    for (const s of incoming) map.set(key(s), s);
    return Array.from(map.values());
  };

  const importAndMergeSnapshot = async (file: File) => {
    if (!currentWorkspace || !onSaveWorkspaceState) return;
    setSnapshotLoading(true);
    setMessage(null);
    try {
      const text = await file.text();
      const snapshot = JSON.parse(text) as WorkspaceWithState;
      const incomingConfig = (snapshot.state?.config ?? {}) as Record<string, unknown>;
      const incomingResults = (snapshot.state?.results ?? null) as Record<string, unknown> | null;
      const incomingBreweries = extractBreweriesFromConfig(incomingConfig);
      const mergedBreweries = mergeBreweries(breweries, incomingBreweries);
      const incomingSuppliers = extractSuppliersFromConfig(incomingConfig);
      const mergedSuppliers = mergeSuppliers(suppliers, incomingSuppliers);
      const mergedConfig: Record<string, unknown> = {
        ...(incomingConfig || {}),
        breweries: mergedBreweries,
        suppliers: mergedSuppliers,
        currentBreweryId: currentBrewery?.id ?? incomingConfig.currentBreweryId ?? null,
      };
      onSaveWorkspaceState(mergedConfig, incomingResults);
      onLoadWorkspaceState?.(mergedConfig, incomingResults);
      setWorkspaceBreweries(mergedBreweries);
      setWorkspaceSuppliers(mergedSuppliers);
      setMessage({ type: "ok", text: "Snapshot merged into workspace." });
    } catch {
      setMessage({ type: "err", text: "Invalid snapshot file." });
    } finally {
      setSnapshotLoading(false);
    }
  };

  const restoreExampleData = async () => {
    setDemoSeedLoading(true);
    setMessage(null);
    try {
      const r = await authFetch(`${apiBaseUrl}/demo/bootstrap-sample-data`, { method: "POST" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? "Could not add example data.");
      }
      const data = (await r.json()) as { breweries_created?: number; suppliers_created?: number };
      setMessage({
        type: "ok",
        text: `Example data added: ${data.breweries_created ?? 0} breweries, ${data.suppliers_created ?? 0} suppliers.`,
      });
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Could not add example data." });
    } finally {
      setDemoSeedLoading(false);
    }
  };

  useEffect(() => {
    if (!liveSyncEnabled || !currentWorkspace || !onLoadWorkspaceState) return;

    const interval = setInterval(() => {
      authFetch(`${apiBaseUrl}/workspaces/${currentWorkspace.id}`)
        .then(async (r) => {
          if (!r.ok) return null;
          return (await r.json()) as WorkspaceWithState;
        })
        .then((data) => {
          if (!data) return;
          const updatedAt = data.state?.updated_at ?? null;
          if (!updatedAt) return;
          if (lastWorkspaceStateUpdatedAt.current === updatedAt) return;
          lastWorkspaceStateUpdatedAt.current = updatedAt;
          setLastSyncedAt(updatedAt);
          setWorkspaceBreweries(extractBreweriesFromConfig(data.state?.config ?? null));
          setWorkspaceSuppliers(extractSuppliersFromConfig(data.state?.config ?? null));
          onLoadWorkspaceState(data.state?.config ?? null, data.state?.results ?? null);
        })
        .catch(() => {});

      // Also refresh workspace + members list so changes appear live.
      void loadWorkspaces();
      void loadMembers();
    }, 4000);

    return () => clearInterval(interval);
  }, [
    apiBaseUrl,
    authFetch,
    currentWorkspace,
    liveSyncEnabled,
    loadMembers,
    loadWorkspaces,
    onLoadWorkspaceState,
  ]);

  return (
    <section className="collaborate-page">
      <h2>Collaborate</h2>
      <p className="muted" style={{ marginBottom: "1rem" }}>
        Share workspaces with your team, add context with descriptions, and export shared simulation state as CSV.
      </p>

      {message && (
        <p className={message.type === "ok" ? "success" : "error"} style={{ marginBottom: "1rem" }}>
          {message.text}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div className="panel" style={{ padding: "1rem", background: "var(--bg-2)" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Create a workspace</h3>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Workspace name"
            />
            <textarea
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              placeholder="Description (team goals, assumptions, notes)"
              rows={3}
            />
            <button type="button" className="primary-button" disabled={loading} onClick={handleCreate}>
              {loading ? "Creating…" : "Create"}
            </button>
          </div>
        </div>

        <div className="panel" style={{ padding: "1rem", background: "var(--bg-2)" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Join with a code</h3>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="e.g. ABC12X"
              maxLength={32}
              style={{ textTransform: "uppercase", flex: "1 1 180px" }}
            />
            <button type="button" className="primary-button" disabled={loading} onClick={handleJoin}>
              {loading ? "Joining…" : "Join"}
            </button>
          </div>
        </div>

        {workspaces.length > 0 && (
          <div className="panel" style={{ padding: "1rem", background: "var(--bg-2)" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Your workspaces</h3>
            {currentWorkspace ? (
              <div style={{ marginBottom: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setLiveSyncEnabled((v) => !v)}
                >
                  {liveSyncEnabled ? "Live sync: ON" : "Live sync: OFF"}
                </button>
                <span className="muted" style={{ fontSize: "0.8rem" }}>
                  {lastSyncedAt
                    ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}`
                    : "Waiting for first sync..."}
                </span>
              </div>
            ) : null}
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {workspaces.map((ws) => (
                <li
                  key={ws.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "0.5rem",
                    padding: "0.6rem 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div>
                    <strong>{ws.name}</strong>
                    <span className="muted" style={{ marginLeft: "0.5rem" }}>{ws.invite_code}</span>
                    {ws.description ? (
                      <p className="muted" style={{ marginTop: "0.25rem", fontSize: "0.82rem" }}>
                        {stripHtml(ws.description)}
                      </p>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button type="button" className="secondary-button" onClick={() => copyInviteCode(ws.invite_code)}>
                      {copiedCode === ws.invite_code ? "Copied!" : "Copy code"}
                    </button>
                    <button
                      type="button"
                      className={currentWorkspace?.id === ws.id ? "primary-button" : "secondary-button"}
                      onClick={() => void activateWorkspace(currentWorkspace?.id === ws.id ? null : ws)}
                    >
                      {currentWorkspace?.id === ws.id ? "Active" : "Use this"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {currentWorkspace && (
              <div style={{ marginTop: "1rem", display: "grid", gap: "0.5rem" }}>
                <h4>Active workspace notes</h4>
                <div className="editor-toolbar">
                  <button type="button" className="secondary-button" onClick={() => applyEditorCommand("bold")}>B</button>
                  <button type="button" className="secondary-button" onClick={() => applyEditorCommand("italic")}>I</button>
                  <button type="button" className="secondary-button" onClick={() => applyEditorCommand("underline")}>U</button>
                  <button type="button" className="secondary-button" onClick={() => applyEditorCommand("insertUnorderedList")}>• List</button>
                  <button type="button" className="secondary-button" onClick={() => applyEditorCommand("insertOrderedList")}>1. List</button>
                  <button type="button" className="secondary-button" onClick={() => applyEditorCommand("formatBlock", "H2")}>H2</button>
                  <button type="button" className="secondary-button" onClick={() => applyEditorCommand("removeFormat")}>Clear</button>
                </div>
                <div
                  ref={editorRef}
                  className="wordlike-editor"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => {
                    setEditDescription(sanitizeHtml((e.target as HTMLDivElement).innerHTML));
                  }}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(editDescription) }}
                />
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={restoreExampleData}
                    disabled={demoSeedLoading}
                  >
                    {demoSeedLoading ? "Adding examples..." : "Add example data"}
                  </button>
                  <button type="button" className="secondary-button" onClick={saveDescription} disabled={loading}>
                    Save description
                  </button>
                  {onLoadWorkspaceState && (
                    <button type="button" className="secondary-button" onClick={handleLoadFromWorkspace}>
                      Load shared state
                    </button>
                  )}
                  <button type="button" className="secondary-button" onClick={downloadWorkspaceCsv}>
                    Download CSV
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={crunchWorkspaceData}
                    disabled={analysisLoading || aiReportLoading}
                  >
                    {analysisLoading ? "Crunching..." : "Crunch all data"}
                  </button>
                  {workspaceAnalysis ? (
                    <button type="button" className="secondary-button" onClick={generateAiReport} disabled={aiReportLoading}>
                      {aiReportLoading ? "Generating..." : "Generate AI report"}
                    </button>
                  ) : null}
                  <button type="button" className="secondary-button" onClick={downloadWorkspaceSnapshot} disabled={snapshotLoading}>
                    {snapshotLoading ? "Working..." : "Download snapshot"}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={snapshotLoading}
                    onClick={() => snapshotInputRef.current?.click()}
                  >
                    Import + merge snapshot
                  </button>
                  <input
                    ref={snapshotInputRef}
                    type="file"
                    accept="application/json"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.currentTarget.value = "";
                      if (f) void importAndMergeSnapshot(f);
                    }}
                  />
                </div>
                {workspaceAnalysis ? (
                  <div className="panel" style={{ marginTop: "0.5rem", padding: "0.8rem" }}>
                    <h4 style={{ marginBottom: 8 }}>Crunched comparison</h4>
                    <p className="muted" style={{ marginBottom: 6 }}>
                      Breweries: {workspaceAnalysis.brewery_count} | Suppliers: {workspaceAnalysis.supplier_count} | Category coverage:{" "}
                      {(workspaceAnalysis.category_coverage_ratio * 100).toFixed(0)}%
                    </p>
                    <p className="muted" style={{ marginBottom: 6 }}>
                      Best overall: <strong>{workspaceAnalysis.best_brewery_name || "N/A"}</strong>
                    </p>
                    <p className="muted">
                      Ranking: {workspaceAnalysis.rankings.map((r, i) => `#${i + 1} ${r.brewery_name} (${r.combined_score.toFixed(1)})`).join(" | ")}
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}

        {currentWorkspace && (
          <div className="panel" style={{ padding: "1rem", background: "var(--bg-2)" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Breweries & suppliers in this workspace</h3>
            <div style={{ display: "grid", gap: "0.5rem" }}>
              <div>
                <strong style={{ fontSize: "0.82rem" }}>Breweries</strong>
                {workspaceBreweries.length === 0 ? (
                  <p className="muted">No breweries saved in workspace state yet.</p>
                ) : (
                  <p className="muted">{workspaceBreweries.map((b) => b.name).join(", ")}</p>
                )}
              </div>
              <div>
                <strong style={{ fontSize: "0.82rem" }}>Suppliers</strong>
                {workspaceSuppliers.length === 0 ? (
                  <p className="muted">No suppliers saved in workspace state yet.</p>
                ) : (
                  <p className="muted">
                    {workspaceSuppliers.map((s) => `${s.name} (${s.category})`).join(", ")}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {currentWorkspace && members.length > 0 && (
          <div className="panel" style={{ padding: "1rem", background: "var(--bg-2)" }}>
            <h3 style={{ marginBottom: "0.5rem" }}>Sharing with</h3>
            <p className="muted">
              {members.map((m) => `${m.username}${m.role === "owner" ? " (owner)" : ""}`).join(", ")}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export { STORAGE_KEY };
