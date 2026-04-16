"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, AlertTriangle, Filter, Flame, HardHat, LayoutDashboard, Menu, Route, ShieldAlert, TimerReset, X } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { SelectField } from "../ui/select";
import { DataTable } from "../ui/table";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { PillCheckboxRow } from "../ui/pill-checkbox";
import { useFireData } from "../../src/hooks/useFireData";
import { average, byTimestamp, formatDate, formatDateTime, formatSeconds, groupBy, shiftFromTimestamp, sortRows, sum, toneForStatus, uniqueOptions } from "./helpers";

const chartPalette = ["#27235C", "#DE1B54", "#3D3880", "#F04E7A", "#6B6B8A", "#C8C6E8"];
const SEMANTIC_GREEN = "#27235C";
const SEMANTIC_YELLOW = "rgba(222, 27, 84, 0.6)";
const SEVERITY_COLORS = {
  High: "#DE1B54",
  Medium: "rgba(222, 27, 84, 0.6)",
  Low: "#27235C",
};

const TIME_GRANULARITIES = /** @type {const} */ (["Hourly", "Daily", "Weekly", "Monthly"]);

function formatHourBucket(date) {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

function formatDayBucket(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function weekOfYear(date) {
  // ISO week number
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

function formatMonthBucket(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function bucketKeyForTimestamp(timestamp, granularity) {
  const dt = new Date(timestamp);
  if (granularity === "Daily") return formatDayBucket(dt);
  if (granularity === "Weekly") {
    const { year, week } = weekOfYear(dt);
    return `${year}-W${String(week).padStart(2, "0")}`;
  }
  if (granularity === "Monthly") return formatMonthBucket(dt);
  return formatHourBucket(dt);
}

function bucketLabelForKey(bucketKey, granularity) {
  if (granularity === "Weekly") {
    const [year, wk] = String(bucketKey).split("-W");
    return `W${wk} ${year}`;
  }
  if (granularity === "Monthly") {
    const d = new Date(bucketKey);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  if (granularity === "Daily") return formatDate(bucketKey);
  return new Date(bucketKey).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function groupRowsByGranularity(rows, granularity) {
  const sorted = byTimestamp(rows);
  const grouped = groupBy(sorted, (row) => bucketKeyForTimestamp(row.timestamp, granularity));
  return Object.entries(grouped)
    .sort(([a], [b]) => {
      if (granularity === "Weekly") return String(a).localeCompare(String(b));
      return new Date(a) - new Date(b);
    })
    .map(([bucketKey, items]) => ({
      label: bucketLabelForKey(bucketKey, granularity),
      bucketKey,
      items,
    }));
}

function getBusinessShift(row) {
  return row.shift || shiftFromTimestamp(row.entryTime || row.entry_time || row.timestamp);
}

function isRegionIncident(row) {
  const alertType = row.alertType ?? row.alert_type;
  return alertType && alertType !== "None";
}

function regionEscalationScore(row) {
  if (!isRegionIncident(row)) return 0;
  return (
    (row.escalationNeeded === "Yes" ? 1000 : 0) +
    (row.status === "Open" ? 500 : 0) +
    (row.severity === "High" ? 250 : row.severity === "Medium" ? 100 : 25) +
    Number(row.durationSec || 0)
  );
}

function formatDurationLabel(seconds) {
  const total = Math.round(Number(seconds) || 0);
  if (total >= 60) return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
  return `${total}s`;
}

function asSingleFilterValue(value) {
  if (Array.isArray(value)) return value[0] ?? "";
  if (value === "All" || value === undefined || value === null) return "";
  return String(value);
}

function normalizePPERecord(row, index) {
  const processedAt = row.processed_at || row.processedAt || row.timestamp || new Date().toISOString();
  const shift = shiftFromTimestamp(processedAt);
  const firstSeenSec = Number(row.first_seen_sec ?? row.firstSeenSec ?? 0);
  const lastSeenSec = Number(row.last_seen_sec ?? row.lastSeenSec ?? firstSeenSec);
  const durationSec = Math.max(0, lastSeenSec - firstSeenSec);
  const rawStatus = String(row.status || "Resolved");
  const status = rawStatus === "Active" ? "Active" : "Resolved";
  const violationType = String(row.violation_type || row.violationType || "Compliant");

  return {
    outputId: row.output_id ?? row.outputId ?? index + 1,
    inputId: row.input_id ?? row.inputId ?? "",
    personId: row.person_id ?? row.personId ?? `WRK-${index + 1}`,
    helmetWorn: Boolean(row.helmet_worn),
    vestWorn: Boolean(row.vest_worn),
    violationType,
    confidenceScore: Number(row.confidence_score ?? row.confidenceScore ?? 0),
    status,
    firstSeenFrame: Number(row.first_seen_frame ?? row.firstSeenFrame ?? 0),
    lastSeenFrame: Number(row.last_seen_frame ?? row.lastSeenFrame ?? 0),
    firstSeenSec,
    lastSeenSec,
    processedAt,
    notes: row.notes || "",
    metadataJson: row.metadata_json ?? {},
    timestamp: processedAt,
    shift,
    durationSec,
    entryTime: processedAt,
  };
}

function mapFireCsvRowToDashboard(row, index) {
  return normalizeFireVideoSummary(row, index);
}

function formatFireAlertType(value) {
  const normalized = String(value || "no_alert").toLowerCase().replaceAll(" ", "_").replaceAll("+", "and");
  if (normalized.includes("fire_and_smoke") || normalized.includes("fire_and") || normalized.includes("fire_smoke")) return "Fire + Smoke";
  if (normalized.includes("fire_only") || normalized === "fire") return "Fire Only";
  if (normalized.includes("smoke_only") || normalized === "smoke") return "Smoke Only";
  if (normalized.includes("none") || normalized.includes("clear") || normalized.includes("no_alert")) return "Clear / No Alert";
  return value || "Clear / No Alert";
}

function normalizeSeverity(value) {
  const severity = String(value || "none").toLowerCase();
  if (severity === "critical") return "High";
  if (severity === "high") return "High";
  if (severity === "medium") return "Medium";
  return "None";
}

function normalizeFireVideoSummary(row, index) {
  const timestamp = row.timestamp || row.simulated_timestamp || row.Date || row.date || new Date().toISOString();
  const alertType = formatFireAlertType(row.alertType || row.alert_type || row.AlertType || row.EventType);
  const severity = normalizeSeverity(row.severity || row.Severity);
  const fireDetected = row.fireDetected || row.fire_detected || (alertType === "Fire Only" || alertType === "Fire + Smoke" ? "Yes" : "No");
  const smokeDetected = row.smokeDetected || row.smoke_detected || (alertType === "Smoke Only" || alertType === "Fire + Smoke" ? "Yes" : "No");
  const firstDetectionSec = Number(row.firstDetectionSec ?? row.first_detection_sec ?? (row.first_alert_frame && row.fps ? Number(row.first_alert_frame) / Number(row.fps) : undefined) ?? row.responseTimeSec ?? row.response_time_sec ?? 0);
  const fireFramePct = Number(row.fireFramePct ?? row.fire_frame_pct ?? (fireDetected === "Yes" ? 8 + (index % 6) * 3 : 0));
  const smokeFramePct = Number(row.smokeFramePct ?? row.smoke_frame_pct ?? (smokeDetected === "Yes" ? 12 + (index % 7) * 4 : 0));
  const escalationNeeded = severity === "High" || alertType === "Fire + Smoke" ? "Yes" : "No";

  return {
    id: row.id || row.output_id || `FD-${index + 1}`,
    inputId: row.inputId || row.input_id || `FIRE-VID-${String(index + 1).padStart(4, "0")}`,
    timestamp,
    cameraId: row.cameraId || row.camera_id || `CAM_${String((index % 15) + 1).padStart(3, "0")}`,
    location: row.location || row.Location || "Warehouse A",
    facility: row.facility || "Plant 1",
    zone: row.zone || row.Zone || "Receiving Bay",
    shift: row.shift || shiftFromTimestamp(timestamp),
    fireDetected,
    smokeDetected,
    alertType,
    severity,
    status: row.status || (fireDetected === "Yes" || smokeDetected === "Yes" ? "Alert" : "Safe"),
    confidenceScore: Number(row.confidenceScore ?? row.confidence_score ?? 0),
    firstDetectionSec,
    fireFramePct,
    smokeFramePct,
    escalationNeeded,
    outputVideo: row.outputVideo || row.output_video || row.minio_video_link || "",
    firePriority: (escalationNeeded === "Yes" ? 1000 : 0) + (severity === "High" ? 300 : severity === "Medium" ? 100 : 0) + firstDetectionSec,
  };
}

function normalizeSpeedRow(row, index) {
  const timestamp = row.timestamp || row.simulated_timestamp || new Date().toISOString();
  const speedLimit = Number(row.speed_limit_kmh ?? row.speedLimitKmh ?? row.zone_speed_limit_kmh ?? row.zoneSpeedLimitKmh ?? 0);
  const detectedSpeed = Number(row.detected_speed_kmh ?? row.detectedSpeedKmh ?? 0);
  const excessSpeed = Number(row.excess_speed_kmh ?? row.excessSpeed ?? Math.max(detectedSpeed - speedLimit, 0));
  const isOverspeeding = String(row.is_overspeeding ?? row.isOverspeeding ?? (excessSpeed > 0 ? "Yes" : "No"));
  const severity =
    excessSpeed > 7
      ? "High"
      : excessSpeed > 3
        ? "Medium"
        : excessSpeed > 0
          ? "Low"
          : "None";

  return {
    id: row.output_id ?? row.id ?? `SE-${index + 1}`,
    inputId: row.input_id ?? row.inputId ?? "",
    outputId: row.output_id ?? row.outputId ?? "",
    timestamp,
    simulatedTimestamp: row.simulated_timestamp ?? timestamp,
    cameraId: row.camera_id ?? row.cameraId ?? `CAM_${String((index % 15) + 1).padStart(3, "0")}`,
    location: row.location ?? "Warehouse A",
    zone: row.zone ?? "Storage Bay",
    zoneSpeedLimitKmh: Number(row.zone_speed_limit_kmh ?? row.zoneSpeedLimitKmh ?? speedLimit),
    minioVideoLink: row.minio_video_link ?? "",
    loadTimeSec: Number(row.load_time_sec ?? row.loadTimeSec ?? 0),
    objectId: row.object_id ?? row.objectId ?? `TRK-${index + 1}`,
    objectType: String(row.object_type ?? row.objectType ?? "car"),
    detectedSpeedKmh: detectedSpeed,
    speedLimitKmh: speedLimit,
    isOverspeeding,
    excessSpeedKmh: excessSpeed,
    confidenceScore: Number(row.confidence_score ?? row.confidence ?? row.confidenceScore ?? 0),
    status: row.status ?? (isOverspeeding === "Yes" ? "Violation" : "Normal"),
    severity,
    speedPriority: (severity === "High" ? 1000 : severity === "Medium" ? 500 : severity === "Low" ? 200 : 0) + excessSpeed * 10 + detectedSpeed,
  };
}

const icons = {
  "object-counting": LayoutDashboard,
  "region-alerts": ShieldAlert,
  "queue-management": Activity,
  "speed-estimation": Route,
  "fire-detection": Flame,
  "class-wise-counting": LayoutDashboard,
  "object-tracking": Route,
  "ppe-detection": HardHat,
};

function useLoadingSkeleton() {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 350);
    return () => clearTimeout(timer);
  }, []);
  return loading;
}

function chartTooltip(value, name) {
  return [typeof value === "number" ? Number(value).toLocaleString() : value, name];
}

function aggregateBy(rows, key, valueAccessor, reducer = sum) {
  const groups = groupBy(rows, key);
  return Object.entries(groups).map(([label, items]) => ({
    label,
    value: reducer(items.map(valueAccessor)),
  }));
}

function getGlobalFilters(rows, slug) {
  const filters = {
    from: "",
    to: "",
    location: "All",
    zone: [],
    cameraId: [],
  };
  if ((slug === "region-alerts" || slug === "fire-detection") && rows.length) {
    const latest = [...rows]
      .sort((a, b) => new Date(a.timestamp || a.entry_time || a.entryTime) - new Date(b.timestamp || b.entry_time || b.entryTime))
      .at(-1);
    const latestTimestamp = latest?.timestamp || latest?.entry_time || latest?.entryTime;
    if (latestTimestamp) {
      const to = new Date(latestTimestamp);
      const from = new Date(to);
      from.setDate(to.getDate() - 6);
      filters.from = from.toISOString().slice(0, 10);
      filters.to = to.toISOString().slice(0, 10);
    }
  }
  return filters;
}

function getInitialExtraFilters(slug, extraFilterDefs) {
  const multiSelectKeys = getMultiSelectKeys(slug);
  const initial = {};
  for (const def of extraFilterDefs) {
    if (slug === "region-alerts" && def.key === "severity") {
      initial[def.key] = ["High", "Medium"];
    } else {
      initial[def.key] = multiSelectKeys.includes(def.key) ? [] : "All";
    }
  }
  return initial;
}

function initialSortStateFor(slug, columns) {
  if (slug === "region-alerts") return { key: "escalationPriority", direction: "desc" };
  if (slug === "fire-detection") return { key: "firePriority", direction: "desc" };
  if (slug === "speed-estimation") return { key: "speedPriority", direction: "desc" };
  return { key: columns[0].key, direction: "asc" };
}

function applyFilters(rows, filters, filterDefs) {
  return rows.filter((row) => {
    if (filters.from && new Date(row.timestamp) < new Date(`${filters.from}T00:00:00`)) return false;
    if (filters.to) {
      const end = new Date(`${filters.to}T23:59:59.999`);
      if (new Date(row.timestamp) > end) return false;
    }
    for (const def of filterDefs) {
      const value = filters[def.key];
      // Handle multi-select arrays
      if (Array.isArray(value)) {
        if (value.length === 0) continue;
        if (row[def.key] === undefined) continue;
        if (!value.some((val) => String(row[def.key]).includes(val))) return false;
      } else {
        // Handle single-select (location remains single-select)
        if (value === undefined || value === null || value === "" || value === "All") continue;
        if (row[def.key] === undefined) continue;
        const rowVal = row[def.key];
        const comparable = typeof rowVal === "number" ? String(rowVal) : String(rowVal);
        if (comparable !== String(value)) return false;
      }
    }
    return true;
  });
}

function KpiGrid({ items }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted">{item.label}</p>
                <p className={`mt-3 text-3xl font-bold ${item.valueClassName ?? "text-ink"}`}>{item.value}</p>
                {item.subtext ? <p className="mt-2 text-xs text-muted">{item.subtext}</p> : null}
              </div>
              <div className="rounded-xl bg-brand-red-tint p-3 text-brand-red">
                <item.icon className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-72 w-full" />
      </CardContent>
    </Card>
  );
}

function DonutChartCard({ title, description, data, showSlicePercent = false }) {
  const total = sum(data.map((item) => item.value));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={62}
                  outerRadius={98}
                  paddingAngle={3}
                  label={({ value }) => {
                    if (!value) return "";
                    if (showSlicePercent) return `${value} (${Math.round((value / Math.max(total, 1)) * 100)}%)`;
                    return value;
                  }}
                >
                  {data.map((entry, index) => (
                    <Cell key={entry.label} fill={entry.color ?? chartPalette[index % chartPalette.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={chartTooltip} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col justify-center gap-2">
            {data.map((item, index) => {
              const pct = total ? Math.round((item.value / total) * 100) : 0;
              return (
                <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-borderSoft bg-white px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-ink">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color ?? chartPalette[index % chartPalette.length] }} />
                    {item.label}
                  </span>
                  <span className="font-semibold text-brand-blue">
                    {item.value} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BarChartCard({ title, description, data, bars, xAxisLabel, yAxisLabel, layout = "vertical", stacked = false, cellFillForBar, showLegend = true, margin, totalLabelKey }) {
  const isHorizontal = layout === "horizontal";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout={isHorizontal ? "vertical" : "horizontal"} margin={margin ?? (isHorizontal ? { left: 16, right: 24 } : { bottom: 8 })}>
            <CartesianGrid stroke="#E2E2EC" vertical={!isHorizontal} horizontal={isHorizontal} />
            <XAxis type={isHorizontal ? "number" : "category"} dataKey={isHorizontal ? undefined : "label"} allowDecimals={false} stroke="#6B6B8A" tick={{ fontSize: 11 }} label={{ value: xAxisLabel, position: "insideBottom", offset: isHorizontal ? 0 : -4 }} />
            <YAxis type={isHorizontal ? "category" : "number"} dataKey={isHorizontal ? "label" : undefined} allowDecimals={false} stroke="#6B6B8A" tick={{ fontSize: 11 }} width={isHorizontal ? 200 : undefined} label={{ value: yAxisLabel, angle: -90, position: "insideLeft" }} />
            <Tooltip formatter={chartTooltip} />
            {showLegend ? <Legend /> : null}
            {bars.map((bar) => (
              <Bar key={bar.dataKey} dataKey={bar.dataKey} stackId={stacked ? "stack" : undefined} fill={bar.color} radius={[6, 6, 0, 0]}>
                {cellFillForBar === bar.dataKey &&
                  data.map((entry, index) => <Cell key={`${bar.dataKey}-${index}`} fill={entry.barFill ?? entry.color ?? bar.color} />)}
                {bar.showLabels ? <LabelList dataKey={bar.dataKey} position={layout === "horizontal" ? "right" : "top"} fill="#27235C" fontSize={11} /> : null}
              </Bar>
            ))}
            {totalLabelKey ? (
              <Bar dataKey={totalLabelKey} fill="transparent" isAnimationActive={false} legendType="none">
                <LabelList dataKey={totalLabelKey} position="top" fill="#27235C" fontSize={12} fontWeight={700} />
              </Bar>
            ) : null}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function LineChartCard({ title, description, data, lines, xAxisLabel, yAxisLabel, referenceLines = [] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ bottom: 8 }}>
            <CartesianGrid stroke="#E2E2EC" strokeDasharray="4 4" />
            <XAxis dataKey="label" stroke="#6B6B8A" tick={{ fontSize: 10 }} interval="preserveStartEnd" label={{ value: xAxisLabel, position: "insideBottom", offset: -4 }} />
            <YAxis allowDecimals={false} stroke="#6B6B8A" tick={{ fontSize: 11 }} label={{ value: yAxisLabel, angle: -90, position: "insideLeft" }} />
            <Tooltip formatter={chartTooltip} />
            <Legend />
            {referenceLines.map((line) => (
              <ReferenceLine key={`${line.label}-${line.value}`} y={line.value} stroke={line.color} strokeDasharray="6 6" label={line.label} />
            ))}
            {lines.map((line) => (
              <Line
                key={line.dataKey}
                type="monotone"
                dataKey={line.dataKey}
                stroke={line.color}
                strokeWidth={3}
                dot={line.dot ?? { r: 4, fill: line.color }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function ScatterChartCard({ title, description, data, xAxisLabel, yAxisLabel }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart>
            <CartesianGrid stroke="#E2E2EC" />
            <XAxis type="number" dataKey="x" name={xAxisLabel} allowDecimals={false} stroke="#6B6B8A" label={{ value: xAxisLabel, position: "insideBottom", offset: -5 }} />
            <YAxis type="number" dataKey="y" name={yAxisLabel} allowDecimals={false} stroke="#6B6B8A" label={{ value: yAxisLabel, angle: -90, position: "insideLeft" }} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={chartTooltip} />
            <Legend />
            <Scatter name="Readings" data={data} fill="#DE1B54" />
          </ScatterChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function buildDashboardViews(slug, rows, granularity) {
  switch (slug) {
    case "object-counting": {
      const byZone = groupBy(rows, "zone");
      const barData = Object.entries(byZone).map(([label, items]) => ({
        label,
        actual: sum(items.map((item) => item.objectCount)),
        expected: sum(items.map((item) => item.expectedCount)),
      }));
      const lineData = groupRowsByGranularity(rows, granularity).map(({ label, items }) => ({
        label,
        Box: sum(items.filter((item) => item.objectType === "Box").map((item) => item.objectCount)),
        Pallet: sum(items.filter((item) => item.objectType === "Pallet").map((item) => item.objectCount)),
        Crate: sum(items.filter((item) => item.objectType === "Crate").map((item) => item.objectCount)),
        Package: sum(items.filter((item) => item.objectType === "Package").map((item) => item.objectCount)),
      }));
      const statusData = ["Normal", "Over Count", "Under Count"].map((label) => ({
        label,
        value: rows.filter((row) => row.status === label).length,
        color: label === "Normal" ? SEMANTIC_GREEN : label === "Over Count" ? "#DE1B54" : SEMANTIC_YELLOW,
      }));
      const discrepancy = aggregateBy(rows, "cameraId", (row) => row.countDifference, sum).map((item) => ({
        label: item.label,
        count_difference: item.value,
        barFill: item.value > 0 ? "#DE1B54" : "#27235C",
      }));
      return [
        <BarChartCard key="1" title="Object Count vs Expected Count by Zone" description="Actual versus expected counts by zone." data={barData} bars={[{ dataKey: "actual", color: "#27235C" }, { dataKey: "expected", color: "#6B6B8A" }]} xAxisLabel="Zone" yAxisLabel="Count" />,
        <LineChartCard key="2" title="Object Count Trend Over Time" description="Object counts over time by object type." data={lineData} lines={[{ dataKey: "Box", color: chartPalette[0] }, { dataKey: "Pallet", color: chartPalette[1] }, { dataKey: "Crate", color: chartPalette[2] }, { dataKey: "Package", color: chartPalette[3] }]} xAxisLabel="Date/Time" yAxisLabel="Object Count" />,
        <DonutChartCard key="3" title="Count Status Distribution" description="Distribution of normal, over-count, and under-count records." data={statusData} />,
        <BarChartCard key="4" title="Count Discrepancy by Camera" description="Positive bars indicate over count (red); negative bars indicate under count (blue)." data={discrepancy} bars={[{ dataKey: "count_difference", color: "#27235C" }]} xAxisLabel="Camera ID" yAxisLabel="Count Difference" cellFillForBar="count_difference" />,
      ];
    }
    case "region-alerts": {
      const alertRows = rows.filter(isRegionIncident);
      const byZoneGroups = groupBy(alertRows, "zone");
      const byZoneCounts = Object.entries(byZoneGroups).map(([label, items]) => ({
        label,
        High: items.filter((row) => row.severity === "High").length,
        Medium: items.filter((row) => row.severity === "Medium").length,
        Low: items.filter((row) => row.severity === "Low").length,
        total: items.length,
      })).sort((a, b) => b.total - a.total);
      const trendData = groupRowsByGranularity(alertRows, granularity)
        .sort((a, b) => (granularity === "Weekly" ? String(a.bucketKey).localeCompare(String(b.bucketKey)) : new Date(a.bucketKey) - new Date(b.bucketKey)))
        .map(({ label, items }) => ({
          label,
          High: items.filter((item) => item.severity === "High").length,
          Medium: items.filter((item) => item.severity === "Medium").length,
          Low: items.filter((item) => item.severity === "Low").length,
        }));
      const alertTypeColors = {
        "Unauthorized Entry": "#DE1B54",
        Loitering: "rgba(222, 27, 84, 0.6)",
        "Hazard Zone Breach": "#A01240",
        "After-Hours Entry": "#3D3880",
        "Repeated Intrusion": "#27235C",
        "Crowding in Restricted Zone": "#F04E7A",
      };
      const donut = Object.entries(groupBy(alertRows, "alertType"))
        .map(([label, items]) => ({ label, value: items.length, color: alertTypeColors[label] ?? chartPalette[0] }))
        .sort((a, b) => b.value - a.value);
      const durationBuckets = [
        { label: "Brief crossing (0-60s)", value: alertRows.filter((row) => row.durationSec <= 60).length, color: "#27235C" },
        { label: "Suspicious presence (61-180s)", value: alertRows.filter((row) => row.durationSec > 60 && row.durationSec <= 180).length, color: "rgba(222, 27, 84, 0.6)" },
        { label: "High-risk intrusion (180s+)", value: alertRows.filter((row) => row.durationSec > 180).length, color: "#DE1B54" },
      ];
      const cameraShift = Object.entries(groupBy(alertRows, "cameraId"))
        .map(([label, items]) => ({
          label,
          "Morning Shift": items.filter((row) => getBusinessShift(row) === "Morning Shift").length,
          "Swing Shift": items.filter((row) => getBusinessShift(row) === "Swing Shift").length,
          "Night Shift": items.filter((row) => getBusinessShift(row) === "Night Shift").length,
          total: items.length,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);
      return [
        <BarChartCard
          key="1"
          title="Incident Trend by Severity"
          description="Shows when restricted-zone incidents occur so teams can spot peak risk periods and staffing gaps."
          data={trendData}
          bars={[{ dataKey: "High", color: SEVERITY_COLORS.High }, { dataKey: "Medium", color: SEVERITY_COLORS.Medium }, { dataKey: "Low", color: SEVERITY_COLORS.Low }]}
          xAxisLabel={granularity}
          yAxisLabel="Incident Count"
          stacked
        />,
        <BarChartCard
          key="2"
          title="Most Violated Zones"
          description="Highlights zones where unauthorized access is most frequent."
          data={byZoneCounts}
          bars={[{ dataKey: "High", color: SEVERITY_COLORS.High, showLabels: true }, { dataKey: "Medium", color: SEVERITY_COLORS.Medium }, { dataKey: "Low", color: SEVERITY_COLORS.Low }]}
          xAxisLabel="Incident Count"
          yAxisLabel="Restricted / Hazardous Zone"
          layout="horizontal"
          stacked
        />,
        <DonutChartCard key="3" title="Violation Type Breakdown" description="Shows exactly what kind of restricted-zone rule is being broken, with count and percentage." data={donut} />,
        <BarChartCard
          key="4"
          title="Duration Risk Interpretation"
          description="Separates brief accidental crossings from prolonged high-risk intrusions."
          data={durationBuckets}
          bars={[{ dataKey: "value", color: "#27235C", showLabels: true }]}
          xAxisLabel="Duration Category"
          yAxisLabel="Incident Count"
          cellFillForBar="value"
          showLegend={false}
        />,
        <BarChartCard
          key="5"
          title="Triggered Cameras by Shift"
          description="Identifies cameras and operating shifts generating the most alerts."
          data={cameraShift}
          bars={[{ dataKey: "Morning Shift", color: "#27235C" }, { dataKey: "Swing Shift", color: "rgba(222, 27, 84, 0.6)" }, { dataKey: "Night Shift", color: "#DE1B54" }]}
          xAxisLabel="Camera ID"
          yAxisLabel="Incident Count"
          stacked
        />,
      ];
    }
    case "queue-management": {
      const trend = groupRowsByGranularity(rows, granularity).map(({ label, items }) => ({
        label,
        queue: average(items.map((row) => row.queueLength)),
        limit: average(items.map((row) => row.maxQueueLimit)),
      }));
      const refLimit = rows.length ? average(rows.map((row) => row.maxQueueLimit)) : 0;
      const zoneAvg = Object.entries(groupBy(rows, "zone")).map(([label, items]) => {
        const avgQ = average(items.map((item) => item.queueLength));
        const limit = average(items.map((item) => item.maxQueueLimit));
        return {
          label,
          avgQueue: Number(avgQ.toFixed(1)),
          barFill: avgQ > limit ? "#DE1B54" : SEMANTIC_GREEN,
        };
      });
      const scatter = rows.map((row) => ({ x: row.staffCount, y: row.queueLength }));
      const donut = [
        { label: "Breached", value: rows.filter((row) => row.isBreached === "Yes").length, color: "#DE1B54" },
        { label: "Normal", value: rows.filter((row) => row.isBreached === "No").length, color: SEMANTIC_GREEN },
      ];
      return [
        <LineChartCard key="1" title="Queue Length Over Time" description="Queue length compared with configured limit." data={trend} lines={[{ dataKey: "queue", color: "#27235C" }]} xAxisLabel="Timestamp" yAxisLabel="Queue Length" referenceLines={[{ value: refLimit, color: "#DE1B54", label: "Max Queue Limit" }]} />,
        <BarChartCard key="2" title="Queue Length by Zone/Counter" description="Average queue length by zone; red when above the zone average limit." data={zoneAvg} bars={[{ dataKey: "avgQueue", color: "#27235C" }]} xAxisLabel="Zone" yAxisLabel="Avg Queue Length" cellFillForBar="avgQueue" />,
        <ScatterChartCard key="3" title="Staff Count vs Queue Length" description="Relationship between staffing and queue build-up." data={scatter} xAxisLabel="Staff Count" yAxisLabel="Queue Length" />,
        <DonutChartCard key="4" title="Breach vs Normal Distribution" description="Breach versus normal queue readings." data={donut} />,
      ];
    }
    case "speed-estimation": {
      const violationRows = rows.filter((row) => row.isOverspeeding === "Yes");
      const byZoneCounts = aggregateBy(violationRows, "zone", () => 1, sum)
        .map((item) => ({ label: item.label, value: item.value }))
        .sort((a, b) => b.value - a.value);
      const trend = groupRowsByGranularity(rows, granularity).map(({ label, items }) => ({
        label,
        detectedSpeed: Number(average(items.map((row) => row.detectedSpeedKmh)).toFixed(1)),
        speedLimit: Number(average(items.map((row) => row.speedLimitKmh)).toFixed(1)),
        violationCount: items.filter((row) => row.isOverspeeding === "Yes").length,
      }));
      const byType = aggregateBy(violationRows, "objectType", () => 1, sum)
        .map((item, index) => ({
          label: item.label,
          value: item.value,
          barFill: chartPalette[index % chartPalette.length],
        }))
        .sort((a, b) => b.value - a.value);
      const donut = [
        { label: "Violation", value: rows.filter((row) => row.isOverspeeding === "Yes").length, color: "#DE1B54" },
        { label: "Normal", value: rows.filter((row) => row.isOverspeeding !== "Yes").length, color: "#27235C" },
      ];
      const severityData = ["High", "Medium", "Low"].map((label, index) => ({
        label,
        value: violationRows.filter((row) => row.severity === label).length,
        color: [ "#DE1B54", "rgba(222, 27, 84, 0.6)", "#27235C" ][index],
      }));
      return [
        <BarChartCard key="1" title="Highest-Risk Zones by Speed Violations" description="Highlights the areas where movement most often exceeds configured safety limits." data={byZoneCounts} bars={[{ dataKey: "value", color: "#DE1B54", showLabels: true }]} xAxisLabel="Zone" yAxisLabel="Violation Count" showLegend={false} />,
        <LineChartCard
          key="2"
          title="Detected Speed vs Zone Speed Limit Over Time"
          description="Shows whether unsafe speed events are isolated or recurring across the monitoring period."
          data={trend}
          lines={[
            {
              dataKey: "detectedSpeed",
              color: "#27235C",
              dot: (props) => {
                const { cx, cy, payload } = props;
                const fill = payload?.violationCount > 0 ? "#DE1B54" : "#27235C";
                return <circle cx={cx} cy={cy} r={4} fill={fill} stroke="#fff" strokeWidth={1} />;
              },
            },
            { dataKey: "speedLimit", color: "rgba(222, 27, 84, 0.6)" },
          ]}
          xAxisLabel="Timestamp"
          yAxisLabel="Detected Speed (kmh)"
        />,
        <BarChartCard key="3" title="Violations by Object Type" description="Reveals which moving object categories contribute most to unsafe speed behavior." data={byType} bars={[{ dataKey: "value", color: "#27235C" }]} xAxisLabel="Object Type" yAxisLabel="Violation Count" cellFillForBar="value" showLegend={false} />,
        <DonutChartCard key="4" title="Violation vs Normal Distribution" description="Summarizes how much of total monitored movement is within safe limits versus violating limits." data={donut} showSlicePercent />,
        <DonutChartCard key="5" title="Violation Severity Distribution" description="Shows how far above the configured speed limit violating detections are, using rule-based severity bands." data={severityData} showSlicePercent />,
      ];
    }
    case "fire-detection": {
      const zoneRisk = Object.entries(groupBy(rows, "zone"))
        .map(([label, items]) => ({
          label,
          "Smoke Only": items.filter((item) => item.alertType === "Smoke Only").length,
          "Fire Only": items.filter((item) => item.alertType === "Fire Only").length,
          "Fire + Smoke": items.filter((item) => item.alertType === "Fire + Smoke").length,
          totalRisk: items.filter((item) => item.alertType !== "Clear / No Alert").length,
        }))
        .sort((a, b) => b.totalRisk - a.totalRisk);
      const donut = ["Fire + Smoke", "Fire Only", "Smoke Only", "Clear / No Alert"].map((label) => ({
        label,
        value: rows.filter((row) => row.alertType === label).length,
        color: label === "Fire + Smoke" ? "#DE1B54" : label === "Fire Only" ? "#DE1B54" : label === "Smoke Only" ? "#F0718F" : "#27235C",
      }));
      const firstDetectionByZone = Object.entries(groupBy(rows.filter((row) => row.firstDetectionSec > 0), "zone"))
        .map(([label, items]) => {
          const v = Math.round(average(items.map((item) => item.firstDetectionSec)));
          return { label, value: v };
        })
        .sort((a, b) => b.value - a.value);
      const cameraAlerts = Object.entries(groupBy(rows.filter((row) => row.alertType !== "Clear / No Alert"), "cameraId"))
        .map(([label, items]) => ({ label, value: items.length }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
      return [
        <BarChartCard
          key="1"
          title="Highest-Risk Zones by Alert Volume"
          description="Shows where safety alerts are concentrated so emergency planning can focus on the right areas."
          data={zoneRisk}
          bars={[{ dataKey: "Smoke Only", color: "#F0718F" }, { dataKey: "Fire Only", color: "#DE1B54" }, { dataKey: "Fire + Smoke", color: "#DE1B54", showLabels: true }]}
          xAxisLabel="Zone"
          yAxisLabel="Count"
          stacked
          totalLabelKey="totalRisk"
        />,
        <DonutChartCard key="2" title="Alert Type Distribution" description="Shows whether site activity is mostly clear, smoke-related, or critical fire and smoke." data={donut} showSlicePercent />,
        <BarChartCard
          key="3"
          title="Average Time to First Detection by Zone"
          description="Shows how quickly each zone typically surfaces a safety hazard."
          data={firstDetectionByZone}
          bars={[{ dataKey: "value", color: "#27235C", showLabels: true }]}
          xAxisLabel="Zone"
          yAxisLabel="Seconds"
          showLegend={false}
          margin={{ left: 28, right: 18, bottom: 8 }}
        />,
        <BarChartCard
          key="4"
          title="Most Triggered Cameras"
          description="Highlights cameras with the highest number of safety alerts."
          data={cameraAlerts}
          bars={[{ dataKey: "value", color: "#27235C", showLabels: true }]}
          xAxisLabel="Alert Count"
          yAxisLabel="Camera ID"
          layout="horizontal"
          showLegend={false}
        />,
      ];
    }
    case "class-wise-counting": {
      const grouped = Object.entries(groupBy(rows, "zone")).map(([label, items]) => ({
        label,
        Truck: sum(items.filter((item) => item.className === "Truck").map((item) => item.classCount)),
        Forklift: sum(items.filter((item) => item.className === "Forklift").map((item) => item.classCount)),
        Bike: sum(items.filter((item) => item.className === "Bike").map((item) => item.classCount)),
        Box: sum(items.filter((item) => item.className === "Box").map((item) => item.classCount)),
        Pallet: sum(items.filter((item) => item.className === "Pallet").map((item) => item.classCount)),
      }));
      const stacked = Object.entries(groupBy(rows, "cameraId")).map(([label, items]) => ({
        label,
        Truck: sum(items.filter((item) => item.className === "Truck").map((item) => item.classCount)),
        Forklift: sum(items.filter((item) => item.className === "Forklift").map((item) => item.classCount)),
        Bike: sum(items.filter((item) => item.className === "Bike").map((item) => item.classCount)),
        Box: sum(items.filter((item) => item.className === "Box").map((item) => item.classCount)),
        Pallet: sum(items.filter((item) => item.className === "Pallet").map((item) => item.classCount)),
      }));
      const donut = ["Truck", "Forklift", "Bike", "Box", "Pallet"].map((label, index) => ({ label, value: sum(rows.filter((row) => row.className === label).map((row) => row.classCount)), color: chartPalette[index] }));
      const trend = groupRowsByGranularity(rows, granularity).map(({ label, items }) => ({
        label,
        Truck: sum(items.filter((item) => item.className === "Truck").map((item) => item.classCount)),
        Forklift: sum(items.filter((item) => item.className === "Forklift").map((item) => item.classCount)),
        Bike: sum(items.filter((item) => item.className === "Bike").map((item) => item.classCount)),
        Box: sum(items.filter((item) => item.className === "Box").map((item) => item.classCount)),
        Pallet: sum(items.filter((item) => item.className === "Pallet").map((item) => item.classCount)),
      }));
      return [
        <BarChartCard key="1" title="Class Count vs Expected by Zone" description="Class counts by zone." data={grouped} bars={[{ dataKey: "Truck", color: chartPalette[0] }, { dataKey: "Forklift", color: chartPalette[1] }, { dataKey: "Bike", color: chartPalette[2] }, { dataKey: "Box", color: chartPalette[3] }, { dataKey: "Pallet", color: chartPalette[4] }]} xAxisLabel="Zone" yAxisLabel="Count" />,
        <BarChartCard key="2" title="Class Composition by Camera" description="Stacked class composition by camera." data={stacked} bars={[{ dataKey: "Truck", color: chartPalette[0] }, { dataKey: "Forklift", color: chartPalette[1] }, { dataKey: "Bike", color: chartPalette[2] }, { dataKey: "Box", color: chartPalette[3] }, { dataKey: "Pallet", color: chartPalette[4] }]} xAxisLabel="Camera ID" yAxisLabel="Total Count" stacked />,
        <DonutChartCard key="3" title="Overall Class Distribution" description="Percentage composition across all class detections." data={donut} />,
        <LineChartCard key="4" title="Class Count Trend Over Time" description="Class count trend over time." data={trend} lines={[{ dataKey: "Truck", color: chartPalette[0] }, { dataKey: "Forklift", color: chartPalette[1] }, { dataKey: "Bike", color: chartPalette[2] }, { dataKey: "Box", color: chartPalette[3] }, { dataKey: "Pallet", color: chartPalette[4] }]} xAxisLabel="Timestamp" yAxisLabel="Class Count" />,
      ];
    }
    case "object-tracking": {
      const zoneDuration = Object.entries(groupBy(rows, "zone")).map(([label, items]) => {
        const v = Number(average(items.map((item) => item.durationInZoneSec)).toFixed(1));
        return { label, value: v, barFill: v > 1500 ? "#DE1B54" : "#27235C" };
      });
      const pathFrequency = aggregateBy(rows, "pathSequence", () => 1, sum).map((item) => ({ label: item.label, value: item.value }));
      const donut = [
        { label: "Anomaly", value: rows.filter((row) => row.isAnomaly === "Yes").length, color: "#DE1B54" },
        { label: "Normal", value: rows.filter((row) => row.isAnomaly === "No").length, color: SEMANTIC_GREEN },
      ];
      const trend = groupRowsByGranularity(rows, granularity).map(({ label, items }) => ({
        label,
        Anomaly: items.filter((item) => item.isAnomaly === "Yes").length,
        Normal: items.filter((item) => item.isAnomaly === "No").length,
      }));
      return [
        <BarChartCard key="1" title="Avg Time Spent in Zone" description="Average dwell time by zone; red when above the 1500s anomaly threshold." data={zoneDuration} bars={[{ dataKey: "value", color: "#27235C" }]} xAxisLabel="Zone" yAxisLabel="Avg Duration (sec)" cellFillForBar="value" />,
        <BarChartCard key="2" title="Object Movement Path Frequency" description="Most common movement paths." data={pathFrequency} bars={[{ dataKey: "value", color: "#27235C" }]} xAxisLabel="Count" yAxisLabel="Path Sequence" layout="horizontal" />,
        <DonutChartCard key="3" title="Anomaly vs Normal Distribution" description="Anomaly share of tracked events." data={donut} />,
        <LineChartCard key="4" title="Object Tracking Events Over Time" description="Tracked object events over time by anomaly state." data={trend} lines={[{ dataKey: "Anomaly", color: "#DE1B54" }, { dataKey: "Normal", color: SEMANTIC_GREEN }]} xAxisLabel="Timestamp" yAxisLabel="Tracked Objects" />,
      ];
    }
    case "ppe-detection": {
      const violationRows = rows.filter((row) => row.violationType !== "Compliant");
      const shiftOrder = ["Morning Shift", "Swing Shift", "Night Shift"];
      const byShift = shiftOrder.map((label) => ({
        label,
        value: violationRows.filter((row) => row.shift === label).length,
      }));
      const donut = [
        { label: "Missing Helmet", value: rows.filter((row) => row.violationType === "Missing Helmet").length, color: "#DE1B54" },
        { label: "Missing Vest", value: rows.filter((row) => row.violationType === "Missing Vest").length, color: "rgba(222, 27, 84, 0.6)" },
        { label: "Missing Both", value: rows.filter((row) => row.violationType === "Missing Both").length, color: "#A01240" },
      ];
      const durationBuckets = [
        { label: "Brief (<30s)", value: violationRows.filter((row) => row.durationSec < 30).length, color: "#27235C" },
        { label: "Moderate (30s-2m)", value: violationRows.filter((row) => row.durationSec >= 30 && row.durationSec <= 120).length, color: "rgba(222, 27, 84, 0.6)" },
        { label: "Prolonged (>2m)", value: violationRows.filter((row) => row.durationSec > 120).length, color: "#DE1B54" },
      ];
      return [
        <BarChartCard key="1" title="Violations by Shift" description="Shows which operating shift is generating the most helmet and vest violations." data={byShift} bars={[{ dataKey: "value", color: "#27235C", showLabels: true }]} xAxisLabel="Shift" yAxisLabel="Violation Count" showLegend={false} />,
        <DonutChartCard key="2" title="Missing PPE Breakdown" description="Shows whether the site is missing helmets, vests, or both items at the point of detection." data={donut} showSlicePercent />,
        <BarChartCard key="3" title="Exposure Duration Risk" description="Separates brief exposures from prolonged PPE risk so managers can prioritize persistent violations." data={durationBuckets} bars={[{ dataKey: "value", color: "#27235C", showLabels: true }]} xAxisLabel="Exposure Duration" yAxisLabel="Incident Count" cellFillForBar="value" showLegend={false} />,
      ];
    }
    default:
      return [];
  }
}

const DASHBOARD_NAV = [
  ["object-counting", "Object Counting"],
  ["region-alerts", "Region Alerts"],
  ["queue-management", "Queue Management"],
  ["speed-estimation", "Speed Estimation"],
  ["fire-detection", "Fire Detection"],
  ["class-wise-counting", "Class-Wise Counting"],
  ["object-tracking", "Object Tracking"],
  ["ppe-detection", "PPE Detection"],
];

function getMultiSelectKeys(slug) {
  const baseKeys = ["zone"];
  const dashboardSpecific = {
    "object-counting": ["cameraId", "objectType"],
    "region-alerts": ["cameraId", "severity", "zoneType", "shift"],
    "queue-management": ["cameraId", "counterId"],
    "speed-estimation": ["cameraId", "objectType", "speedLimitKmh", "severity"],
    "fire-detection": ["cameraId", "severity", "alertType", "shift"],
    "class-wise-counting": ["cameraId", "className"],
    "object-tracking": ["cameraId", "objectType"],
    "ppe-detection": ["shift"],
  };
  return [...(slug === "ppe-detection" ? [] : baseKeys), ...(dashboardSpecific[slug] || [])];
}

export function DashboardPage({ slug, title, description, rows, metricDefs, columns, extraFilterDefs }) {
  const Icon = icons[slug] ?? LayoutDashboard;
  const loading = useLoadingSkeleton();
  const [filters, setFilters] = useState(() => getGlobalFilters(rows, slug));
  const [extraFilters, setExtraFilters] = useState(() => getInitialExtraFilters(slug, extraFilterDefs));
  const [sortState, setSortState] = useState(() => initialSortStateFor(slug, columns));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [timeGranularity, setTimeGranularity] = useState("Hourly");

  const fireFilters = useMemo(
    () => ({
      zone: asSingleFilterValue(filters.zone),
      severity: asSingleFilterValue(extraFilters.severity),
      dateFrom: filters.from,
      dateTo: filters.to,
    }),
    [filters.zone, filters.from, filters.to, extraFilters.severity],
  );

  const { data: fireCsvData, loading: fireCsvLoading, error: fireCsvError } = useFireData(fireFilters, slug === "fire-detection");

  const sourceRows = useMemo(() => {
    if (slug === "ppe-detection") return rows.map(normalizePPERecord);
    if (slug === "speed-estimation") return rows.map(normalizeSpeedRow);
    if (slug === "fire-detection") {
      return rows.map(normalizeFireVideoSummary);
    }
    if (slug === "region-alerts") {
      return rows.map((row, index) => ({
        id: row.id,
        timestamp: row.timestamp || row.entry_time || row.entryTime,
        location: row.location || ["Warehouse A", "Warehouse B", "Warehouse C"][index % 3],
        cameraId: row.cameraId || row.camera_id,
        zone: row.zone,
        zoneType: row.zoneType || row.zone_type,
        entryTime: row.entryTime || row.entry_time,
        exitTime:
          row.exitTime ||
          row.exit_time ||
          (index % 8 === 0 ? "" : new Date(new Date(row.entry_time || row.entryTime).getTime() + Number(row.duration_sec || row.durationSec || 0) * 1000).toISOString()),
        shift: getBusinessShift(row),
        durationSec: row.durationSec ?? row.duration_sec,
        alertType: row.alertType || row.alert_type,
        severity: row.severity,
        status: row.status || (index % 8 === 0 || row.severity === "High" && index % 5 === 0 ? "Open" : "Resolved"),
        confidenceScore: row.confidenceScore ?? Number((0.84 + ((index % 7) * 0.018)).toFixed(2)),
        assignedTo: row.assignedTo ?? ["Ops Supervisor", "Security Desk", "Safety Lead", "Floor Manager"][index % 4],
        escalationNeeded: row.escalationNeeded ?? (row.severity === "High" || index % 8 === 0 ? "Yes" : "No"),
        snapshotUrl: row.snapshotUrl ?? `/dashboard/snapshots/region-alerts/${row.id}`,
        escalationPriority: 0,
      })).map((row) => ({
        ...row,
        escalationPriority: regionEscalationScore(row),
      }));
    }
    return rows;
  }, [slug, fireCsvData, rows]);

  const dataLoading = false;
  const dataError = "";

  const filterDefs = slug === "ppe-detection"
    ? [...extraFilterDefs]
    : [
        { key: "location", label: "Location" },
        { key: "zone", label: "Zone" },
        { key: "cameraId", label: "Camera ID" },
        ...extraFilterDefs,
      ];

  const multiSelectKeys = getMultiSelectKeys(slug);

  const filteredRows = useMemo(() => {
    const merged = filterDefs.map((def) => ({ ...def }));
    const allFilters = { ...filters, ...extraFilters };
    return applyFilters(sourceRows, allFilters, merged);
  }, [sourceRows, filters, extraFilters, extraFilterDefs]);

  const sortedRows = useMemo(() => sortRows(filteredRows, sortState), [filteredRows, sortState]);
  const kpis = useMemo(
    () =>
      metricDefs.map((metric) => {
        const computed = metric.compute(filteredRows);
        return {
          label: metric.label,
          icon: metric.icon,
          value: metric.format(computed, filteredRows),
          valueClassName: metric.valueClassName?.(computed, filteredRows),
          subtext: typeof metric.subtext === "function" ? metric.subtext(computed, filteredRows) : metric.subtext,
        };
      }),
    [filteredRows, metricDefs],
  );
  const charts = useMemo(() => buildDashboardViews(slug, filteredRows, timeGranularity), [slug, filteredRows, timeGranularity]);
  const lastUpdated = useMemo(() => {
    const latest = byTimestamp(sourceRows).at(-1)?.timestamp;
    return latest ? formatDateTime(latest) : "N/A";
  }, [sourceRows]);

  const optionsFor = (key, includeAllOption = true) => {
    const values = uniqueOptions(sourceRows, key);
    const optionValues = values.map((value) => ({ label: String(value), value: String(value) }));

    if (slug === "ppe-detection" && key === "status") {
      const statusOptions = [
        { label: "Open", value: "Active" },
        { label: "Closed", value: "Resolved" },
      ];
      return includeAllOption ? [{ label: "All", value: "All" }, ...statusOptions] : statusOptions;
    }
    if (key === "speedLimitKmh") {
      const speedOptions = values.map((value) => ({ label: `${value} kmh`, value: String(value) }));
      return includeAllOption ? [{ label: "All", value: "All" }, ...speedOptions] : speedOptions;
    }
    if (key === "isBreached") {
      const breachedOptions = values.map((value) => ({
        label: value === "Yes" ? "Breached" : value === "No" ? "Normal" : String(value),
        value: String(value),
      }));
      return includeAllOption ? [{ label: "All", value: "All" }, ...breachedOptions] : breachedOptions;
    }
    return includeAllOption ? [{ label: "All", value: "All" }, ...optionValues] : optionValues;
  };

  const resetFilters = () => {
    setFilters(getGlobalFilters(rows, slug));
    setExtraFilters(getInitialExtraFilters(slug, extraFilterDefs));
    setTimeGranularity("Hourly");
    setSortState(initialSortStateFor(slug, columns));
  };

  return (
    <div className="flex min-h-screen bg-surface text-ink">
      <aside className="hidden w-72 shrink-0 bg-brand-blue px-5 py-6 text-white lg:block">
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-xl bg-brand-red p-3">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-brand-red-light">Sutherland Vision Hub</p>
            <h2 className="text-xl font-semibold">Vision Dashboards</h2>
          </div>
        </div>
        <nav className="space-y-2">
          {DASHBOARD_NAV.map(([href, label]) => (
            <Link
              key={href}
              href={`/dashboard/${href}`}
              className={`block rounded-xl px-4 py-3 text-sm font-medium transition ${slug === href ? "bg-brand-red text-white" : "text-brand-blue-tint hover:bg-brand-blue-light"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="flex-1">
        <header className="bg-brand-blue px-5 py-5 text-white md:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-brand-blue-light p-2.5 lg:hidden"
                type="button"
                aria-label="Open dashboard menu"
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl font-semibold">{title}</h1>
                <p className="mt-1 text-sm text-brand-blue-tint">Last updated: {lastUpdated}</p>
              </div>
            </div>
            <div className="rounded-xl bg-brand-blue-light px-4 py-2 text-sm font-medium">
              Showing {filteredRows.length} of {sourceRows.length} records
            </div>
          </div>
          {mobileNavOpen ? (
            <div className="fixed inset-0 z-50 lg:hidden">
              <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setMobileNavOpen(false)} />
              <div className="absolute left-0 top-0 flex h-full w-[min(20rem,88vw)] flex-col bg-brand-blue p-5 shadow-card">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-semibold text-brand-blue-tint">Dashboards</span>
                  <button type="button" className="rounded-lg p-2 hover:bg-brand-blue-light" onClick={() => setMobileNavOpen(false)} aria-label="Close">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <nav className="flex flex-1 flex-col gap-2 overflow-y-auto">
                  {DASHBOARD_NAV.map(([href, label]) => (
                    <Link
                      key={href}
                      href={`/dashboard/${href}`}
                      onClick={() => setMobileNavOpen(false)}
                      className={`rounded-xl px-4 py-3 text-sm font-medium ${slug === href ? "bg-brand-red text-white" : "text-brand-blue-tint hover:bg-brand-blue-light"}`}
                    >
                      {label}
                    </Link>
                  ))}
                </nav>
              </div>
            </div>
          ) : null}
        </header>

        <div className="space-y-6 px-4 py-6 md:px-8">
          <Card className="border-brand-blue/10">
            <CardContent className="flex items-start gap-4 p-5">
              <div className="rounded-xl bg-brand-red-tint p-3 text-brand-red">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-blue">Use Case Overview</p>
                <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-brand-blue-tint p-2 text-brand-blue">
                  <Filter className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle>Filters</CardTitle>
                  <CardDescription>All KPI cards, charts, and table rows update from the same filtered dataset.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-ink">From</span>
                  <input className="rounded-lg border border-brand-blue bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-red" type="date" value={filters.from} onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-ink">To</span>
                  <input className="rounded-lg border border-brand-blue bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-red" type="date" value={filters.to} onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))} />
                </label>
                <SelectField
                  label="Time Granularity"
                  value={timeGranularity}
                  onChange={setTimeGranularity}
                  options={TIME_GRANULARITIES.map((label) => ({ label, value: label }))}
                />
                {slug !== "ppe-detection" ? (
                  <SelectField label="Location" value={filters.location} onChange={(value) => setFilters((prev) => ({ ...prev, location: value }))} options={optionsFor("location")} />
                ) : null}
              </div>
              <div className="space-y-3">
                {slug !== "ppe-detection" ? (
                  <>
                    <div>
                      <span className="block text-sm font-medium text-ink mb-2">Zone</span>
                      <PillCheckboxRow
                        options={optionsFor("zone", false)}
                        selectedValues={filters.zone}
                        onChange={(values) => setFilters((prev) => ({ ...prev, zone: values }))}
                      />
                    </div>
                    <div>
                      <span className="block text-sm font-medium text-ink mb-2">Camera ID</span>
                      <PillCheckboxRow
                        options={optionsFor("cameraId", false)}
                        selectedValues={filters.cameraId}
                        onChange={(values) => setFilters((prev) => ({ ...prev, cameraId: values }))}
                      />
                    </div>
                  </>
                ) : null}
                {extraFilterDefs.map((def) => {
                  const isMultiSelect = multiSelectKeys.includes(def.key);
                  const currentValue = extraFilters[def.key];
                  if (isMultiSelect) {
                    return (
                      <div key={def.key}>
                        <span className="block text-sm font-medium text-ink mb-2">{def.label}</span>
                        <PillCheckboxRow
                          options={optionsFor(def.key, false)}
                          selectedValues={Array.isArray(currentValue) ? currentValue : []}
                          onChange={(values) => setExtraFilters((prev) => ({ ...prev, [def.key]: values }))}
                        />
                      </div>
                    );
                  }
                  return (
                    <div key={def.key}>
                      <SelectField label={def.label} value={currentValue} onChange={(value) => setExtraFilters((prev) => ({ ...prev, [def.key]: value }))} options={optionsFor(def.key)} />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end">
                <Button variant="default" className="gap-2 shadow-card" onClick={resetFilters}>
                  <TimerReset className="h-4 w-4" />
                  Reset Filters
                </Button>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-32 w-full" />
                ))}
              </section>
              <section className="grid gap-6 xl:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <ChartSkeleton key={index} />
                ))}
              </section>
            </>
          ) : (
            <>
              {dataLoading ? (
                <div className="rounded-xl border border-brand-blue/20 bg-brand-blue-tint/30 px-4 py-3 text-sm text-brand-blue">
                  Loading CSV data...
                </div>
              ) : null}
              {dataError ? (
                <div className="rounded-xl border border-brand-red/30 bg-brand-red-tint px-4 py-3 text-sm text-brand-red">
                  {dataError}
                </div>
              ) : null}
              <KpiGrid items={kpis} />
              <section className="grid gap-6 xl:grid-cols-2">{charts}</section>
            </>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Filtered Records</CardTitle>
              <CardDescription>Sortable detailed records for the current filter selection.</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={columns}
                rows={sortedRows}
                sortState={sortState}
                rowClassName={
                  slug === "region-alerts"
                    ? (row) => (row.escalationNeeded === "Yes" ? "bg-brand-red-tint/70" : "")
                    : slug === "fire-detection"
                      ? (row) => (row.escalationNeeded === "Yes" ? "bg-brand-red-tint/70" : "")
                      : slug === "speed-estimation"
                        ? (row) => (row.status === "Violation" ? "bg-brand-red-tint/40" : "")
                    : undefined
                }
                onSort={(key) =>
                  setSortState((prev) => ({
                    key,
                    direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
                  }))
                }
              />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

export function buildDashboardDefinition(slug, rows, info) {
  const badgeRender = (value) => <Badge tone={toneForStatus(value)}>{value}</Badge>;

  const configs = {
    "object-counting": {
      title: "Object Counting Dashboard",
      description: info,
      extraFilterDefs: [
        { key: "objectType", label: "Object Type" },
        { key: "status", label: "Status" },
      ],
      metricDefs: [
        { label: "Total Objects Detected", icon: LayoutDashboard, compute: (items) => sum(items.map((item) => item.objectCount)), format: (value) => value.toLocaleString() },
        { label: "Over Count Alerts", icon: AlertTriangle, compute: (items) => items.filter((item) => item.status === "Over Count").length, format: String },
        { label: "Under Count Alerts", icon: AlertTriangle, compute: (items) => items.filter((item) => item.status === "Under Count").length, format: String },
        {
          label: "Average Count Accuracy %",
          icon: Activity,
          compute: (items) => average(items.map((item) => item.confidenceScore)) * 100,
          format: (value) => `${Number(value || 0).toFixed(1)}%`,
        },
      ],
      columns: [
        { key: "inputId", label: "Input ID", sortable: true },
        { key: "cameraId", label: "Camera ID", sortable: true },
        { key: "zone", label: "Zone", sortable: true },
        { key: "objectType", label: "Object Type", sortable: true },
        { key: "objectCount", label: "Actual Count", sortable: true },
        { key: "expectedCount", label: "Expected Count", sortable: true },
        { key: "countDifference", label: "Difference", sortable: true },
        { key: "confidenceScore", label: "Confidence", sortable: true, render: (value) => `${(value * 100).toFixed(1)}%` },
        { key: "status", label: "Status", sortable: true, render: badgeRender },
      ],
    },
    "region-alerts": {
      title: "Warehouse Pedestrian Safety & Intrusion Monitor",
      description: info,
      extraFilterDefs: [
        { key: "zoneType", label: "Zone Type" },
        { key: "shift", label: "Shift" },
        { key: "severity", label: "Severity" },
        { key: "status", label: "Status" },
      ],
      metricDefs: [
        {
          label: "Total Region Alert Events",
          icon: ShieldAlert,
          compute: (items) => items.filter(isRegionIncident).length,
          format: (value) => value.toLocaleString(),
          subtext: "True intrusion events, excluding normal frames.",
          valueClassName: () => "text-brand-blue",
        },
        {
          label: "Open Intrusion Incidents",
          icon: AlertTriangle,
          compute: (items) => items.filter((item) => isRegionIncident(item) && item.status === "Open").length,
          format: String,
          subtext: "Incidents still requiring closure.",
          valueClassName: (value) => (value > 0 ? "text-brand-red" : "text-brand-blue"),
        },
        {
          label: "Critical Hazard Breaches",
          icon: AlertTriangle,
          compute: (items) => items.filter((item) => isRegionIncident(item) && item.severity === "High").length,
          format: String,
          subtext: "High-risk entries into restricted or hazardous areas.",
          valueClassName: () => "text-brand-red",
        },
        {
          label: "Average Time Inside Restricted Zone",
          icon: Activity,
          compute: (items) => average(items.filter(isRegionIncident).map((item) => item.durationSec)),
          format: formatDurationLabel,
          subtext: "Average incident dwell time.",
          valueClassName: () => "text-brand-blue",
        },
        {
          label: "Longest Open Incident",
          icon: Activity,
          compute: (items) => Math.max(0, ...items.filter((item) => isRegionIncident(item) && item.status === "Open").map((item) => item.durationSec)),
          format: formatDurationLabel,
          subtext: "Longest unresolved dwell time.",
          valueClassName: (value) => (value >= 180 ? "text-brand-red" : "text-brand-blue"),
        },
        {
          label: "Most Violated Zone",
          icon: ShieldAlert,
          compute: (items) => Object.entries(groupBy(items.filter(isRegionIncident), "zone")).sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? "No incidents",
          format: String,
          subtext: "Top recurring intrusion location.",
          valueClassName: () => "text-brand-blue",
        },
        {
          label: "Most Triggered Camera",
          icon: ShieldAlert,
          compute: (items) => Object.entries(groupBy(items.filter(isRegionIncident), "cameraId")).sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? "No incidents",
          format: String,
          subtext: "Camera producing the most region alerts.",
          valueClassName: () => "text-brand-blue",
        },
      ],
      columns: [
        { key: "id", label: "Incident ID", sortable: true },
        { key: "cameraId", label: "Camera ID", sortable: true },
        { key: "location", label: "Location", sortable: true },
        { key: "zone", label: "Zone", sortable: true },
        { key: "zoneType", label: "Zone Type", sortable: true },
        { key: "shift", label: "Shift", sortable: true },
        { key: "entryTime", label: "Entry Time", sortable: true, render: formatDateTime },
        { key: "exitTime", label: "Exit Time", sortable: true, render: (value) => (value ? formatDateTime(value) : "Open") },
        { key: "durationSec", label: "Duration (sec)", sortable: true },
        { key: "alertType", label: "Alert Type", sortable: true },
        { key: "severity", label: "Severity", sortable: true, render: badgeRender },
        { key: "status", label: "Status", sortable: true, render: badgeRender },
        { key: "confidenceScore", label: "Confidence Score", sortable: true, render: (value) => `${(Number(value || 0) * 100).toFixed(1)}%` },
        { key: "assignedTo", label: "Assigned To", sortable: true },
        { key: "escalationNeeded", label: "Escalation Needed", sortable: true, render: (value) => badgeRender(value === "Yes" ? "Needed" : "Normal") },
        { key: "snapshotUrl", label: "Snapshot / Output", sortable: false, render: (value) => (value ? <span className="font-semibold text-brand-blue">View output</span> : "N/A") },
      ],
    },
    "queue-management": {
      title: "Queue Management Dashboard",
      description: info,
      extraFilterDefs: [
        { key: "counterId", label: "Counter ID" },
        { key: "isBreached", label: "Breach Status" },
        { key: "staffCount", label: "Staff Count" },
      ],
      metricDefs: [
        { label: "Total Queue Readings", icon: LayoutDashboard, compute: (items) => items.length, format: String },
        { label: "Breach Incidents", icon: AlertTriangle, compute: (items) => items.filter((item) => item.isBreached === "Yes").length, format: String },
        { label: "Avg Queue Length", icon: Activity, compute: (items) => average(items.map((item) => item.queueLength)), format: (value) => value.toFixed(1) },
        { label: "Avg Wait Time", icon: Activity, compute: (items) => average(items.map((item) => item.estimatedWaitSec)), format: formatSeconds },
      ],
      columns: [
        { key: "cameraId", label: "Camera ID", sortable: true },
        { key: "zone", label: "Zone", sortable: true },
        { key: "counterId", label: "Counter ID", sortable: true },
        { key: "queueLength", label: "Queue Length", sortable: true },
        { key: "maxQueueLimit", label: "Max Limit", sortable: true },
        { key: "estimatedWaitSec", label: "Wait Time (sec)", sortable: true },
        { key: "isBreached", label: "Breached", sortable: true, render: (value) => badgeRender(value === "Yes" ? "Alert" : "Normal") },
        { key: "excessCount", label: "Excess Count", sortable: true },
        { key: "staffCount", label: "Staff Count", sortable: true },
        { key: "status", label: "Status", sortable: true, render: badgeRender },
      ],
    },
    "speed-estimation": {
      title: "Industrial Movement Speed Risk Monitor",
      description: info,
      extraFilterDefs: [
        { key: "objectType", label: "Object Type" },
        { key: "status", label: "Status" },
        { key: "speedLimitKmh", label: "Speed Limit" },
        { key: "severity", label: "Severity" },
      ],
      metricDefs: [
        { label: "Total Detected Objects", icon: LayoutDashboard, compute: (items) => items.length, format: String, subtext: "All tracked movement detections in the selected period." },
        { label: "Speed Violation Events", icon: AlertTriangle, compute: (items) => items.filter((item) => item.isOverspeeding === "Yes").length, format: String, subtext: "Detections traveling above the configured zone speed limit.", valueClassName: () => "text-brand-red" },
        { label: "Violation Rate", icon: Activity, compute: (items) => (items.length ? (items.filter((item) => item.isOverspeeding === "Yes").length / items.length) * 100 : 0), format: (value) => `${Number(value || 0).toFixed(1)}%`, subtext: "Share of monitored movement occurring above safe speed." },
        { label: "Average Detected Speed", icon: Activity, compute: (items) => average(items.map((item) => item.detectedSpeedKmh)), format: (value) => `${Number(value || 0).toFixed(1)} km/h`, subtext: "Average movement speed across all tracked objects." },
        { label: "Maximum Speed Recorded", icon: Activity, compute: (items) => (items.length ? Math.max(...items.map((item) => item.detectedSpeedKmh)) : 0), format: (value) => `${value} km/h`, subtext: "Fastest object detected during the selected monitoring window.", valueClassName: () => "text-brand-red" },
        { label: "Most Violated Zone", icon: AlertTriangle, compute: (items) => Object.entries(groupBy(items.filter((item) => item.isOverspeeding === "Yes"), "zone")).sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? "No violations", format: String, subtext: "Area showing the most overspeed detections." },
        { label: "Highest-Risk Object Type", icon: Route, compute: (items) => Object.entries(groupBy(items.filter((item) => item.isOverspeeding === "Yes"), "objectType")).sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? "No violations", format: String, subtext: "Object category most often exceeding safe speed." },
      ],
      columns: [
        { key: "timestamp", label: "Timestamp", sortable: true, render: formatDateTime },
        { key: "cameraId", label: "Camera ID", sortable: true },
        { key: "location", label: "Location", sortable: true },
        { key: "zone", label: "Zone", sortable: true },
        { key: "objectId", label: "Object ID", sortable: true },
        { key: "objectType", label: "Object Type", sortable: true },
        { key: "detectedSpeedKmh", label: "Detected Speed (km/h)", sortable: true },
        { key: "speedLimitKmh", label: "Speed Limit (km/h)", sortable: true },
        { key: "isOverspeeding", label: "Overspeeding", sortable: true, render: (value) => badgeRender(value === "Yes" ? "Violation" : "Normal") },
        { key: "excessSpeedKmh", label: "Excess Speed (km/h)", sortable: true },
        { key: "severity", label: "Severity", sortable: true, render: (value) => <Badge tone={value === "High" ? "high" : value === "Medium" ? "warning" : value === "Low" ? "alert" : "normal"}>{value}</Badge> },
        { key: "confidenceScore", label: "Confidence Score", sortable: true, render: (value) => `${(Number(value || 0) * 100).toFixed(1)}%` },
        { key: "status", label: "Status", sortable: true, render: badgeRender },
      ],
    },
    "fire-detection": {
      title: "Warehouse Fire & Smoke Safety Center",
      description: info,
      extraFilterDefs: [
        { key: "status", label: "Status" },
      ],
      metricDefs: [
        {
          label: "Total Camera Feeds Analyzed",
          icon: Flame,
          compute: (items) => items.length,
          format: (value) => value.toLocaleString(),
          subtext: "Total camera feeds analyzed during this period.",
          valueClassName: () => "text-brand-blue",
        },
        {
          label: "Total Fire/Smoke Alert Videos",
          icon: Flame,
          compute: (items) => items.filter((item) => item.alertType !== "Clear / No Alert").length,
          format: String,
          subtext: "Videos containing confirmed fire or smoke.",
          valueClassName: () => "text-brand-red",
        },
        {
          label: "Critical Fire/Smoke Events",
          icon: AlertTriangle,
          compute: (items) => items.filter((item) => item.severity === "High" || item.alertType === "Fire + Smoke").length,
          format: String,
          subtext: "High severity incidents requiring immediate review.",
          valueClassName: () => "text-brand-red",
        },
        {
          label: "Average Time to First Detection",
          icon: Activity,
          compute: (items) => average(items.filter((item) => item.firstDetectionSec > 0).map((item) => item.firstDetectionSec)),
          format: (value) => `${Math.round(Number(value) || 0)} sec`,
          subtext: "Average seconds until the first hazard is detected.",
          valueClassName: () => "text-brand-blue",
        },
      ],
      columns: [
        { key: "timestamp", label: "Date/Time", sortable: true, render: formatDateTime },
        { key: "cameraId", label: "Camera ID", sortable: true },
        { key: "zone", label: "Zone", sortable: true },
        { key: "alertType", label: "Alert Type", sortable: true },
        { key: "severity", label: "Severity", sortable: true, render: (value) => <Badge tone={value === "High" ? "high" : value === "Medium" ? "medium" : "normal"}>{value}</Badge> },
        { key: "firstDetectionSec", label: "First Detection Time (sec)", sortable: true },
        { key: "status", label: "Status", sortable: true, render: (value) => <Badge tone={value === "Alert" ? "alert" : "normal"}>{value}</Badge> },
      ],
    },
    "class-wise-counting": {
      title: "Class-Wise Object Counting Dashboard",
      description: info,
      extraFilterDefs: [
        { key: "className", label: "Class Name" },
        { key: "status", label: "Status" },
      ],
      metricDefs: [
        { label: "Total Objects Detected", icon: LayoutDashboard, compute: (items) => sum(items.map((item) => item.classCount)), format: String },
        { label: "Most Frequent Class", icon: Activity, compute: (items) => Object.entries(groupBy(items, "className")).sort((a, b) => sum(b[1].map((row) => row.classCount)) - sum(a[1].map((row) => row.classCount)))[0]?.[0] ?? "N/A", format: String },
        { label: "Over Count Alerts", icon: AlertTriangle, compute: (items) => items.filter((item) => item.status === "Over Count").length, format: String },
        { label: "Under Count Alerts", icon: AlertTriangle, compute: (items) => items.filter((item) => item.status === "Under Count").length, format: String },
      ],
      columns: [
        { key: "cameraId", label: "Camera ID", sortable: true },
        { key: "zone", label: "Zone", sortable: true },
        { key: "className", label: "Class Name", sortable: true },
        { key: "classCount", label: "Class Count", sortable: true },
        { key: "expectedCount", label: "Expected Count", sortable: true },
        { key: "difference", label: "Difference", sortable: true },
        { key: "totalInFrame", label: "Total in Frame", sortable: true },
        { key: "classPercent", label: "Class %", sortable: true, render: (value) => `${value}%` },
        { key: "confidence", label: "Confidence", sortable: true, render: (value) => `${(value * 100).toFixed(1)}%` },
        { key: "status", label: "Status", sortable: true, render: badgeRender },
      ],
    },
    "object-tracking": {
      title: "Object Tracking Dashboard",
      description: info,
      extraFilterDefs: [
        { key: "objectType", label: "Object Type" },
        { key: "isAnomaly", label: "Anomaly Filter" },
        { key: "status", label: "Status" },
      ],
      metricDefs: [
        { label: "Total Objects Tracked", icon: LayoutDashboard, compute: (items) => items.length, format: String },
        { label: "Anomalies Detected", icon: AlertTriangle, compute: (items) => items.filter((item) => item.isAnomaly === "Yes").length, format: String },
        { label: "Avg Time in Zone", icon: Activity, compute: (items) => average(items.map((item) => item.durationInZoneSec)), format: (value) => `${Math.round(value / 60)} min` },
        { label: "Most Congested Zone", icon: Activity, compute: (items) => Object.entries(groupBy(items, "zone")).sort((a, b) => average(b[1].map((row) => row.durationInZoneSec)) - average(a[1].map((row) => row.durationInZoneSec)))[0]?.[0] ?? "N/A", format: String },
      ],
      columns: [
        { key: "objectId", label: "Object ID", sortable: true },
        { key: "cameraId", label: "Camera ID", sortable: true },
        { key: "zone", label: "Zone", sortable: true },
        { key: "objectType", label: "Object Type", sortable: true },
        { key: "entryTime", label: "Entry Time", sortable: true, render: formatDateTime },
        { key: "exitTime", label: "Exit Time", sortable: true, render: formatDateTime },
        { key: "durationInZoneSec", label: "Duration (sec)", sortable: true },
        { key: "nextZone", label: "Next Zone", sortable: true },
        { key: "pathSequence", label: "Path Sequence", sortable: true },
        { key: "isAnomaly", label: "Anomaly", sortable: true, render: (value) => badgeRender(value === "Yes" ? "Anomaly" : "Normal") },
        { key: "status", label: "Status", sortable: true, render: badgeRender },
      ],
    },
    "ppe-detection": {
      title: "PPE Compliance Monitor",
      description: info,
      extraFilterDefs: [
        { key: "shift", label: "Shift" },
        { key: "status", label: "Status" },
      ],
      metricDefs: [
        { label: "Total Workers Tracked", icon: LayoutDashboard, compute: (items) => new Set(items.map((item) => item.personId)).size, format: String },
        { label: "Active PPE Violations", icon: AlertTriangle, compute: (items) => items.filter((item) => item.status === "Active" && item.violationType !== "Compliant").length, format: String, valueClassName: () => "text-brand-red" },
        {
          label: "Most Missing Item",
          icon: HardHat,
          compute: (items) => {
            const helmetMissing = items.filter((item) => item.violationType === "Missing Helmet" || item.violationType === "Missing Both").length;
            const vestMissing = items.filter((item) => item.violationType === "Missing Vest" || item.violationType === "Missing Both").length;
            if (helmetMissing === 0 && vestMissing === 0) return "No active misses";
            if (helmetMissing === vestMissing) return "Helmet / Vest tied";
            return helmetMissing > vestMissing ? "Helmet" : "Vest";
          },
          format: String,
        },
        { label: "Avg Exposure Duration", icon: Activity, compute: (items) => average(items.filter((item) => item.violationType !== "Compliant").map((item) => item.durationSec)), format: formatDurationLabel },
      ],
      columns: [
        { key: "personId", label: "Person ID", sortable: true },
        { key: "violationType", label: "Violation Type", sortable: true },
        { key: "entryTime", label: "Entry Time", sortable: true, render: formatDateTime },
        { key: "durationSec", label: "Duration", sortable: true, render: formatDurationLabel },
        { key: "confidenceScore", label: "Confidence Score", sortable: true, render: (value) => `${(Number(value || 0) * 100).toFixed(1)}%` },
        { key: "status", label: "Status", sortable: true, render: badgeRender },
      ],
    },
  };

  return configs[slug];
}
