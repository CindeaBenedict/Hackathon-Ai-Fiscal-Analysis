import React, { useCallback, useEffect, useState } from "react";

export type SupplierCategory = "bottles" | "caps" | "malt" | "yeast" | "ingredients" | "water" | "fuel" | "other";

export type Supplier = {
  id: number;
  name: string;
  category: SupplierCategory;
  lat: number;
  lng: number;
  address: string;
  unit_price: number;
  shipping_cost_per_km: number;
  lead_time_days: number;
  created_at: string;
};

type SuppliersPageProps = {
  apiBaseUrl: string;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  suppliers: Supplier[];
  onSuppliersChange: (list: Supplier[]) => void;
};

const CATEGORIES: SupplierCategory[] = ["bottles", "caps", "malt", "yeast", "ingredients", "water", "fuel", "other"];

export default function SuppliersPage({ apiBaseUrl, authFetch, suppliers, onSuppliersChange }: SuppliersPageProps) {
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string>("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<SupplierCategory>("bottles");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [address, setAddress] = useState("");
  const [unitPrice, setUnitPrice] = useState("0");
  const [shippingCostPerKm, setShippingCostPerKm] = useState("0");
  const [leadTimeDays, setLeadTimeDays] = useState("3");

  const loadSuppliers = useCallback(async () => {
    try {
      const r = await authFetch(`${apiBaseUrl}/suppliers`);
      if (!r.ok) return;
      const data = (await r.json()) as Supplier[];
      onSuppliersChange(data);
    } catch {
      onSuppliersChange([]);
    }
  }, [apiBaseUrl, authFetch, onSuppliersChange]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const clearForm = () => {
    setEditingId(null);
    setName("");
    setCategory("bottles");
    setLat("");
    setLng("");
    setAddress("");
    setUnitPrice("0");
    setShippingCostPerKm("0");
    setLeadTimeDays("3");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pLat = parseFloat(lat);
    const pLng = parseFloat(lng);
    const pUnit = parseFloat(unitPrice);
    const pShip = parseFloat(shippingCostPerKm);
    const pLead = parseInt(leadTimeDays, 10);
    if (!name.trim()) return setMessage("Enter supplier name.");
    if (Number.isNaN(pLat) || pLat < -90 || pLat > 90 || Number.isNaN(pLng) || pLng < -180 || pLng > 180) {
      return setMessage("Enter valid latitude/longitude.");
    }
    if (Number.isNaN(pUnit) || pUnit < 0 || Number.isNaN(pShip) || pShip < 0 || Number.isNaN(pLead) || pLead < 0) {
      return setMessage("Price/cost/lead time must be valid non-negative numbers.");
    }
    setLoading(true);
    setMessage("");
    try {
      const url = editingId == null ? `${apiBaseUrl}/suppliers` : `${apiBaseUrl}/suppliers/${editingId}`;
      const method = editingId == null ? "POST" : "PUT";
      const r = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          lat: pLat,
          lng: pLng,
          address: address.trim() || undefined,
          unit_price: pUnit,
          shipping_cost_per_km: pShip,
          lead_time_days: pLead,
        }),
      });
      if (!r.ok) throw new Error("Could not save supplier.");
      const saved = (await r.json()) as Supplier;
      if (editingId == null) onSuppliersChange([...suppliers, saved]);
      else onSuppliersChange(suppliers.map((s) => (s.id === saved.id ? saved : s)));
      setMessage(`Saved supplier: ${saved.name}`);
      clearForm();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  const edit = (s: Supplier) => {
    setEditingId(s.id);
    setName(s.name);
    setCategory(s.category);
    setLat(String(s.lat));
    setLng(String(s.lng));
    setAddress(s.address || "");
    setUnitPrice(String(s.unit_price ?? 0));
    setShippingCostPerKm(String(s.shipping_cost_per_km ?? 0));
    setLeadTimeDays(String(s.lead_time_days ?? 3));
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this supplier?")) return;
    setLoading(true);
    setMessage("");
    try {
      const r = await authFetch(`${apiBaseUrl}/suppliers/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Could not delete supplier.");
      onSuppliersChange(suppliers.filter((s) => s.id !== id));
      if (editingId === id) clearForm();
      setMessage("Supplier deleted.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <h2>Suppliers & Input Sources</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        Add where your bottles, caps, malt, yeast, water and fuel come from. Simulation now uses brewery-to-supplier distance and shipping prices.
      </p>
      {message ? <p className="muted">{message}</p> : null}

      <form onSubmit={submit} style={{ marginBottom: 14 }}>
        <div className="controls-grid">
          <label>Supplier Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Category
            <select value={category} onChange={(e) => setCategory(e.target.value as SupplierCategory)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>Latitude<input value={lat} onChange={(e) => setLat(e.target.value)} /></label>
          <label>Longitude<input value={lng} onChange={(e) => setLng(e.target.value)} /></label>
          <label>Unit Price ($)<input type="number" min={0} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} /></label>
          <label>Shipping ($/km)<input type="number" min={0} value={shippingCostPerKm} onChange={(e) => setShippingCostPerKm(e.target.value)} /></label>
          <label>Lead Time (days)<input type="number" min={0} value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} /></label>
          <label>Address (optional)<input value={address} onChange={(e) => setAddress(e.target.value)} /></label>
        </div>
        <div className="actions-row" style={{ marginTop: 8 }}>
          <button type="submit" className="primary-button" disabled={loading}>{loading ? "Saving..." : editingId == null ? "Add Supplier" : "Update Supplier"}</button>
          {editingId != null ? <button type="button" className="secondary-button" onClick={clearForm}>Cancel</button> : null}
        </div>
      </form>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Name</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Category</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Unit $</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Ship $/km</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Lead days</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Coords</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "6px 8px" }}>{s.name}</td>
                <td style={{ padding: "6px 8px", textTransform: "capitalize" }}>{s.category}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{s.unit_price.toFixed(2)}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{s.shipping_cost_per_km.toFixed(3)}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>{s.lead_time_days}</td>
                <td style={{ padding: "6px 8px" }}>{s.lat.toFixed(3)}, {s.lng.toFixed(3)}</td>
                <td style={{ padding: "6px 8px", textAlign: "right" }}>
                  <button type="button" className="secondary-button" onClick={() => edit(s)} style={{ marginRight: 6 }}>Edit</button>
                  <button type="button" className="secondary-button" onClick={() => void remove(s.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {suppliers.length === 0 ? (
              <tr><td colSpan={7} className="muted" style={{ padding: "8px" }}>No suppliers yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
