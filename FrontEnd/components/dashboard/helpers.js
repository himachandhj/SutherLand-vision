export function formatDateTime(value) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(value) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(value) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function formatSeconds(seconds) {
  const total = Math.round(seconds || 0);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins > 0 ? `${mins}:${String(secs).padStart(2, "0")}` : `${secs}s`;
}

export function shiftFromTimestamp(value) {
  const hour = new Date(value).getHours();
  if (hour >= 6 && hour < 14) return "Morning Shift";
  if (hour >= 14 && hour < 22) return "Swing Shift";
  return "Night Shift";
}

export function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

export function groupBy(rows, key) {
  return rows.reduce((acc, row) => {
    const group = typeof key === "function" ? key(row) : row[key];
    acc[group] = acc[group] ?? [];
    acc[group].push(row);
    return acc;
  }, {});
}

export function uniqueOptions(rows, key) {
  return Array.from(new Set(rows.map((row) => row[key]).filter(Boolean))).sort();
}

export function sortRows(rows, sortState) {
  const copy = [...rows];
  copy.sort((a, b) => {
    const left = a[sortState.key];
    const right = b[sortState.key];
    if (typeof left === "number" && typeof right === "number") {
      return sortState.direction === "asc" ? left - right : right - left;
    }
    return sortState.direction === "asc"
      ? String(left).localeCompare(String(right))
      : String(right).localeCompare(String(left));
  });
  return copy;
}

export function byTimestamp(rows, key = "timestamp") {
  return [...rows].sort((a, b) => new Date(a[key]) - new Date(b[key]));
}

export function toneForStatus(value) {
  const status = String(value).toLowerCase();
  if (["normal", "compliant", "resolved"].includes(status)) return "normal";
  if (["violation", "alert", "active", "open", "yes", "needed"].includes(status)) return "alert";
  if (["warning", "medium"].includes(status)) return "warning";
  if (["high", "high severity", "anomaly"].includes(status)) return "high";
  return "normal";
}
