import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type Brewery = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  address: string;
  description: string;
  avg_monthly_revenue: number;
  quality_score: number;
  efficiency_score: number;
  popularity_score: number;
  sustainability_score: number;
  created_at: string;
};

type BreweriesPageProps = {
  apiBaseUrl: string;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  breweries: Brewery[];
  onBreweriesChange: (list: Brewery[]) => void;
  currentBrewery: Brewery | null;
  onCurrentBreweryChange: (b: Brewery | null) => void;
};

type BreweryCompareResult = {
  best_brewery_id: number;
  best_brewery_name: string;
  rankings: Array<{
    brewery_id: number;
    brewery_name: string;
    score: number;
    breakdown: {
      revenue_score: number;
      quality_score: number;
      efficiency_score: number;
      popularity_score: number;
      sustainability_score: number;
      weighted_total: number;
    };
  }>;
  ai_summary: string;
};

type ComparisonDraft = {
  avg_monthly_revenue: string;
  quality_score: string;
  efficiency_score: string;
  popularity_score: string;
  sustainability_score: string;
};

// Fix default marker icons in react-leaflet with bundlers
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

function FitBounds({ breweries }: { breweries: Brewery[] }) {
  const map = useMap();
  useEffect(() => {
    if (breweries.length === 0) return;
    if (breweries.length === 1) {
      map.setView([breweries[0].lat, breweries[0].lng], 10);
      return;
    }
    const bounds = L.latLngBounds(breweries.map((b) => [b.lat, b.lng] as L.LatLngTuple));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }, [map, breweries]);
  return null;
}

