import { useState, useEffect } from "react";
import Papa from "papaparse";

const DATA_SOURCE = "csv"; // change to "api" when backend is ready
const CSV_URL = "/data/ppe_detection.csv";
const API_URL = "/api/ppe_events";

export function usePPEData(filters = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    if (DATA_SOURCE === "api") {
      const params = new URLSearchParams();
      if (filters.zone)        params.append("zone", filters.zone);
      if (filters.shift)       params.append("shift", filters.shift);
      if (filters.cameraId)    params.append("camera_id", filters.cameraId);
      if (filters.location)    params.append("location", filters.location);
      if (filters.status)      params.append("status", filters.status);
      if (filters.dateFrom)    params.append("date_from", filters.dateFrom);
      if (filters.dateTo)      params.append("date_to", filters.dateTo);

      fetch(`${API_URL}?${params.toString()}`)
        .then((res) => {
          if (!res.ok) throw new Error(`API error: ${res.status}`);
          return res.json();
        })
        .then((json) => {
          setData(json);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });

      return;
    }

    // CSV mode
    Papa.parse(CSV_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        let rows = results.data;

        if (filters.zone)
          rows = rows.filter((r) => r.zone === filters.zone);
        if (filters.shift)
          rows = rows.filter((r) => r.shift === filters.shift);
        if (filters.cameraId)
          rows = rows.filter((r) => r.camera_id === filters.cameraId);
        if (filters.location)
          rows = rows.filter((r) => r.location === filters.location);
        if (filters.status)
          rows = rows.filter((r) => r.status === filters.status);
        if (filters.dateFrom)
          rows = rows.filter(
            (r) => new Date(r.simulated_timestamp) >= new Date(filters.dateFrom)
          );
        if (filters.dateTo)
          rows = rows.filter(
            (r) => new Date(r.simulated_timestamp) <= new Date(filters.dateTo)
          );

        setData(rows);
        setLoading(false);
      },
      error: (err) => {
        setError(err.message);
        setLoading(false);
      },
    });
  }, [
    filters.zone,
    filters.shift,
    filters.cameraId,
    filters.location,
    filters.status,
    filters.dateFrom,
    filters.dateTo,
  ]);

  // Derived KPI values computed from filtered data
  const totalWorkers = data.length;
  const violations = data.filter((r) => r.status === "Violation").length;
  const compliant = data.filter((r) => r.status === "Compliant").length;
  const complianceRate =
    totalWorkers > 0
      ? ((compliant / totalWorkers) * 100).toFixed(1)
      : "0.0";

  return { data, loading, error, totalWorkers, violations, compliant, complianceRate };
}
