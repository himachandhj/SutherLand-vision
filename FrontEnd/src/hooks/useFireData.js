import { useState, useEffect } from "react";
import Papa from "papaparse";

const DATA_SOURCE = "csv"; // change to "api" when backend is ready
const CSV_URL = "/data/fire_detection.csv";
const API_URL = "/api/fire_events";

export function useFireData(filters = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    if (DATA_SOURCE === "api") {
      const params = new URLSearchParams();
      if (filters.zone)      params.append("zone", filters.zone);
      if (filters.location)  params.append("location", filters.location);
      if (filters.severity)  params.append("severity", filters.severity);
      if (filters.cameraId)  params.append("camera_id", filters.cameraId);
      if (filters.dateFrom)  params.append("date_from", filters.dateFrom);
      if (filters.dateTo)    params.append("date_to", filters.dateTo);

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
        if (filters.location)
          rows = rows.filter((r) => r.location === filters.location);
        if (filters.severity)
          rows = rows.filter((r) => r.severity === filters.severity);
        if (filters.cameraId)
          rows = rows.filter((r) => r.camera_id === filters.cameraId);
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
    filters.location,
    filters.severity,
    filters.cameraId,
    filters.dateFrom,
    filters.dateTo,
  ]);

  // Derived KPIs
  const totalDetections = data.length;
  const fireDetected = data.filter((r) => r.fire_detected === "Yes").length;
  const smokeDetected = data.filter((r) => r.smoke_detected === "Yes").length;
  const criticalAlerts = data.filter((r) => r.severity === "Critical").length;

  return { data, loading, error, totalDetections, fireDetected, smokeDetected, criticalAlerts };
}
