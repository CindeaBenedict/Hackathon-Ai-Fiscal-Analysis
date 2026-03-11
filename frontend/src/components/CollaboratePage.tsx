import React, { useCallback, useEffect, useState } from "react";

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

type CollaboratePageProps = {
  apiBaseUrl: string;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  currentWorkspace: Workspace | null;
  onCurrentWorkspaceChange: (ws: Workspace | null) => void;
  onLoadWorkspaceState?: (config: Record<string, unknown> | null, results: Record<string, unknown> | null) => void;
};

const STORAGE_KEY = "supply_chain_current_workspace_id";

export default function CollaboratePage({
  apiBaseUrl,
  authFetch,
  currentWorkspace,
  onCurrentWorkspaceChange,
  onLoadWorkspaceState,
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

  const loadWorkspaces = useCallback(async () => {
    try {
      const r = await authFetch(`${apiBaseUrl}/workspaces`);
      if (!r.ok) return;
      const data = (await r.json()) as Workspace[];
      setWorkspaces(data);
      if (currentWorkspace) {
        const fresh = data.find((w) => w.id === currentWorkspace.id);
        if (fresh) setEditDescription(fresh.description || "");
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
        setMessage({ type: "ok", text: "Loaded shared config and results." });
      } else {
        setMessage({ type: "err", text: "No saved state in this workspace yet." });
      }
    } catch {
      setMessage({ type: "err", text: "Could not load workspace state." });
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

  return (
    <section className="panel" style={{ maxWidth: "48rem" }}>
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
                        {ws.description}
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
                      onClick={() => onCurrentWorkspaceChange(currentWorkspace?.id === ws.id ? null : ws)}
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
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  placeholder="Add context for collaborators"
                />
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
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
                </div>
              </div>
            )}
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
