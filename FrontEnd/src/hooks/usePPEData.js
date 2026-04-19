import { useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const API_URL = `${API_BASE_URL}/api/ppe/metrics`;
const POLL_INTERVAL_MS = 15000;

function appendFilterValues(params, key, value) {
  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (item && item !== "All") params.append(key, item);
    });
    return;
  }
  if (value && value !== "All") {
    params.append(key, value);
  }
}

export function usePPEData(filters = {}, enabled = true) {
  const [data, setData] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      setData([]);
      setMetrics({});
      setLoading(false);
      setError("");
      return undefined;
    }

    let active = true;
    let currentController = null;

    const load = async ({ silent = false } = {}) => {
      if (!silent) {
        setLoading(true);
      }
      setError("");

      try {
        currentController?.abort();
        const controller = new AbortController();
        currentController = controller;
        const params = new URLSearchParams();
        if (filters.from) params.append("date_from", filters.from);
        if (filters.to) params.append("date_to", filters.to);
        if (filters.location && filters.location !== "All") params.append("location", filters.location);
        appendFilterValues(params, "zone", filters.zone);
        appendFilterValues(params, "camera_id", filters.cameraId);
        appendFilterValues(params, "shift", filters.shift);
        if (filters.complianceStatus && filters.complianceStatus !== "All") {
          params.append("compliance_status", filters.complianceStatus);
        }

        const response = await fetch(`${API_URL}?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`PPE metrics request failed: ${response.status}`);
        }

        const payload = await response.json();
        if (!active) return;
        setData(Array.isArray(payload.records) ? payload.records : []);
        setMetrics(payload.summary ?? {});
      } catch (fetchError) {
        if (!active || fetchError?.name === "AbortError") return;
        setError(fetchError.message || "Unable to load PPE dashboard data.");
      } finally {
        if (active && !silent) setLoading(false);
      }
    };

    load();
    const interval = window.setInterval(() => {
      void load({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      currentController?.abort();
      window.clearInterval(interval);
    };
  }, [
    enabled,
    filters.from,
    filters.to,
    filters.location,
    JSON.stringify(filters.zone ?? []),
    JSON.stringify(filters.cameraId ?? []),
    JSON.stringify(filters.shift ?? []),
    filters.complianceStatus,
  ]);

  return { data, metrics, loading, error };
}