export default function BreweriesPage({
  apiBaseUrl,
  authFetch,
  breweries,
  onBreweriesChange,
  currentBrewery,
  onCurrentBreweryChange,
}: BreweriesPageProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formLat, setFormLat] = useState("");
  const [formLng, setFormLng] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formRevenue, setFormRevenue] = useState("0");
  const [formQuality, setFormQuality] = useState("50");
  const [formEfficiency, setFormEfficiency] = useState("50");
  const [formPopularity, setFormPopularity] = useState("50");
  const [formSustainability, setFormSustainability] = useState("50");
  const [isCreating, setIsCreating] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResult, setCompareResult] = useState<BreweryCompareResult | null>(null);
  const [comparisonDrafts, setComparisonDrafts] = useState<Record<number, ComparisonDraft>>({});
  const [savingDraftId, setSavingDraftId] = useState<number | null>(null);

  const loadBreweries = useCallback(async () => {
    try {
      const r = await authFetch(`${apiBaseUrl}/breweries`);
      if (!r.ok) return;
      const data = (await r.json()) as Brewery[];
      onBreweriesChange(data);
    } catch {
      onBreweriesChange([]);
    }
  }, [apiBaseUrl, authFetch, onBreweriesChange]);

  useEffect(() => {
    loadBreweries();
  }, [loadBreweries]);

  useEffect(() => {
    setComparisonDrafts((prev) => {
      const next: Record<number, ComparisonDraft> = {};
      for (const b of breweries) {
        next[b.id] = prev[b.id] ?? {
          avg_monthly_revenue: String(b.avg_monthly_revenue ?? 0),
          quality_score: String(b.quality_score ?? 50),
          efficiency_score: String(b.efficiency_score ?? 50),
          popularity_score: String(b.popularity_score ?? 50),
          sustainability_score: String(b.sustainability_score ?? 50),
        };
      }
      return next;
    });
  }, [breweries]);

  const clearForm = () => {
    setFormName("");
    setFormLat("");
    setFormLng("");
    setFormAddress("");
    setFormDescription("");
    setFormRevenue("0");
    setFormQuality("50");
    setFormEfficiency("50");
    setFormPopularity("50");
    setFormSustainability("50");
    setEditingId(null);
    setIsCreating(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(formLat);
    const lng = parseFloat(formLng);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setMessage({ type: "err", text: "Enter valid latitude (-90–90) and longitude (-180–180)." });
      return;
    }
    if (!formName.trim()) {
      setMessage({ type: "err", text: "Enter a brewery name." });
      return;
    }
    const avgMonthlyRevenue = parseFloat(formRevenue);
    const qualityScore = parseFloat(formQuality);
    const efficiencyScore = parseFloat(formEfficiency);
    const popularityScore = parseFloat(formPopularity);
    const sustainabilityScore = parseFloat(formSustainability);
    const scoreValues = [qualityScore, efficiencyScore, popularityScore, sustainabilityScore];
    if (isNaN(avgMonthlyRevenue) || avgMonthlyRevenue < 0) {
      setMessage({ type: "err", text: "Enter a valid monthly revenue (>= 0)." });
      return;
    }
    if (scoreValues.some((s) => isNaN(s) || s < 0 || s > 100)) {
      setMessage({ type: "err", text: "All score fields must be between 0 and 100." });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      if (editingId != null) {
        const r = await authFetch(`${apiBaseUrl}/breweries/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName.trim(),
            lat,
            lng,
            address: formAddress.trim() || undefined,
            description: formDescription.trim() || undefined,
            avg_monthly_revenue: avgMonthlyRevenue,
            quality_score: qualityScore,
            efficiency_score: efficiencyScore,
            popularity_score: popularityScore,
            sustainability_score: sustainabilityScore,
          }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error((err as { detail?: string }).detail || "Update failed");
        }
        const updated = (await r.json()) as Brewery;
        onBreweriesChange(
          breweries.map((b) => (b.id === editingId ? updated : b))
        );
        setMessage({ type: "ok", text: `"${updated.name}" updated.` });
      } else {
        const r = await authFetch(`${apiBaseUrl}/breweries`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName.trim(),
            lat,
            lng,
            address: formAddress.trim() || undefined,
            description: formDescription.trim() || undefined,
            avg_monthly_revenue: avgMonthlyRevenue,
            quality_score: qualityScore,
            efficiency_score: efficiencyScore,
            popularity_score: popularityScore,
            sustainability_score: sustainabilityScore,
          }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error((err as { detail?: string }).detail || "Create failed");
        }
        const created = (await r.json()) as Brewery;
        onBreweriesChange([...breweries, created]);
        setMessage({ type: "ok", text: `"${created.name}" added.` });
      }
      clearForm();
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this brewery from the map?")) return;
    setLoading(true);
    setMessage(null);
    try {
      const r = await authFetch(`${apiBaseUrl}/breweries/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
      onBreweriesChange(breweries.filter((b) => b.id !== id));
      if (currentBrewery?.id === id) onCurrentBreweryChange(null);
      setMessage({ type: "ok", text: "Brewery removed." });
      clearForm();
    } catch {
      setMessage({ type: "err", text: "Could not delete brewery." });
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (b: Brewery) => {
    setEditingId(b.id);
    setFormName(b.name);
    setFormLat(String(b.lat));
    setFormLng(String(b.lng));
    setFormAddress(b.address || "");
    setFormDescription(b.description || "");
    setFormRevenue(String(b.avg_monthly_revenue ?? 0));
    setFormQuality(String(b.quality_score ?? 50));
    setFormEfficiency(String(b.efficiency_score ?? 50));
    setFormPopularity(String(b.popularity_score ?? 50));
    setFormSustainability(String(b.sustainability_score ?? 50));
    setIsCreating(false);
  };

  const runComparison = async () => {
    if (breweries.length < 2) {
      setMessage({ type: "err", text: "Add at least two breweries to compare." });
      return;
    }
    setCompareLoading(true);
    setMessage(null);
    try {
      const r = await authFetch(`${apiBaseUrl}/ai/breweries/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brewery_ids: breweries.map((b) => b.id) }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || "Comparison failed");
      }
      const data = (await r.json()) as BreweryCompareResult;
      setCompareResult(data);
      setMessage({ type: "ok", text: `Best brewery right now: ${data.best_brewery_name}` });
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "Comparison failed",
      });
    } finally {
      setCompareLoading(false);
    }
  };

  const setDraftField = (breweryId: number, field: keyof ComparisonDraft, value: string) => {
    setComparisonDrafts((prev) => ({
      ...prev,
      [breweryId]: {
        ...(prev[breweryId] ?? {
          avg_monthly_revenue: "0",
          quality_score: "50",
          efficiency_score: "50",
          popularity_score: "50",
          sustainability_score: "50",
        }),
        [field]: value,
      },
    }));
  };

  const saveDraftForBrewery = async (brewery: Brewery) => {
    const draft = comparisonDrafts[brewery.id];
    if (!draft) return;
    const avgMonthlyRevenue = parseFloat(draft.avg_monthly_revenue);
    const qualityScore = parseFloat(draft.quality_score);
    const efficiencyScore = parseFloat(draft.efficiency_score);
    const popularityScore = parseFloat(draft.popularity_score);
    const sustainabilityScore = parseFloat(draft.sustainability_score);
    const scoreValues = [qualityScore, efficiencyScore, popularityScore, sustainabilityScore];
    if (isNaN(avgMonthlyRevenue) || avgMonthlyRevenue < 0) {
      setMessage({ type: "err", text: `Invalid revenue for ${brewery.name}.` });
      return;
    }
    if (scoreValues.some((s) => isNaN(s) || s < 0 || s > 100)) {
      setMessage({ type: "err", text: `Scores for ${brewery.name} must be between 0 and 100.` });
      return;
    }
    setSavingDraftId(brewery.id);
    setMessage(null);
    try {
      const r = await authFetch(`${apiBaseUrl}/breweries/${brewery.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avg_monthly_revenue: avgMonthlyRevenue,
          quality_score: qualityScore,
          efficiency_score: efficiencyScore,
          popularity_score: popularityScore,
          sustainability_score: sustainabilityScore,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail || "Save failed");
      }
      const updated = (await r.json()) as Brewery;
      onBreweriesChange(breweries.map((b) => (b.id === updated.id ? updated : b)));
      if (currentBrewery?.id === updated.id) {
        onCurrentBreweryChange(updated);
      }
      setMessage({ type: "ok", text: `${updated.name} comparison values updated.` });
    } catch (err) {
      setMessage({ type: "err", text: err instanceof Error ? err.message : "Could not update values." });
    } finally {
      setSavingDraftId(null);
    }
  };

  const defaultCenter: [number, number] = useMemo(() => [39.5, -98], []);
  const showForm = isCreating || editingId != null;

  return (
    <section className="breweries-page">
      <div className="breweries-layout">
        <div className="breweries-list-panel">
          <h2>Breweries</h2>
          <p className="muted" style={{ marginBottom: 12 }}>
            Add locations to see them on the map. Select one to focus the dashboard on that brewery.
          </p>
          {message && (
            <p className={message.type === "err" ? "error" : "muted"} style={{ marginBottom: 12 }}>
              {message.text}
            </p>
          )}

          {!showForm ? (
            <button
              type="button"
              className="primary-button"
              style={{ marginBottom: 16 }}
              onClick={() => {
                setIsCreating(true);
                setFormName("");
                setFormLat("");
                setFormLng("");
                setFormAddress("");
                setFormDescription("");
                setEditingId(null);
              }}
            >
              + Add brewery
            </button>
          ) : (
            <form onSubmit={handleSubmit} className="panel" style={{ padding: 16, marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12 }}>
                {editingId != null ? "Edit brewery" : "New brewery"}
              </h3>
              <label style={{ display: "block", marginBottom: 8 }}>
                Name
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Hops & Grain"
                  className="input"
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <label>
                  Latitude
                  <input
                    type="text"
                    value={formLat}
                    onChange={(e) => setFormLat(e.target.value)}
                    placeholder="e.g. 30.27"
                    className="input"
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label>
                  Longitude
                  <input
                    type="text"
                    value={formLng}
                    onChange={(e) => setFormLng(e.target.value)}
                    placeholder="e.g. -97.74"
                    className="input"
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
              </div>
              <label style={{ display: "block", marginBottom: 12 }}>
                Address (optional)
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Street, city, state"
                  className="input"
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>
              <label style={{ display: "block", marginBottom: 12 }}>
                Description (optional)
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="What this brewery focuses on"
                  rows={2}
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <label>
                  Avg Monthly Revenue ($)
                  <input
                    type="number"
                    min={0}
                    value={formRevenue}
                    onChange={(e) => setFormRevenue(e.target.value)}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label>
                  Quality Score (0-100)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formQuality}
                    onChange={(e) => setFormQuality(e.target.value)}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label>
                  Efficiency Score (0-100)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formEfficiency}
                    onChange={(e) => setFormEfficiency(e.target.value)}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label>
                  Popularity Score (0-100)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formPopularity}
                    onChange={(e) => setFormPopularity(e.target.value)}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label style={{ gridColumn: "1 / -1" }}>
                  Sustainability Score (0-100)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formSustainability}
                    onChange={(e) => setFormSustainability(e.target.value)}
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="submit" className="primary-button" disabled={loading}>
                  {loading ? "Saving…" : editingId != null ? "Update" : "Add"}
                </button>
                <button type="button" className="secondary-button" onClick={clearForm}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          <ul className="breweries-list">
            {breweries.length === 0 && (
              <li className="muted">No breweries yet. Add one to get started.</li>
            )}
            {breweries.map((b) => (
              <li
                key={b.id}
                className={`brewery-item ${currentBrewery?.id === b.id ? "selected" : ""}`}
              >
                <button
                  type="button"
                  className="brewery-item-btn"
                  onClick={() =>
                    currentBrewery?.id === b.id
                      ? onCurrentBreweryChange(null)
                      : onCurrentBreweryChange(b)
                  }
                >
                  <strong>{b.name}</strong>
                  <span className="muted">
                    {b.lat.toFixed(4)}, {b.lng.toFixed(4)}
                  </span>
                  <span className="muted">
                    Revenue: ${b.avg_monthly_revenue.toLocaleString()} | Quality {b.quality_score.toFixed(0)}
                  </span>
                </button>
                <div className="brewery-item-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                    onClick={() => startEdit(b)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ fontSize: "0.75rem", padding: "4px 8px", color: "var(--danger)" }}
                    onClick={() => handleDelete(b.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="panel" style={{ marginTop: 16, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <h3 style={{ margin: 0 }}>Brewery Comparison</h3>
              <button type="button" className="primary-button" onClick={runComparison} disabled={compareLoading}>
                {compareLoading ? "Comparing..." : "Compare Breweries"}
              </button>
            </div>
            <p className="muted" style={{ marginTop: 8, marginBottom: 8 }}>
              Edit each brewery's comparison values below and save per row.
            </p>
            <div style={{ overflowX: "auto", marginBottom: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 8px" }}>Brewery</th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>Revenue</th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>Quality</th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>Efficiency</th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>Popularity</th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>Sustainability</th>
                    <th style={{ textAlign: "right", padding: "6px 8px" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {breweries.map((b) => {
                    const draft = comparisonDrafts[b.id] ?? {
                      avg_monthly_revenue: String(b.avg_monthly_revenue ?? 0),
                      quality_score: String(b.quality_score ?? 50),
                      efficiency_score: String(b.efficiency_score ?? 50),
                      popularity_score: String(b.popularity_score ?? 50),
                      sustainability_score: String(b.sustainability_score ?? 50),
                    };
                    return (
                      <tr key={b.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{b.name}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <input type="number" min={0} value={draft.avg_monthly_revenue} onChange={(e) => setDraftField(b.id, "avg_monthly_revenue", e.target.value)} style={{ width: 110 }} />
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <input type="number" min={0} max={100} value={draft.quality_score} onChange={(e) => setDraftField(b.id, "quality_score", e.target.value)} style={{ width: 76 }} />
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <input type="number" min={0} max={100} value={draft.efficiency_score} onChange={(e) => setDraftField(b.id, "efficiency_score", e.target.value)} style={{ width: 76 }} />
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <input type="number" min={0} max={100} value={draft.popularity_score} onChange={(e) => setDraftField(b.id, "popularity_score", e.target.value)} style={{ width: 76 }} />
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <input type="number" min={0} max={100} value={draft.sustainability_score} onChange={(e) => setDraftField(b.id, "sustainability_score", e.target.value)} style={{ width: 76 }} />
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>
                          <button type="button" className="secondary-button" onClick={() => void saveDraftForBrewery(b)} disabled={savingDraftId === b.id}>
                            {savingDraftId === b.id ? "Saving..." : "Save"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {compareResult ? (
              <div style={{ marginTop: 10 }}>
                <p>
                  <strong>Best:</strong> {compareResult.best_brewery_name}
                </p>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "6px 8px" }}>Brewery</th>
                        <th style={{ textAlign: "right", padding: "6px 8px" }}>Score</th>
                        <th style={{ textAlign: "right", padding: "6px 8px" }}>Revenue</th>
                        <th style={{ textAlign: "right", padding: "6px 8px" }}>Quality</th>
                        <th style={{ textAlign: "right", padding: "6px 8px" }}>Efficiency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compareResult.rankings.map((r) => (
                        <tr key={r.brewery_id} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "6px 8px" }}>{r.brewery_name}</td>
                          <td style={{ textAlign: "right", padding: "6px 8px" }}>{r.score.toFixed(2)}</td>
                          <td style={{ textAlign: "right", padding: "6px 8px" }}>{r.breakdown.revenue_score.toFixed(1)}</td>
                          <td style={{ textAlign: "right", padding: "6px 8px" }}>{r.breakdown.quality_score.toFixed(1)}</td>
                          <td style={{ textAlign: "right", padding: "6px 8px" }}>{r.breakdown.efficiency_score.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="panel" style={{ marginTop: 8, padding: 10 }}>
                  <h4 style={{ marginBottom: 6 }}>AI: What the top brewery is doing right</h4>
                  <p style={{ whiteSpace: "pre-wrap" }}>{compareResult.ai_summary}</p>
                </div>
              </div>
            ) : (
              <p className="muted" style={{ marginTop: 8 }}>
                Run a comparison to rank breweries and get AI guidance.
              </p>
            )}
          </div>
        </div>

        <div className="breweries-map-wrap">
          <MapContainer
            center={defaultCenter}
            zoom={4}
            className="breweries-map"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds breweries={breweries} />
            {breweries.map((b) => (
              <Marker
                key={b.id}
                position={[b.lat, b.lng]}
                eventHandlers={{
                  click: () =>
                    currentBrewery?.id === b.id
                      ? onCurrentBreweryChange(null)
                      : onCurrentBreweryChange(b),
                }}
              >
                <Popup>
                  <strong>{b.name}</strong>
                  {b.address && <br />}
                  {b.address && <span>{b.address}</span>}
                  {b.description && <><br /><span>{b.description}</span></>}
                  <br />
                  <span className="muted">
                    {b.lat.toFixed(4)}, {b.lng.toFixed(4)}
                  </span>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </section>
  );
}
