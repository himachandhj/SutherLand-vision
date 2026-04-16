import { useState } from "react";
import { usePPEData } from "../hooks/usePPEData";

// ─── Unique filter options derived from data ───────────────────────────────
function uniqueValues(data, key) {
  return [...new Set(data.map((r) => r[key]).filter(Boolean))].sort();
}

// ─── KPI Card ──────────────────────────────────────────────────────────────
function KPICard({ label, value, highlight }) {
  return (
    <div style={{
      background: "var(--color-background-secondary)",
      border: "1px solid var(--color-border-tertiary)",
      borderRadius: 12,
      padding: "20px 24px",
      flex: 1,
      minWidth: 140,
    }}>
      <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{
        fontSize: 28,
        fontWeight: 500,
        color: highlight ? "var(--color-text-danger)" : "var(--color-text-primary)",
      }}>
        {value}
      </div>
    </div>
  );
}

// ─── Filter Row ────────────────────────────────────────────────────────────
function FilterSelect({ label, value, onChange, options }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 140 }}>
      <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: "7px 10px",
          borderRadius: 8,
          border: "1px solid var(--color-border-secondary)",
          background: "var(--color-background-primary)",
          color: "var(--color-text-primary)",
          fontSize: 14,
        }}
      >
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ─── Loading Spinner ───────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ textAlign: "center", padding: 48, color: "var(--color-text-secondary)" }}>
      Loading data...
    </div>
  );
}

// ─── Error Banner ──────────────────────────────────────────────────────────
function ErrorBanner({ message }) {
  return (
    <div style={{
      background: "var(--color-background-danger)",
      color: "var(--color-text-danger)",
      border: "1px solid var(--color-border-danger)",
      borderRadius: 8,
      padding: "12px 16px",
      marginBottom: 16,
    }}>
      Failed to load data: {message}
    </div>
  );
}

// ─── Main Dashboard Component ──────────────────────────────────────────────
export default function PPEDashboard() {
  const [filters, setFilters] = useState({
    zone: "",
    shift: "",
    cameraId: "",
    location: "",
    status: "",
    dateFrom: "",
    dateTo: "",
  });

  const {
    data,
    loading,
    error,
    totalWorkers,
    violations,
    compliant,
    complianceRate,
  } = usePPEData(filters);

  // Build filter options dynamically from unfiltered data
  // (we pass empty filters here to always get all options)
  const { data: allData } = usePPEData({});

  const setFilter = (key) => (value) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const resetFilters = () =>
    setFilters({ zone: "", shift: "", cameraId: "", location: "", status: "", dateFrom: "", dateTo: "" });

  return (
    <div style={{ padding: "24px", fontFamily: "var(--font-sans)" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>PPE Detection Dashboard</h1>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "4px 0 0" }}>
          Showing {data.length} records
        </p>
      </div>

      {/* Error */}
      {error && <ErrorBanner message={error} />}

      {/* Filters */}
      <div style={{
        background: "var(--color-background-secondary)",
        border: "1px solid var(--color-border-tertiary)",
        borderRadius: 12,
        padding: 20,
        marginBottom: 24,
      }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 14 }}>Filters</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
          <FilterSelect label="Zone" value={filters.zone} onChange={setFilter("zone")}
            options={uniqueValues(allData, "zone")} />
          <FilterSelect label="Shift" value={filters.shift} onChange={setFilter("shift")}
            options={uniqueValues(allData, "shift")} />
          <FilterSelect label="Camera" value={filters.cameraId} onChange={setFilter("cameraId")}
            options={uniqueValues(allData, "camera_id")} />
          <FilterSelect label="Location" value={filters.location} onChange={setFilter("location")}
            options={uniqueValues(allData, "location")} />
          <FilterSelect label="Status" value={filters.status} onChange={setFilter("status")}
            options={["Compliant", "Violation"]} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>From</label>
            <input type="datetime-local" value={filters.dateFrom}
              onChange={(e) => setFilter("dateFrom")(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 14 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>To</label>
            <input type="datetime-local" value={filters.dateTo}
              onChange={(e) => setFilter("dateTo")(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 14 }} />
          </div>
          <button onClick={resetFilters} style={{
            padding: "8px 16px", borderRadius: 8, border: "none",
            background: "var(--color-background-danger)", color: "var(--color-text-danger)",
            fontSize: 13, cursor: "pointer", fontWeight: 500,
          }}>
            Reset Filters
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {loading ? <Spinner /> : (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
            <KPICard label="Total Workers Detected" value={totalWorkers} />
            <KPICard label="Compliant Workers" value={compliant} />
            <KPICard label="Violations" value={violations} />
            <KPICard label="Compliance Rate %" value={`${complianceRate}%`} highlight={parseFloat(complianceRate) < 80} />
          </div>

          {/* Data Table */}
          <div style={{
            background: "var(--color-background-secondary)",
            border: "1px solid var(--color-border-tertiary)",
            borderRadius: 12,
            overflow: "hidden",
          }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--color-background-tertiary)" }}>
                    {["Person ID", "Camera", "Location", "Zone", "Shift", "Helmet", "Vest", "Gloves", "Boots", "Violation Type", "Status", "Timestamp"].map((h) => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 500, color: "var(--color-text-secondary)", borderBottom: "1px solid var(--color-border-tertiary)", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--color-border-tertiary)" }}>
                      <td style={{ padding: "9px 14px" }}>{row.person_id}</td>
                      <td style={{ padding: "9px 14px" }}>{row.camera_id}</td>
                      <td style={{ padding: "9px 14px" }}>{row.location}</td>
                      <td style={{ padding: "9px 14px" }}>{row.zone}</td>
                      <td style={{ padding: "9px 14px" }}>{row.shift}</td>
                      <td style={{ padding: "9px 14px", color: row.helmet_worn === "No" ? "var(--color-text-danger)" : "var(--color-text-success)" }}>{row.helmet_worn}</td>
                      <td style={{ padding: "9px 14px", color: row.vest_worn === "No" ? "var(--color-text-danger)" : "var(--color-text-success)" }}>{row.vest_worn}</td>
                      <td style={{ padding: "9px 14px", color: row.gloves_worn === "No" ? "var(--color-text-danger)" : "var(--color-text-success)" }}>{row.gloves_worn}</td>
                      <td style={{ padding: "9px 14px", color: row.boots_worn === "No" ? "var(--color-text-danger)" : "var(--color-text-success)" }}>{row.boots_worn}</td>
                      <td style={{ padding: "9px 14px" }}>{row.violation_type}</td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{
                          padding: "2px 8px", borderRadius: 99, fontSize: 12,
                          background: row.status === "Compliant" ? "var(--color-background-success)" : "var(--color-background-danger)",
                          color: row.status === "Compliant" ? "var(--color-text-success)" : "var(--color-text-danger)",
                        }}>
                          {row.status}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px", whiteSpace: "nowrap", color: "var(--color-text-secondary)" }}>{row.simulated_timestamp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.length === 0 && (
                <div style={{ textAlign: "center", padding: 32, color: "var(--color-text-secondary)" }}>
                  No records match the selected filters.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
