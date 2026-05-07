"use client";

import { useEffect, useState } from "react";

import { API_BASE_URL } from "../../components/visionLabConfig";

function buildQueryString(filters) {
  const params = new URLSearchParams();

  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "" || value === "All") {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== "" && item !== "All") {
          params.append(key, String(item));
        }
      });
      return;
    }

    params.set(key, String(value));
  });

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function useCrackDetectionData(filters = {}, enabled = true) {
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");
  const queryString = buildQueryString(filters);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }

    let isDisposed = false;

    const fetchMetrics = async (showLoader) => {
      if (showLoader) {
        setLoading(true);
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/crack-detection/metrics${queryString}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Crack Detection metrics request failed with status ${response.status}.`);
        }

        const payload = await response.json();
        if (isDisposed) return;

        setData(Array.isArray(payload.records) ? payload.records : []);
        setSummary(payload.summary && typeof payload.summary === "object" ? payload.summary : null);
        setError("");
      } catch (fetchError) {
        if (isDisposed) return;
        setError(fetchError instanceof Error ? fetchError.message : "Unable to load Crack Detection metrics.");
      } finally {
        if (!isDisposed) {
          setLoading(false);
        }
      }
    };

    void fetchMetrics(true);
    const intervalId = window.setInterval(() => {
      void fetchMetrics(false);
    }, 5000);

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
    };
  }, [enabled, queryString]);

  return { data, summary, loading, error };
}
