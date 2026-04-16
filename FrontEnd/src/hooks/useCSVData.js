import { useState, useEffect } from "react";
import Papa from "papaparse";

const DATA_SOURCE = "csv"; // change to "api" when backend is ready

/**
 * Generic hook for all use cases.
 * Usage:
 *   const { data, loading, error } = useCSVData("queue_management", filters);
 *
 * csvName maps to:  /data/{csvName}.csv
 * apiPath maps to:  /api/{csvName}
 */
export function useCSVData(csvName, filters = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    if (DATA_SOURCE === "api") {
      const params = new URLSearchParams(
        Object.entries(filters).filter(([, v]) => v !== "" && v != null)
      );
      fetch(`/api/${csvName}?${params.toString()}`)
        .then((res) => {
          if (!res.ok) throw new Error(`API error: ${res.status}`);
          return res.json();
        })
        .then((json) => { setData(json); setLoading(false); })
        .catch((err) => { setError(err.message); setLoading(false); });
      return;
    }

    // CSV mode — apply all non-empty filters client-side
    Papa.parse(`/data/${csvName}.csv`, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        let rows = results.data;

        Object.entries(filters).forEach(([key, value]) => {
          if (!value || value === "") return;
          // Date range handling
          if (key === "dateFrom") {
            rows = rows.filter(
              (r) => new Date(r.simulated_timestamp) >= new Date(value)
            );
          } else if (key === "dateTo") {
            rows = rows.filter(
              (r) => new Date(r.simulated_timestamp) <= new Date(value)
            );
          } else {
            // Map camelCase filter keys to snake_case CSV column names
            const colName = key.replace(/([A-Z])/g, "_$1").toLowerCase();
            rows = rows.filter((r) => r[colName] === value || r[key] === value);
          }
        });

        setData(rows);
        setLoading(false);
      },
      error: (err) => { setError(err.message); setLoading(false); },
    });
  }, [csvName, ...Object.values(filters)]);

  return { data, loading, error };
}
