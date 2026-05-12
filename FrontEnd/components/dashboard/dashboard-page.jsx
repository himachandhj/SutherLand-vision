"use client";

import { useMemo, useState, useEffect } from "react";
import Image from "next/image";
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
import { Activity, AlertTriangle, Filter, Flame, HardHat, LayoutDashboard, Menu, Route, ShieldAlert, Smartphone, TimerReset, X } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { SelectField } from "../ui/select";
import { DataTable } from "../ui/table";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { PillCheckboxRow } from "../ui/pill-checkbox";
import sutherlandLogo from "../../Sutherland_logo.png";
import { useFireData } from "../../src/hooks/useFireData";
import { usePPEData } from "../../src/hooks/usePPEData";
import { useRegionAlertsData } from "../../src/hooks/useRegionAlertsData";
import { useSpeedEstimationData } from "../../src/hooks/useSpeedEstimationData";
import { useCrackDetectionData } from "../../src/hooks/useCrackDetectionData";
import { useUnsafeBehaviorData } from "../../src/hooks/useUnsafeBehaviorData";
import { average, byTimestamp, formatDate, formatDateTime, formatSeconds, groupBy, shiftFromTimestamp, sortRows, sum, toneForStatus, uniqueOptions } from "./helpers";

const chartPalette = ["#27235C", "#DE1B54", "#3D3880", "#F04E7A", "#6B6B8A", "#C8C6E8"];
const SEMANTIC_GREEN = "#27235C";
const SEMANTIC_YELLOW = "rgba(222, 27, 84, 0.6)";
const SEVERITY_COLORS = {
  Critical: "#A01240",
  High: "#DE1B54",
  Medium: "#F06A8F",
  Low: "#27235C",
  None: "#6B6B8A",
};
const SHIFT_ORDER = ["Morning Shift", "Swing Shift", "Night Shift"];
const SEVERITY_ORDER = ["Critical", "High", "Medium", "Low", "None"];
const REGION_ALERTS_LANGUAGE_STORAGE_KEY = "region-alerts-ui-language";
const REGION_ALERTS_DEMO_INTRUSION_VARIANTS = [
  { objectType: "car", alertType: "Vehicle Intrusion" },
  { objectType: "truck", alertType: "Vehicle Intrusion" },
  { objectType: "bus", alertType: "Vehicle Intrusion" },
  { objectType: "motorcycle", alertType: "Vehicle Intrusion" },
  { objectType: "bicycle", alertType: "Vehicle Intrusion" },
  { objectType: "forklift", alertType: "Vehicle Intrusion" },
  { objectType: "car", alertType: "Vehicle Intrusion" },
  { objectType: "truck", alertType: "Vehicle Intrusion" },
  { objectType: "bus", alertType: "Vehicle Intrusion" },
  { objectType: "motorcycle", alertType: "Vehicle Intrusion" },
  { objectType: "car", alertType: "Person or Vehicle Intrusion" },
  { objectType: "truck", alertType: "Person or Vehicle Intrusion" },
  { objectType: "forklift", alertType: "Person or Vehicle Intrusion" },
  { objectType: "bicycle", alertType: "Person or Vehicle Intrusion" },
];
const REGION_ALERTS_DASHBOARD_I18N = {
  en: {
    title: "Region Alerts Detection",
    description: "Detect people or vehicles entering restricted, hazardous, or monitored zones.",
    useCaseOverview: "Use Case Overview",
    filters: "Filters",
    filtersDescription: "Use compact filters to focus the current intrusion view.",
    selectAll: "Select All",
    clearAll: "Clear All",
    from: "From",
    to: "To",
    timeGranularity: "Time Granularity",
    location: "Location",
    zone: "Zone",
    camera: "Camera",
    detectedClass: "Detected Class",
    intrusionType: "Intrusion Type",
    shift: "Shift",
    severity: "Severity",
    status: "Status",
    eventId: "Event ID",
    entryTime: "Entry Time",
    exitTime: "Exit Time",
    duration: "Duration",
    confidence: "Confidence",
    lastUpdated: (value) => `Last updated: ${value}`,
    resetFilters: "Reset Filters",
    intrusionSnapshot: "Intrusion Snapshot",
    intrusionSnapshotDescription: "A focused view of the latest intrusion activity across monitored zones and cameras.",
    severityFocus: "Severity Focus",
    severityFocusDescription: "Click a severity category to focus the intrusion visuals on the same risk tier.",
    highSeverity: "High Severity",
    mediumSeverity: "Medium Severity",
    lowSeverity: "Low Severity",
    criticalSeverity: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
    critical: "Critical",
    crossFilteringActive: "Cross-filtering is active",
    crossFilteringDescription: "Chart selections are narrowing the incident story across cards, charts, and the table.",
    timeChip: (value) => `Time: ${value}`,
    zoneChip: (value) => `Zone: ${value}`,
    violationChip: (value) => `Violation: ${value}`,
    severityChip: (value) => `Severity: ${value}`,
    clearSelections: "Clear selections",
    noIntrusionEventsAvailableYet: "No intrusion events available yet",
    noIntrusionEventsAvailableDescription: "Process an intrusion monitoring video to populate the dashboard. The dashboard will refresh automatically every 5 seconds.",
    noIntrusionEventsMatchFilter: "No intrusion events match the selected chart filter. Clear the filter to view all incidents.",
    noIntrusionEventsMatchFilterDescription: "The current global filters are still applied, but this chart selection does not match any remaining events.",
    noProcessedIncidents: "No processed incidents available for this view. Run Integration to populate the dashboard.",
    noProcessedIncidentsDescription: "Adjust the filters or process new inputs from the Integration tab to refresh this business view.",
    detectedIntrusionEvents: "Detected Intrusion Events",
    detectedIntrusionEventsDescription: "Review where intrusions occurred, what was detected, severity, status, and available evidence.",
    totalIntrusions: "Total Intrusions",
    totalIntrusionsSubtext: "All intrusion events in the selected monitoring window.",
    highCriticalAlerts: "High / Critical Alerts",
    highCriticalAlertsSubtext: "High-priority intrusion events that need the fastest response.",
    mostAffectedZone: "Most Affected Zone",
    mostAffectedZoneSubtext: "Zone with the highest concentration of intrusion activity.",
    latestAlert: "Latest Alert",
    latestAlertSubtext: "Most recent intrusion event surfaced in the current view.",
    noIncidents: "No incidents",
    noAlerts: "No alerts",
    stillOpen: "Still Open",
    all: "All",
    open: "Open",
    past: "Past",
    hourly: "Hourly",
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    morningShift: "Morning Shift",
    swingShift: "Swing Shift",
    nightShift: "Night Shift",
    personIntrusion: "Person Intrusion",
    vehicleIntrusion: "Vehicle Intrusion",
    personOrVehicleIntrusion: "Person or Vehicle Intrusion",
    allIntrusionTypes: "All Intrusion Types",
    incidentTrendBySeverity: "Incident Trend by Severity",
    incidentTrendDesc: "Shows when restricted-zone incidents occur so teams can spot peak risk periods and staffing gaps.",
    recentAlertsByZone: "Recent Alerts by Zone",
    recentAlertsByZoneDesc: "Shows recent intrusion activity grouped by monitored zone.",
    intrusionTypeBreakdown: "Intrusion Type Breakdown",
    intrusionTypeBreakdownDesc: "Shows the split between person, vehicle, and mixed intrusion activity in the current view.",
    durationRiskInterpretation: "Duration Risk Interpretation",
    durationRiskDesc: "Separates brief accidental crossings from prolonged high-risk intrusions.",
    triggeredCamerasByShift: "Triggered Cameras by Shift",
    triggeredCamerasByShiftDesc: "Identifies cameras and operating shifts generating the most alerts.",
    incidentCount: "Incident Count",
    monitoredZone: "Monitored Zone",
    durationCategory: "Duration Category",
    briefCrossing: "Brief crossing (0-60s)",
    suspiciousPresence: "Suspicious presence (61-180s)",
    highRiskIntrusion: "High-risk intrusion (180s+)",
  },
  ar: {
    title: "كشف تنبيهات المناطق",
    description: "اكتشاف دخول الأشخاص أو المركبات إلى المناطق المقيّدة أو الخطرة أو الخاضعة للمراقبة.",
    useCaseOverview: "نظرة عامة على حالة الاستخدام",
    filters: "الفلاتر",
    filtersDescription: "استخدم فلاتر مختصرة للتركيز على عرض التسلل الحالي.",
    selectAll: "تحديد الكل",
    clearAll: "مسح الكل",
    from: "من",
    to: "إلى",
    timeGranularity: "درجة تفصيل الوقت",
    location: "الموقع",
    zone: "المنطقة",
    camera: "الكاميرا",
    detectedClass: "الفئة المكتشفة",
    intrusionType: "نوع التسلل",
    shift: "الوردية",
    severity: "الخطورة",
    status: "الحالة",
    eventId: "معرّف الحدث",
    entryTime: "وقت الدخول",
    exitTime: "وقت الخروج",
    duration: "المدة",
    confidence: "الثقة",
    lastUpdated: (value) => `آخر تحديث: ${value}`,
    resetFilters: "إعادة ضبط الفلاتر",
    intrusionSnapshot: "ملخص التسلل",
    intrusionSnapshotDescription: "عرض مركز لأحدث نشاطات التسلل عبر المناطق والكاميرات الخاضعة للمراقبة.",
    severityFocus: "التركيز حسب الخطورة",
    severityFocusDescription: "انقر على فئة خطورة للتركيز على العناصر المرئية الخاصة بالتسلل ضمن المستوى نفسه.",
    highSeverity: "خطورة عالية",
    mediumSeverity: "خطورة متوسطة",
    lowSeverity: "خطورة منخفضة",
    criticalSeverity: "حرجة",
    high: "عالية",
    medium: "متوسطة",
    low: "منخفضة",
    critical: "حرجة",
    crossFilteringActive: "التصفية المتقاطعة مفعلة",
    crossFilteringDescription: "تعمل اختيارات الرسوم البيانية على تضييق قصة الحوادث عبر البطاقات والرسوم والجدول.",
    timeChip: (value) => `الوقت: ${value}`,
    zoneChip: (value) => `المنطقة: ${value}`,
    violationChip: (value) => `المخالفة: ${value}`,
    severityChip: (value) => `الخطورة: ${value}`,
    clearSelections: "مسح التحديدات",
    noIntrusionEventsAvailableYet: "لا توجد أحداث تسلل متاحة بعد",
    noIntrusionEventsAvailableDescription: "قم بمعالجة فيديو لمراقبة التسلل لملء لوحة المعلومات. سيتم تحديث اللوحة تلقائياً كل 5 ثوانٍ.",
    noIntrusionEventsMatchFilter: "لا توجد أحداث تسلل تطابق فلتر الرسم البياني المحدد. امسح الفلتر لعرض جميع الحوادث.",
    noIntrusionEventsMatchFilterDescription: "ما زالت الفلاتر العامة الحالية مطبقة، لكن هذا الاختيار في الرسم البياني لا يطابق أي أحداث متبقية.",
    noProcessedIncidents: "لا توجد حوادث معالجة متاحة لهذا العرض. شغّل التكامل لملء لوحة المعلومات.",
    noProcessedIncidentsDescription: "عدّل الفلاتر أو عالج مدخلات جديدة من تبويب التكامل لتحديث هذا العرض التشغيلي.",
    detectedIntrusionEvents: "أحداث التسلل المكتشفة",
    detectedIntrusionEventsDescription: "راجع أماكن حدوث التسلل وما تم اكتشافه ومستوى الخطورة والحالة والأدلة المتاحة.",
    totalIntrusions: "إجمالي حالات التسلل",
    totalIntrusionsSubtext: "جميع أحداث التسلل ضمن نافذة المراقبة المحددة.",
    highCriticalAlerts: "تنبيهات عالية / حرجة",
    highCriticalAlertsSubtext: "أحداث تسلل عالية الأولوية تحتاج إلى أسرع استجابة.",
    mostAffectedZone: "أكثر منطقة تأثراً",
    mostAffectedZoneSubtext: "المنطقة ذات التركيز الأعلى لنشاط التسلل.",
    latestAlert: "آخر تنبيه",
    latestAlertSubtext: "أحدث حدث تسلل ظهر في العرض الحالي.",
    noIncidents: "لا توجد حوادث",
    noAlerts: "لا توجد تنبيهات",
    stillOpen: "لا يزال مفتوحاً",
    all: "الكل",
    open: "مفتوح",
    past: "سابق",
    hourly: "بالساعة",
    daily: "يومي",
    weekly: "أسبوعي",
    monthly: "شهري",
    morningShift: "وردية الصباح",
    swingShift: "وردية المساء",
    nightShift: "وردية الليل",
    personIntrusion: "تسلل شخص",
    vehicleIntrusion: "دخول مركبة غير مصرح",
    personOrVehicleIntrusion: "دخول شخص أو مركبة غير مصرح",
    allIntrusionTypes: "جميع أنواع الدخول",
    incidentTrendBySeverity: "اتجاه الحوادث حسب الخطورة",
    incidentTrendDesc: "يوضح متى تحدث حوادث المناطق المقيّدة حتى تتمكن الفرق من رصد فترات الخطر القصوى وفجوات التغطية.",
    recentAlertsByZone: "التنبيهات الأخيرة حسب المنطقة",
    recentAlertsByZoneDesc: "يعرض نشاط الدخول الأخير مجمعاً حسب المنطقة المراقبة.",
    intrusionTypeBreakdown: "توزيع أنواع التسلل",
    intrusionTypeBreakdownDesc: "يوضح توزيع نشاط التسلل بين الأشخاص والمركبات والنشاط المختلط في العرض الحالي.",
    durationRiskInterpretation: "تفسير المخاطر حسب المدة",
    durationRiskDesc: "يفصل بين العبور القصير العرضي وحالات التسلل المطولة عالية الخطورة.",
    triggeredCamerasByShift: "الكاميرات التي أطلقت تنبيهات حسب الوردية",
    triggeredCamerasByShiftDesc: "يحدد الكاميرات والورديات التشغيلية التي تولد أكبر عدد من التنبيهات.",
    incidentCount: "عدد الحوادث",
    monitoredZone: "المنطقة المراقبة",
    durationCategory: "فئة المدة",
    briefCrossing: "عبور قصير (0-60ث)",
    suspiciousPresence: "وجود مريب (61-180ث)",
    highRiskIntrusion: "تسلل عالي الخطورة (180ث+)",
  },
};

function resolveRegionAlertsLanguage(value) {
  return value === "ar" ? "ar" : "en";
}

function getStoredRegionAlertsLanguage() {
  if (typeof window === "undefined") return "en";
  return resolveRegionAlertsLanguage(window.localStorage.getItem(REGION_ALERTS_LANGUAGE_STORAGE_KEY));
}

function getRegionAlertsDashboardText(language, key, ...args) {
  const normalizedLanguage = resolveRegionAlertsLanguage(language);
  const localizedValue = REGION_ALERTS_DASHBOARD_I18N[normalizedLanguage]?.[key];
  const fallbackValue = REGION_ALERTS_DASHBOARD_I18N.en[key];
  const entry = localizedValue ?? fallbackValue;
  return typeof entry === "function" ? entry(...args) : entry ?? key;
}

function translateRegionAlertsGranularity(language, value) {
  const granularityKey = {
    Hourly: "hourly",
    Daily: "daily",
    Weekly: "weekly",
    Monthly: "monthly",
  }[value];
  return granularityKey ? getRegionAlertsDashboardText(language, granularityKey) : value;
}

function translateRegionAlertsShift(language, value) {
  const shiftKey = {
    "Morning Shift": "morningShift",
    "Swing Shift": "swingShift",
    "Night Shift": "nightShift",
  }[value];
  return shiftKey ? getRegionAlertsDashboardText(language, shiftKey) : value;
}

function translateRegionAlertsSeverity(language, value) {
  const severityKey = {
    High: "high",
    Medium: "medium",
    Low: "low",
    Critical: "critical",
  }[value];
  return severityKey ? getRegionAlertsDashboardText(language, severityKey) : value;
}

function localizeRegionAlertsDefinition(definition, language) {
  if (!definition) return definition;

  const extraFilterLabelKeys = {
    objectType: "detectedClass",
    alertType: "intrusionType",
    shift: "shift",
    severity: "severity",
    status: "status",
  };
  const columnLabelKeys = {
    id: "eventId",
    cameraId: "camera",
    zone: "zone",
    shift: "shift",
    objectType: "detectedClass",
    entryTime: "entryTime",
    exitTime: "exitTime",
    durationSec: "duration",
    alertType: "intrusionType",
    severity: "severity",
    status: "status",
    confidenceScore: "confidence",
  };

  return {
    ...definition,
    title: getRegionAlertsDashboardText(language, "title"),
    description: getRegionAlertsDashboardText(language, "description"),
    extraFilterDefs: definition.extraFilterDefs.map((item) => ({
      ...item,
      label: extraFilterLabelKeys[item.key]
        ? getRegionAlertsDashboardText(language, extraFilterLabelKeys[item.key])
        : item.label,
    })),
    metricDefs: definition.metricDefs.map((item) => {
      if (item.label === "Total Intrusions") {
        return { ...item, label: getRegionAlertsDashboardText(language, "totalIntrusions"), subtext: getRegionAlertsDashboardText(language, "totalIntrusionsSubtext") };
      }
      if (item.label === "High / Critical Alerts") {
        return { ...item, label: getRegionAlertsDashboardText(language, "highCriticalAlerts"), subtext: getRegionAlertsDashboardText(language, "highCriticalAlertsSubtext") };
      }
      if (item.label === "Most Affected Zone") {
        return {
          ...item,
          label: getRegionAlertsDashboardText(language, "mostAffectedZone"),
          compute: (items) => Object.entries(groupBy(items.filter(isRegionIncident), "zone")).sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? getRegionAlertsDashboardText(language, "noIncidents"),
          subtext: getRegionAlertsDashboardText(language, "mostAffectedZoneSubtext"),
        };
      }
      if (item.label === "Latest Alert") {
        return {
          ...item,
          label: getRegionAlertsDashboardText(language, "latestAlert"),
          format: (value) => formatLatestIncidentLabel(value, getRegionAlertsDashboardText(language, "noAlerts")),
          subtext: getRegionAlertsDashboardText(language, "latestAlertSubtext"),
        };
      }
      return item;
    }),
    columns: definition.columns.map((item) => (
      item.key === "exitTime"
        ? {
            ...item,
            label: getRegionAlertsDashboardText(language, columnLabelKeys[item.key]),
            render: (value) => (value ? formatDateTime(value) : getRegionAlertsDashboardText(language, "stillOpen")),
          }
        : {
            ...item,
            label: columnLabelKeys[item.key]
              ? getRegionAlertsDashboardText(language, columnLabelKeys[item.key])
              : item.label,
          }
    )),
  };
}

function sortByPreferredOrder(values, preferredOrder) {
  const ranking = new Map(preferredOrder.map((value, index) => [String(value), index]));
  return [...values].sort((left, right) => {
    const leftRank = ranking.has(String(left)) ? ranking.get(String(left)) : Number.MAX_SAFE_INTEGER;
    const rightRank = ranking.has(String(right)) ? ranking.get(String(right)) : Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return String(left).localeCompare(String(right));
  });
}

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

function normalizeRegionAlertType(rawAlertType, isVehicleObject) {
  const normalizedAlertType = String(rawAlertType || "").trim().toLowerCase();
  if (!normalizedAlertType || normalizedAlertType === "none") return "None";
  if (
    normalizedAlertType.includes("person or vehicle")
    || normalizedAlertType.includes("person_or_vehicle")
    || normalizedAlertType.includes("mixed")
  ) {
    return "Person or Vehicle Intrusion";
  }
  if (normalizedAlertType.includes("vehicle")) return "Vehicle Intrusion";
  if (normalizedAlertType.includes("person")) return "Person Intrusion";
  return isVehicleObject ? "Vehicle Intrusion" : "Person Intrusion";
}

function normalizeRegionAlertRow(row, index) {
  const entryTime = row.entryTime || row.entry_time;
  const durationSec = Number(row.durationSec ?? row.duration_sec ?? 0);
  const rawObjectType = String(
    row.detected_class ??
    row.detectedClass ??
    row.class_name ??
    row.className ??
    row.object_type ??
    row.objectType ??
    "person",
  ).trim().toLowerCase();
  const isVehicleObject = /(vehicle|car|truck|bus|van|forklift|bike|motorcycle|scooter)/i.test(rawObjectType);
  const rawAlertType = String(row.alertType || row.alert_type || "").trim();
  const alertType = normalizeRegionAlertType(rawAlertType, isVehicleObject);
  const explicitStatus = String(row.status || "").toLowerCase();
  const status =
    explicitStatus === "open" || explicitStatus === "active"
      ? "Open"
      : explicitStatus === "past" || explicitStatus === "resolved" || explicitStatus === "closed"
        ? "Past"
        : !row.exitTime && !row.exit_time
          ? "Open"
          : "Past";
  const exitTime =
    row.exitTime ||
    row.exit_time ||
    (status === "Open" ? "" : new Date(new Date(entryTime).getTime() + durationSec * 1000).toISOString());

  const normalized = {
    id: row.id || row.incident_id,
    timestamp: row.timestamp || entryTime,
    location: row.location || ["Warehouse A", "Warehouse B", "Warehouse C"][index % 3],
    cameraId: row.cameraId || row.camera_id,
    zone: row.zone,
    zoneType: row.zoneType || row.zone_type,
    shift: row.shift || getBusinessShift(row),
    objectType: rawObjectType || "person",
    trackedObjectId: row.trackedObjectId || row.tracked_object_id || `TRK-${String(7000 + index).padStart(4, "0")}`,
    entryTime,
    exitTime,
    durationSec,
    alertType,
    severity: row.severity,
    status,
    confidenceScore: row.confidenceScore ?? row.confidence_score ?? Number((0.84 + ((index % 7) * 0.018)).toFixed(2)),
    assignedTo: row.assignedTo ?? ["Ops Supervisor", "Security Desk", "Safety Lead", "Floor Manager"][index % 4],
    escalationNeeded: row.escalationNeeded ?? (row.severity === "High" || status === "Open" ? "Yes" : "No"),
    snapshotUrl: row.snapshotUrl ?? row.output_reference ?? `/dashboard/snapshots/region-alerts/${row.id || row.incident_id}`,
    inputReference: row.inputReference ?? row.input_reference ?? "",
    outputReference: row.outputReference ?? row.output_reference ?? "",
    isLatestDemoIncident: Boolean(row.isLatestDemoIncident ?? row.is_latest_demo_incident),
    isSyntheticDemo: Boolean(row.isSyntheticDemo ?? row.is_synthetic_demo),
    escalationPriority: 0,
  };

  return {
    ...normalized,
    escalationPriority: regionEscalationScore(normalized),
  };
}

function applyRegionAlertsDemoIntrusionVariety(rows) {
  let variantIndex = 0;

  return rows.map((row) => {
    if (!row.isSyntheticDemo && !row.isLatestDemoIncident) return row;

    const variant = REGION_ALERTS_DEMO_INTRUSION_VARIANTS[variantIndex];
    if (!variant) return row;

    variantIndex += 1;
    return {
      ...row,
      objectType: variant.objectType,
      alertType: variant.alertType,
    };
  });
}

function applyRegionChartFilters(rows, selections, granularity, excludeKeys = []) {
  return rows.filter((row) => {
    if (!excludeKeys.includes("timeBucket") && selections.timeBucket) {
      const rowBucket = bucketLabelForKey(bucketKeyForTimestamp(row.timestamp, granularity), granularity);
      if (rowBucket !== selections.timeBucket) return false;
    }
    if (!excludeKeys.includes("zone") && selections.zone && row.zone !== selections.zone) return false;
    if (!excludeKeys.includes("alertType") && selections.alertType && row.alertType !== selections.alertType) return false;
    if (!excludeKeys.includes("severity") && selections.severity && row.severity !== selections.severity) return false;
    return true;
  });
}

function applyFireChartFilters(rows, selections, excludeKeys = []) {
  return rows.filter((row) => {
    if (!excludeKeys.includes("alertType") && selections.alertType && row.alertType !== selections.alertType) return false;
    if (!excludeKeys.includes("zone") && selections.zone && row.zone !== selections.zone) return false;
    if (!excludeKeys.includes("cameraId") && selections.cameraId && row.cameraId !== selections.cameraId) return false;
    if (!excludeKeys.includes("severity") && selections.severity && row.severity !== selections.severity) return false;
    return true;
  });
}

function formatDurationLabel(seconds) {
  const total = Math.round(Number(seconds) || 0);
  if (total >= 60) return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
  return `${total}s`;
}

function normalizeIncidentStatus(value, fallback = "Past") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["open", "active", "needs_review", "violation", "crack_detected", "cracks_detected", "unsafe", "unsafe_detected"].includes(normalized)) {
    return "Open";
  }
  if (["closed", "resolved", "normal", "completed", "clear", "safe", "past"].includes(normalized)) {
    return "Past";
  }
  return fallback;
}

function normalizeChartFilterValue(value) {
  return String(value ?? "unknown").trim().toLowerCase();
}

function matchesDashboardChartFilter(row, chartFilter, granularity) {
  if (!chartFilter?.key) return true;
  const filterValue = normalizeChartFilterValue(chartFilter.value);
  if (chartFilter.key === "timeBucket") {
    return normalizeChartFilterValue(bucketKeyForTimestamp(row.timestamp, granularity)) === filterValue;
  }
  if (chartFilter.key === "severity") {
    return normalizeChartFilterValue(row.severity) === filterValue;
  }
  if (chartFilter.key === "zone") {
    return normalizeChartFilterValue(row.zone) === filterValue;
  }
  if (chartFilter.key === "location") {
    return normalizeChartFilterValue(row.location) === filterValue;
  }
  if (chartFilter.key === "cameraId") {
    return normalizeChartFilterValue(row.cameraId) === filterValue;
  }
  if (chartFilter.key === "eventType") {
    return normalizeChartFilterValue(row.eventType) === filterValue;
  }
  return true;
}

function applyDashboardChartFilter(rows, slug, chartFilter, granularity) {
  if ((slug !== "crack-detection" && slug !== "unsafe-behavior-detection") || !chartFilter?.key) {
    return rows;
  }
  return rows.filter((row) => matchesDashboardChartFilter(row, chartFilter, granularity));
}

function chartFilterLabel(chartFilter, granularity) {
  if (!chartFilter?.key) return "";
  const keyLabels = {
    severity: "Severity",
    zone: "Zone",
    location: "Location",
    eventType: "Unsafe Behavior",
    cameraId: "Camera ID",
    timeBucket: "Time",
  };
  if (chartFilter.key === "timeBucket") {
    return `${keyLabels.timeBucket} = ${bucketLabelForKey(chartFilter.value, granularity)}`;
  }
  return `${keyLabels[chartFilter.key] ?? chartFilter.key} = ${chartFilter.value}`;
}

function deriveCrackDefectType(row) {
  const metadata = row?.metadata ?? {};
  return String(
    row?.defectType
      ?? row?.defect_type
      ?? metadata.defect_type
      ?? metadata.defectType
      ?? metadata.class_name
      ?? "Crack",
  ).replace(/\b\w/g, (char) => char.toUpperCase());
}

function deriveCrackRecommendedAction(row) {
  const severity = String(row?.severity || "").toLowerCase();
  if (severity === "critical" || severity === "high") return "Inspection required";
  if (severity === "medium") return "Schedule maintenance review";
  if (severity === "low") return "Monitor";
  return "Review";
}

function deriveUnsafeRecommendedAction(row) {
  const eventType = String(row?.eventType || row?.event_type || "").toLowerCase().replaceAll(" ", "_");
  const severity = String(row?.severity || "").toLowerCase();
  if (eventType.includes("smoking") || eventType.includes("cigarette")) return "Supervisor review required";
  if (eventType.includes("phone")) return "Policy violation review";
  if (severity === "critical" || severity === "high") return "Immediate review";
  return "Review";
}

function formatLatestIncidentLabel(row, fallback = "No active alert") {
  if (!row) return fallback;
  const location = row.location || row.zone || row.cameraId || "Unknown";
  return `${location} • ${formatDateTime(row.timestamp)}`;
}

function evidenceLinkRender(value) {
  return value ? <a className="font-semibold text-brand-blue hover:underline" href={value} rel="noreferrer" target="_blank">Open Output</a> : "Not available";
}

function normalizePPERecord(row, index) {
  const processedAt = row.processed_at || row.processedAt || row.timestamp || new Date().toISOString();
  const deriveShift = (value) => {
    const hour = new Date(value).getHours();
    if (hour >= 6 && hour < 14) return "Morning";
    if (hour >= 14 && hour < 22) return "Evening";
    return "Night";
  };
  const toItemState = (value) => {
    if (value === true) return "OK";
    if (value === false) return "MISSING";
    const normalized = String(value ?? "UNKNOWN").toUpperCase();
    if (normalized === "TRUE") return "OK";
    if (normalized === "FALSE") return "MISSING";
    if (normalized === "OK" || normalized === "MISSING" || normalized === "UNKNOWN") return normalized;
    return "UNKNOWN";
  };

  const helmet = row.helmet ? String(row.helmet).toUpperCase() : toItemState(row.helmet_worn);
  const vest = row.vest ? String(row.vest).toUpperCase() : toItemState(row.vest_worn);
  const shoes = row.shoes ? String(row.shoes).toUpperCase() : toItemState(row.shoes_worn);
  const firstSeenSec = Number(row.first_seen_sec ?? row.firstSeenSec ?? 0);
  const lastSeenSec = Number(row.last_seen_sec ?? row.lastSeenSec ?? firstSeenSec);
  const durationSec = Number(row.duration_sec ?? row.durationSec ?? Math.max(0, lastSeenSec - firstSeenSec));
  const missingItems = Array.isArray(row.missing_items)
    ? row.missing_items
    : [
        helmet === "MISSING" ? "Helmet" : null,
        vest === "MISSING" ? "Vest" : null,
        shoes === "MISSING" ? "Shoes" : null,
      ].filter(Boolean);
  const complianceStatus = String(row.compliance_status ?? row.complianceStatus ?? (missingItems.length > 0 ? "FAIL" : "PASS")).toUpperCase() === "FAIL" ? "FAIL" : "PASS";

  return {
    inputId: row.input_id ?? row.inputId ?? "",
    cameraId: row.camera_id ?? row.cameraId ?? `CAM_${String((index % 15) + 1).padStart(3, "0")}`,
    location: row.location ?? "Warehouse A",
    zone: row.zone ?? "Storage Bay",
    shift: row.shift ?? deriveShift(processedAt),
    trackedWorkerId: row.tracked_worker_id ?? row.trackedWorkerId ?? row.person_id ?? row.personId ?? `TID-${index + 1}`,
    helmet,
    vest,
    shoes,
    complianceStatus,
    missingItems,
    framesObserved: Number(row.frames_observed ?? row.framesObserved ?? 0),
    firstSeenSec,
    lastSeenSec,
    durationSec,
    outputVideoUrl: row.output_video_url ?? row.outputVideoUrl ?? "",
    processedAt,
    timestamp: processedAt,
    confidenceScore: Number(row.confidence_score ?? row.confidenceScore ?? 0.88),
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
  const timestampWeight = new Date(timestamp).getTime() / 1_000_000_000;

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
    totalFireEvents: Number(row.totalFireEvents ?? row.total_fire_events ?? 0),
    totalSmokeEvents: Number(row.totalSmokeEvents ?? row.total_smoke_events ?? 0),
    escalationNeeded,
    outputVideo: row.outputVideo || row.output_video || row.output_video_url || row.minio_video_link || "",
    isLatestDemoAlert: Boolean(row.isLatestDemoAlert ?? row.is_latest_demo_alert),
    firePriority: (severity === "High" ? 1000 : severity === "Medium" ? 400 : severity === "Low" ? 150 : 0) + (alertType === "Fire + Smoke" ? 220 : alertType === "Fire Only" ? 160 : alertType === "Smoke Only" ? 90 : 0) + timestampWeight,
  };
}

function normalizeSpeedRow(row, index) {
  const metadata =
    row.metadata_json && typeof row.metadata_json === "string"
      ? (() => {
          try {
            return JSON.parse(row.metadata_json);
          } catch {
            return {};
          }
        })()
      : row.metadata_json && typeof row.metadata_json === "object"
        ? row.metadata_json
        : {};
  const timestamp = row.timestamp || row.simulated_timestamp || new Date().toISOString();
  const speedLimit = Number(row.speed_limit ?? row.speed_limit_kmh ?? row.speedLimitKmh ?? row.zone_speed_limit_kmh ?? row.zoneSpeedLimitKmh ?? 0);
  const detectedSpeed = Number(row.estimated_speed ?? row.detected_speed_kmh ?? row.detectedSpeedKmh ?? 0);
  const excessSpeed = Number(row.excess_speed_kmh ?? row.excessSpeed ?? Math.max(detectedSpeed - speedLimit, 0));
  const rawOverspeeding = row.is_overspeeding ?? row.isOverspeeding;
  const isOverspeeding =
    rawOverspeeding === true || rawOverspeeding === 1 || String(rawOverspeeding).toLowerCase() === "true" || String(rawOverspeeding).toLowerCase() === "yes"
      ? "Yes"
      : rawOverspeeding === false || rawOverspeeding === 0 || String(rawOverspeeding).toLowerCase() === "false" || String(rawOverspeeding).toLowerCase() === "no"
        ? "No"
        : excessSpeed > 0
          ? "Yes"
          : "No";
  const severity =
    excessSpeed > 7
      ? "High"
      : excessSpeed > 3
        ? "Medium"
        : excessSpeed > 0
          ? "Low"
          : "None";
  const crossedValue = row.crossed_line ?? row.crossedLine ?? metadata.crossed_line;
  const crossedLine =
    crossedValue === true || crossedValue === 1 || String(crossedValue).toLowerCase() === "true" || String(crossedValue).toLowerCase() === "yes";

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
    minioVideoLink: row.minio_video_link ?? row.output_video_url ?? "",
    loadTimeSec: Number(row.load_time_sec ?? row.loadTimeSec ?? 0),
    objectId: row.object_id ?? row.objectId ?? `TRK-${index + 1}`,
    objectType: String(row.object_type ?? row.objectType ?? "car"),
    detectedSpeedKmh: detectedSpeed,
    speedLimitKmh: speedLimit,
    isOverspeeding,
    excessSpeedKmh: excessSpeed,
    confidenceScore: Number(row.confidence_score ?? row.confidence ?? row.confidenceScore ?? 0),
    violationType: row.violation_type ?? row.violationType ?? (isOverspeeding === "Yes" ? "overspeed" : ""),
    status: row.status ?? (isOverspeeding === "Yes" ? "Violation" : "Normal"),
    crossedLine: crossedLine ? "Yes" : "No",
    direction: String(row.direction ?? row.directionLabel ?? metadata.direction ?? "unknown").replaceAll("_", " "),
    classCountForType: Number(row.class_count_for_type ?? row.classCountForType ?? metadata.class_count_for_type ?? 0),
    severity,
    speedPriority: (severity === "High" ? 1000 : severity === "Medium" ? 500 : severity === "Low" ? 200 : 0) + excessSpeed * 10 + detectedSpeed,
  };
}

function normalizeCrackRow(row, index) {
  const metadata =
    row.metadata_json && typeof row.metadata_json === "string"
      ? (() => {
          try {
            return JSON.parse(row.metadata_json);
          } catch {
            return {};
          }
        })()
      : row.metadata_json && typeof row.metadata_json === "object"
        ? row.metadata_json
        : {};
  const timestamp = row.timestamp || row.simulated_timestamp || new Date().toISOString();
  const crackDetectedValue = row.crack_detected ?? row.crackDetected;
  const crackDetected =
    crackDetectedValue === true || crackDetectedValue === 1 || String(crackDetectedValue).toLowerCase() === "true" || String(crackDetectedValue).toLowerCase() === "yes";
  const crackCount = Number(row.crack_count ?? row.crackCount ?? 0);
  const maxConfidence = Number(row.max_confidence ?? row.maxConfidence ?? 0);
  const severity = String(row.severity ?? metadata.severity ?? (maxConfidence >= 0.75 ? "high" : maxConfidence >= 0.5 ? "medium" : maxConfidence > 0 ? "low" : "none"));
  const normalizedSeverity = severity.replace(/\b\w/g, (char) => char.toUpperCase());

  return {
    id: row.output_id ?? row.id ?? `CR-${index + 1}`,
    inputId: row.input_id ?? row.inputId ?? "",
    outputId: row.output_id ?? row.outputId ?? "",
    timestamp,
    simulatedTimestamp: row.simulated_timestamp ?? timestamp,
    cameraId: row.camera_id ?? row.cameraId ?? `CAM_${String((index % 15) + 1).padStart(3, "0")}`,
    location: row.location ?? "Construction Site A",
    zone: row.zone ?? "Inspection Zone",
    filename: row.filename ?? "",
    crackDetected: crackDetected ? "Yes" : "No",
    crackCount,
    framesAnalyzed: Number(row.frames_analyzed ?? row.framesAnalyzed ?? 0),
    framesWithCracks: Number(row.frames_with_cracks ?? row.framesWithCracks ?? 0),
    crackRatePct: Number(row.crack_rate_pct ?? row.crackRatePct ?? 0),
    maxConfidence,
    avgConfidence: Number(row.avg_confidence ?? row.avgConfidence ?? 0),
    severity: normalizedSeverity,
    status: normalizeIncidentStatus(row.status ?? (crackDetected ? "cracks_detected" : "clear"), crackDetected ? "Open" : "Past"),
    outputVideoUrl: row.output_video_url ?? row.outputVideoUrl ?? "",
    outputMediaUrl: row.output_media_url ?? row.outputMediaUrl ?? row.output_video_url ?? row.outputVideoUrl ?? "",
    metadata,
    defectType: deriveCrackDefectType({ metadata }),
    recommendedAction: deriveCrackRecommendedAction({ severity: normalizedSeverity }),
    evidence: row.output_media_url ?? row.outputMediaUrl ?? row.output_video_url ?? row.outputVideoUrl ?? "",
    crackPriority: (normalizedSeverity === "Critical" ? 1300 : normalizedSeverity === "High" ? 1000 : normalizedSeverity === "Medium" ? 450 : normalizedSeverity === "Low" ? 180 : 0) + crackCount * 10 + maxConfidence,
  };
}

function normalizeUnsafeBehaviorRow(row, index) {
  const metadata =
    row.metadata_json && typeof row.metadata_json === "string"
      ? (() => {
          try {
            return JSON.parse(row.metadata_json);
          } catch {
            return {};
          }
        })()
      : row.metadata_json && typeof row.metadata_json === "object"
        ? row.metadata_json
        : {};
  const timestamp = row.timestamp || row.simulated_timestamp || new Date().toISOString();
  const severity = String(row.severity ?? metadata.severity ?? "low").replace(/\b\w/g, (char) => char.toUpperCase());
  const eventType = String(row.event_type ?? row.eventType ?? "unsafe").replaceAll("_", " ");
  const confidence = Number(row.confidence ?? row.confidence_score ?? row.confidenceScore ?? 0);

  return {
    id: row.output_id ?? row.id ?? `UB-${index + 1}`,
    inputId: row.input_id ?? row.inputId ?? "",
    outputId: row.output_id ?? row.outputId ?? "",
    timestamp,
    simulatedTimestamp: row.simulated_timestamp ?? timestamp,
    cameraId: row.camera_id ?? row.cameraId ?? `CAM_${String((index % 15) + 1).padStart(3, "0")}`,
    location: row.location ?? "Workplace A",
    zone: row.zone ?? "Inspection Zone",
    eventType: eventType.replace(/\b\w/g, (char) => char.toUpperCase()),
    confidence,
    severity,
    source: String(row.source ?? metadata.source ?? ""),
    frameNumber: Number(row.frame_number ?? row.frameNumber ?? 0),
    timestampSec: Number(row.timestamp_sec ?? row.timestampSec ?? 0),
    status: normalizeIncidentStatus(row.status ?? "unsafe", "Open"),
    outputVideoUrl: row.output_video_url ?? row.outputVideoUrl ?? "",
    outputMediaUrl: row.output_media_url ?? row.outputMediaUrl ?? row.output_video_url ?? row.outputVideoUrl ?? "",
    totalUnsafeEvents: Number(row.total_unsafe_events ?? row.totalUnsafeEvents ?? 0),
    smokingEvents: Number(row.smoking_events ?? row.smokingEvents ?? 0),
    phoneUsageEvents: Number(row.phone_usage_events ?? row.phoneUsageEvents ?? 0),
    framesAnalyzed: Number(row.frames_analyzed ?? row.framesAnalyzed ?? 0),
    framesWithUnsafeBehavior: Number(row.frames_with_unsafe_behavior ?? row.framesWithUnsafeBehavior ?? 0),
    unsafeRatePct: Number(row.unsafe_rate_pct ?? row.unsafeRatePct ?? 0),
    maxConfidence: Number(row.max_confidence ?? row.maxConfidence ?? confidence),
    avgConfidence: Number(row.avg_confidence ?? row.avgConfidence ?? confidence),
    metadata,
    recommendedAction: deriveUnsafeRecommendedAction({
      eventType: eventType.replace(/\b\w/g, (char) => char.toUpperCase()),
      severity,
    }),
    evidence: {
      url: row.output_media_url ?? row.outputMediaUrl ?? row.output_video_url ?? row.outputVideoUrl ?? "",
      hasBoundingEvidence:
        (Array.isArray(row.bbox) && row.bbox.length > 0)
        || (Array.isArray(row.associated_person_box) && row.associated_person_box.length > 0)
        || (Array.isArray(row.associatedPersonBox) && row.associatedPersonBox.length > 0),
    },
    unsafePriority: (severity === "Critical" ? 1300 : severity === "High" ? 1000 : severity === "Medium" ? 450 : severity === "Low" ? 180 : 0) + confidence * 100 + (row.frame_number ?? 0),
  };
}

function countUniqueSpeedObjects(items) {
  return new Set(items.map((item) => `${item.inputId || item.input_id || "row"}:${item.objectId || item.object_id || item.id}`)).size;
}

const icons = {
  "crack-detection": AlertTriangle,
  "unsafe-behavior-detection": ShieldAlert,
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
  if ((slug === "region-alerts" || slug === "fire-detection" || slug === "ppe-detection" || slug === "speed-estimation" || slug === "crack-detection" || slug === "unsafe-behavior-detection") && rows.length) {
    const latest = [...rows]
      .sort((a, b) => new Date(a.timestamp || a.entry_time || a.entryTime) - new Date(b.timestamp || b.entry_time || b.entryTime))
      .at(-1);
    const latestTimestamp = latest?.timestamp || latest?.entry_time || latest?.entryTime;
    if (latestTimestamp) {
      const to = new Date(latestTimestamp);
      const from = new Date(to);
      if (slug === "ppe-detection" || slug === "speed-estimation" || slug === "crack-detection" || slug === "unsafe-behavior-detection") {
        from.setDate(to.getDate() - 1);
      } else {
        from.setDate(to.getDate() - 6);
      }
      filters.from = from.toISOString().slice(0, 10);
      filters.to = to.toISOString().slice(0, 10);
    }
  }
  return filters;
}

function getInitialExtraFilters(slug, extraFilterDefs, rows = []) {
  const multiSelectKeys = getMultiSelectKeys(slug);
  const initial = {};
  for (const def of extraFilterDefs) {
    if (slug === "ppe-detection" && def.key === "shift" && rows.length) {
      const latest = [...rows]
        .sort((a, b) => new Date(a.processed_at || a.timestamp || 0) - new Date(b.processed_at || b.timestamp || 0))
        .at(-1);
      initial[def.key] = latest?.shift || "Evening";
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
  if (slug === "crack-detection") return { key: "crackPriority", direction: "desc" };
  if (slug === "unsafe-behavior-detection") return { key: "unsafePriority", direction: "desc" };
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
        const sanitizedValues = value.filter((item) => item !== undefined && item !== null && item !== "" && item !== "All");
        if (sanitizedValues.length === 0) continue;
        if (row[def.key] === undefined) continue;
        if (!sanitizedValues.some((val) => String(row[def.key]).includes(val))) return false;
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

function KpiGrid({ items, className = "" }) {
  return (
    <section className={`grid gap-4 md:grid-cols-2 xl:grid-cols-4 ${className}`}>
      {items.map((item) => (
        <Card key={item.label} className={item.cardClassName ?? ""}>
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

function CrossFilterSummary({ selections, onClear, onClearOne, copy }) {
  const t = copy?.t ?? ((key, ...args) => getRegionAlertsDashboardText("en", key, ...args));
  const translateAlertType = copy?.translateAlertType ?? ((value) => value);
  const translateSeverityValue = copy?.translateSeverity ?? ((value) => value);
  const labels = [
    selections.timeBucket ? { key: "timeBucket", label: t("timeChip", selections.timeBucket) } : null,
    selections.zone ? { key: "zone", label: t("zoneChip", selections.zone) } : null,
    selections.alertType ? { key: "alertType", label: t("violationChip", translateAlertType(selections.alertType)) } : null,
    selections.severity ? { key: "severity", label: t("severityChip", translateSeverityValue(selections.severity)) } : null,
  ].filter(Boolean);

  if (!labels.length) return null;

  return (
    <Card className="border-brand-red/20 bg-brand-red-tint/30">
      <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-blue">{t("crossFilteringActive")}</p>
          <p className="text-xs text-muted">{t("crossFilteringDescription")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {labels.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onClearOne(item.key)}
              className="rounded-full border border-brand-blue bg-white px-3 py-1.5 text-xs font-semibold text-brand-blue transition hover:bg-brand-blue-tint"
            >
              {item.label} <span aria-hidden="true">×</span>
            </button>
          ))}
          <Button variant="outline" className="border-brand-red text-brand-red hover:bg-brand-red-tint" onClick={onClear}>
            {t("clearSelections")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RegionAlertsMultiSelectField({
  label,
  options,
  selectedValues,
  onChange,
  allLabel,
  selectAllLabel,
  clearAllLabel,
}) {
  const normalizedSelectedValues = Array.isArray(selectedValues) ? selectedValues.filter(Boolean) : [];
  const selectedLabels = options
    .filter((option) => normalizedSelectedValues.includes(option.value))
    .map((option) => option.label);
  const summaryLabel = normalizedSelectedValues.length === 0
    ? allLabel
    : normalizedSelectedValues.length === 1
      ? selectedLabels[0]
      : `${selectedLabels[0]} +${normalizedSelectedValues.length - 1}`;

  return (
    <div className="relative">
      <span className="mb-2 block text-sm font-medium text-ink">{label}</span>
      <details className="relative">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-brand-blue bg-white px-3 py-2 text-sm text-ink outline-none transition marker:content-none hover:border-brand-red">
          <span className="truncate">{summaryLabel}</span>
          <span className="ml-3 shrink-0 text-xs text-muted">▾</span>
        </summary>
        <div className="absolute left-0 right-0 z-20 mt-2 min-w-[15rem] rounded-xl border border-brand-blue/15 bg-white p-3 shadow-card">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-xs font-semibold text-brand-blue transition hover:text-brand-red"
              onClick={() => onChange(options.map((option) => option.value))}
            >
              {selectAllLabel}
            </button>
            <button
              type="button"
              className="text-xs font-semibold text-brand-red transition hover:text-brand-blue"
              onClick={() => onChange([])}
            >
              {clearAllLabel}
            </button>
          </div>
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {options.map((option) => {
              const checked = normalizedSelectedValues.includes(option.value);
              return (
                <label key={option.value} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-ink hover:bg-brand-blue-tint/30">
                  <input
                    checked={checked}
                    className="h-4 w-4 rounded border-brand-blue text-brand-red focus:ring-brand-red"
                    type="checkbox"
                    onChange={() => {
                      onChange(
                        checked
                          ? normalizedSelectedValues.filter((value) => value !== option.value)
                          : [...normalizedSelectedValues, option.value],
                      );
                    }}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      </details>
    </div>
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

function DonutChartCard({ title, description, data, showSlicePercent = false, onSliceClick, activeLabel }) {
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
                    <Cell
                      key={entry.label}
                      fill={entry.color ?? chartPalette[index % chartPalette.length]}
                      fillOpacity={activeLabel && activeLabel !== entry.label ? 0.28 : 1}
                      stroke={activeLabel === entry.label ? "#27235C" : "transparent"}
                      strokeWidth={activeLabel === entry.label ? 2 : 0}
                      onClick={() => onSliceClick?.(entry.label)}
                      style={onSliceClick ? { cursor: "pointer" } : undefined}
                    />
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
                <button
                  key={item.label}
                  type="button"
                  onClick={() => onSliceClick?.(item.label)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2 text-sm text-left transition ${activeLabel === item.label ? "border-brand-red shadow-card" : "border-borderSoft hover:border-brand-blue/40"}`}
                >
                  <span className="flex items-center gap-2 text-ink">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color ?? chartPalette[index % chartPalette.length] }} />
                    {item.label}
                  </span>
                  <span className="font-semibold text-brand-blue">
                    {item.value} ({pct}%)
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BarChartCard({
  title,
  description,
  data,
  bars,
  xAxisLabel,
  yAxisLabel,
  layout = "vertical",
  stacked = false,
  cellFillForBar,
  showLegend = true,
  margin,
  totalLabelKey,
  onBarClick,
  activeLabel,
  emptyStateLabel,
  className = "",
  contentClassName = "h-80",
}) {
  const isHorizontal = layout === "horizontal";
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className={contentClassName}>
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center text-sm text-slate-500">
            {emptyStateLabel || "No data available for the current filters."}
          </div>
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout={isHorizontal ? "vertical" : "horizontal"} margin={margin ?? (isHorizontal ? { left: 16, right: 24 } : { bottom: 8 })}>
            <CartesianGrid stroke="#E2E2EC" vertical={!isHorizontal} horizontal={isHorizontal} />
            <XAxis type={isHorizontal ? "number" : "category"} dataKey={isHorizontal ? undefined : "label"} allowDecimals={false} stroke="#6B6B8A" tick={{ fontSize: 11 }} label={{ value: xAxisLabel, position: "insideBottom", offset: isHorizontal ? 0 : -4 }} />
            <YAxis type={isHorizontal ? "category" : "number"} dataKey={isHorizontal ? "label" : undefined} allowDecimals={false} stroke="#6B6B8A" tick={{ fontSize: 11 }} width={isHorizontal ? 200 : undefined} label={{ value: yAxisLabel, angle: -90, position: "insideLeft" }} />
            <Tooltip formatter={chartTooltip} />
            {showLegend ? <Legend /> : null}
            {bars.map((bar) => (
              <Bar
                key={bar.dataKey}
                dataKey={bar.dataKey}
                stackId={stacked ? "stack" : undefined}
                fill={bar.color}
                radius={[6, 6, 0, 0]}
                onClick={(payload) => onBarClick?.(payload, bar.dataKey)}
              >
                {(cellFillForBar === bar.dataKey || onBarClick || activeLabel) &&
                  data.map((entry, index) => (
                    <Cell
                      key={`${bar.dataKey}-${index}`}
                      fill={entry.barFill ?? entry.color ?? bar.color}
                      fillOpacity={activeLabel && entry.label !== activeLabel ? 0.28 : 1}
                      stroke={activeLabel === entry.label ? "#27235C" : "transparent"}
                      strokeWidth={activeLabel === entry.label ? 1.5 : 0}
                      style={onBarClick ? { cursor: "pointer" } : undefined}
                    />
                  ))}
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
        )}
      </CardContent>
    </Card>
  );
}

function LineChartCard({ title, description, data, lines, xAxisLabel, yAxisLabel, referenceLines = [], onPointClick, activeLabel }) {
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
                dot={
                  line.dot
                    ?? ((props) => {
                      const { cx, cy, payload } = props;
                      const isActive = activeLabel && payload?.bucketKey === activeLabel;
                      const isDimmed = activeLabel && payload?.bucketKey !== activeLabel;
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isActive ? 5 : 4}
                          fill={line.color}
                          fillOpacity={isDimmed ? 0.3 : 1}
                          stroke={isActive ? "#27235C" : "#fff"}
                          strokeWidth={isActive ? 2 : 1}
                          onClick={() => onPointClick?.(payload)}
                          style={onPointClick ? { cursor: "pointer" } : undefined}
                        />
                      );
                    })
                }
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

function buildDashboardViews(slug, rows, granularity, interactive = {}) {
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
      const t = interactive.copy?.t ?? ((key, ...args) => getRegionAlertsDashboardText("en", key, ...args));
      const localizedGranularity = interactive.copy?.granularityLabel ?? granularity;
      const alertRows = rows.filter(isRegionIncident);
      const selections = interactive.selections ?? {};
      const trendRows = applyRegionChartFilters(alertRows, selections, granularity, ["timeBucket"]);
      const zoneRows = applyRegionChartFilters(alertRows, selections, granularity, ["zone"]);
      const typeRows = applyRegionChartFilters(alertRows, selections, granularity, ["alertType"]);
      const durationRows = applyRegionChartFilters(alertRows, selections, granularity);
      const cameraRows = applyRegionChartFilters(alertRows, selections, granularity);

      const byZoneGroups = groupBy(zoneRows, "zone");
      const byZoneCounts = Object.entries(byZoneGroups).map(([label, items]) => ({
        label,
        High: items.filter((row) => row.severity === "High").length,
        Medium: items.filter((row) => row.severity === "Medium").length,
        Low: items.filter((row) => row.severity === "Low").length,
        total: items.length,
      })).sort((a, b) => b.total - a.total);
      const trendData = groupRowsByGranularity(trendRows, granularity)
        .sort((a, b) => (granularity === "Weekly" ? String(a.bucketKey).localeCompare(String(b.bucketKey)) : new Date(a.bucketKey) - new Date(b.bucketKey)))
        .map(({ label, items }) => ({
          label,
          High: items.filter((item) => item.severity === "High").length,
          Medium: items.filter((item) => item.severity === "Medium").length,
          Low: items.filter((item) => item.severity === "Low").length,
        }));
      const alertTypeColors = {
        "Person Intrusion": "#27235C",
        "Unauthorized Entry": "#DE1B54",
        Loitering: "#F06A8F",
        "Hazard Zone Breach": "#A01240",
        "After-Hours Entry": "#6E67B1",
        "Repeated Intrusion": "#3D3880",
        "Crowding in Restricted Zone": "#C73867",
        "Zone Intrusion": "#27235C",
        "Hazardous Area Intrusion": "#A01240",
        "Prolonged Presence": "#9E96D9",
        "Vehicle Intrusion": "#DE1B54",
        "Person or Vehicle Intrusion": "#6E67B1",
      };
      const alertTypeCounts = Object.entries(groupBy(typeRows, "alertType"))
        .map(([label, items]) => ({ label, value: items.length }));
      const supportedIntrusionTypes = [
        { label: t("personIntrusion"), value: alertTypeCounts.find((item) => item.label === "Person Intrusion")?.value ?? 0 },
        { label: t("vehicleIntrusion"), value: alertTypeCounts.find((item) => item.label === "Vehicle Intrusion")?.value ?? 0 },
        { label: t("personOrVehicleIntrusion"), value: alertTypeCounts.find((item) => item.label === "Person or Vehicle Intrusion")?.value ?? 0 },
      ];
      const additionalIntrusionTypes = alertTypeCounts
        .filter((item) => !supportedIntrusionTypes.some((supported) => supported.label === item.label))
        .map((item) => ({ label: item.label, value: item.value }));
      const donut = [...supportedIntrusionTypes, ...additionalIntrusionTypes]
        .map((item, index) => ({
          ...item,
          color: alertTypeColors[item.label] ?? chartPalette[index % chartPalette.length],
        }))
        .sort((a, b) => b.value - a.value);
      const durationBuckets = [
        { label: t("briefCrossing"), value: durationRows.filter((row) => row.durationSec <= 60).length, color: "#27235C" },
        { label: t("suspiciousPresence"), value: durationRows.filter((row) => row.durationSec > 60 && row.durationSec <= 180).length, color: "rgba(222, 27, 84, 0.6)" },
        { label: t("highRiskIntrusion"), value: durationRows.filter((row) => row.durationSec > 180).length, color: "#DE1B54" },
      ];
      const cameraShift = Object.entries(groupBy(cameraRows, "cameraId"))
        .map(([label, items]) => ({
          label,
          "Morning Shift": items.filter((row) => getBusinessShift(row) === "Morning Shift").length,
          "Swing Shift": items.filter((row) => getBusinessShift(row) === "Swing Shift").length,
          "Night Shift": items.filter((row) => getBusinessShift(row) === "Night Shift").length,
          total: items.length,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
        .slice(0, 8);
      return [
        <BarChartCard
          key="1"
          title={t("incidentTrendBySeverity")}
          description={t("incidentTrendDesc")}
          data={trendData}
          bars={[{ dataKey: "High", color: SEVERITY_COLORS.High }, { dataKey: "Medium", color: SEVERITY_COLORS.Medium }, { dataKey: "Low", color: SEVERITY_COLORS.Low }]}
          xAxisLabel={localizedGranularity}
          yAxisLabel={t("incidentCount")}
          stacked
          onBarClick={(payload) => interactive.onSelectTimeBucket?.(payload?.label)}
          activeLabel={selections.timeBucket}
        />,
        <BarChartCard
          key="2"
          title={t("recentAlertsByZone")}
          description={t("recentAlertsByZoneDesc")}
          data={byZoneCounts}
          bars={[{ dataKey: "High", color: SEVERITY_COLORS.High, showLabels: true }, { dataKey: "Medium", color: SEVERITY_COLORS.Medium }, { dataKey: "Low", color: SEVERITY_COLORS.Low }]}
          xAxisLabel={t("incidentCount")}
          yAxisLabel={t("monitoredZone")}
          layout="horizontal"
          stacked
          totalLabelKey="total"
          onBarClick={(payload) => interactive.onSelectZone?.(payload?.label)}
          activeLabel={selections.zone}
        />,
        <DonutChartCard
          key="3"
          title={t("intrusionTypeBreakdown")}
          description={t("intrusionTypeBreakdownDesc")}
          data={donut}
          onSliceClick={interactive.onSelectAlertType}
          activeLabel={selections.alertType}
        />,
        <BarChartCard
          key="4"
          title={t("durationRiskInterpretation")}
          description={t("durationRiskDesc")}
          data={durationBuckets}
          bars={[{ dataKey: "value", color: "#27235C", showLabels: true }]}
          xAxisLabel={t("durationCategory")}
          yAxisLabel={t("incidentCount")}
          cellFillForBar="value"
          showLegend={false}
        />,
        <BarChartCard
          key="5"
          className="xl:col-span-2"
          contentClassName="h-[24rem]"
          title={t("triggeredCamerasByShift")}
          description={t("triggeredCamerasByShiftDesc")}
          data={cameraShift}
          bars={[{ dataKey: "Morning Shift", color: "#27235C" }, { dataKey: "Swing Shift", color: "rgba(222, 27, 84, 0.6)" }, { dataKey: "Night Shift", color: "#DE1B54" }]}
          xAxisLabel={t("camera")}
          yAxisLabel={t("incidentCount")}
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
      const classWiseVehicleCounts = aggregateBy(rows, "objectType", () => 1, sum)
        .map((item, index) => ({
          label: item.label,
          value: item.value,
          barFill: chartPalette[index % chartPalette.length],
        }))
        .sort((a, b) => b.value - a.value);
      const classWiseCrossedCounts = aggregateBy(rows.filter((row) => row.crossedLine === "Yes"), "objectType", () => 1, sum)
        .map((item, index) => ({
          label: item.label,
          value: item.value,
          barFill: [ "#DE1B54", "#27235C", "#F04E7A", "#3D3880", "#6B6B8A", "#C8C6E8" ][index % 6],
        }))
        .sort((a, b) => b.value - a.value);
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
          barFill: ["#DE1B54", "rgba(222, 27, 84, 0.8)", "rgba(222, 27, 84, 0.65)", "rgba(222, 27, 84, 0.5)", "#27235C"][index % 5],
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
          yAxisLabel="Detected Speed (km/h)"
        />,
        <BarChartCard key="3" title="Class-wise Vehicle Count" description="Unique vehicle analytics rows grouped by detected vehicle class for the selected filters." data={classWiseVehicleCounts} bars={[{ dataKey: "value", color: "#27235C" }]} xAxisLabel="Vehicle Class" yAxisLabel="Vehicle Count" cellFillForBar="value" showLegend={false} />,
        <BarChartCard key="4" title="Class-wise Crossed Count" description="Vehicles that crossed the counting line, grouped by vehicle class when crossed-line data is available." data={classWiseCrossedCounts} bars={[{ dataKey: "value", color: "#DE1B54" }]} xAxisLabel="Vehicle Class" yAxisLabel="Crossed Count" cellFillForBar="value" showLegend={false} />,
        <BarChartCard key="5" title="Violations by Object Type" description="Reveals which moving object categories contribute most to unsafe speed behavior." data={byType} bars={[{ dataKey: "value", color: "#DE1B54" }]} xAxisLabel="Object Type" yAxisLabel="Violation Count" cellFillForBar="value" showLegend={false} />,
        <DonutChartCard key="6" title="Violation vs Normal Distribution" description="Summarizes how much of total monitored movement is within safe limits versus violating limits." data={donut} showSlicePercent />,
        <DonutChartCard key="7" title="Violation Severity Distribution" description="Shows how far above the configured speed limit violating detections are, using rule-based severity bands." data={severityData} showSlicePercent />,
      ];
    }
    case "crack-detection": {
      const severityLevels = ["Critical", "High", "Medium", "Low", "None"];
      const severityData = severityLevels.map((label) => ({
        label,
        value: rows.filter((row) => row.severity === label).length,
        color: SEVERITY_COLORS[label] ?? chartPalette[0],
      }));
      const trend = groupRowsByGranularity(rows, granularity).map(({ label, bucketKey, items }) => ({
        label,
        bucketKey,
        inspectedItems: items.length,
        crackDetected: items.filter((item) => item.crackDetected === "Yes").length,
        crackCount: sum(items.map((item) => item.crackCount)),
      }));
      const byZone = Object.entries(groupBy(rows, "zone"))
        .map(([label, items]) => ({
          label,
          crackCount: sum(items.map((item) => item.crackCount)),
          crackRate: Number(((items.filter((item) => item.crackDetected === "Yes").length / Math.max(items.length, 1)) * 100).toFixed(1)),
          totalDetected: items.filter((item) => item.crackDetected === "Yes").length,
        }))
        .sort((a, b) => b.crackCount - a.crackCount);
      const byCamera = Object.entries(groupBy(rows, "cameraId"))
        .map(([label, items]) => ({
          label,
          crackCount: sum(items.map((item) => item.crackCount)),
          crackRate: Number(((items.filter((item) => item.crackDetected === "Yes").length / Math.max(items.length, 1)) * 100).toFixed(1)),
        }))
        .sort((a, b) => b.crackCount - a.crackCount)
        .slice(0, 8);

      return [
        <DonutChartCard
          key="1"
          title="Severity Distribution"
          description="Shows the split of critical, high, medium, and low-severity crack findings in the selected inspection set."
          data={severityData.filter((item) => item.value > 0)}
          showSlicePercent
          onSliceClick={(label) => interactive.onSelectChartFilter?.("severity", label)}
          activeLabel={interactive.chartFilter?.key === "severity" ? interactive.chartFilter.value : ""}
        />,
        <LineChartCard
          key="2"
          title="Crack Detection Trend"
          description="Tracks how many inspections reported cracks and how many total crack detections were produced over time."
          data={trend}
          lines={[
            { dataKey: "crackDetected", color: "#27235C" },
            { dataKey: "crackCount", color: "#DE1B54" },
          ]}
          xAxisLabel={granularity}
          yAxisLabel="Crack Events"
          onPointClick={(payload) => interactive.onSelectChartFilter?.("timeBucket", payload?.bucketKey)}
          activeLabel={interactive.chartFilter?.key === "timeBucket" ? interactive.chartFilter.value : ""}
        />,
        <BarChartCard
          key="3"
          title="Affected Zone Breakdown"
          description="Compares affected zones by total crack detections and highlights where crack activity is concentrating."
          data={byZone}
          bars={[{ dataKey: "crackCount", color: "#DE1B54", showLabels: true }]}
          xAxisLabel="Zone"
          yAxisLabel="Crack Detections"
          showLegend={false}
          onBarClick={(payload) => interactive.onSelectChartFilter?.("zone", payload?.label)}
          activeLabel={interactive.chartFilter?.key === "zone" ? interactive.chartFilter.value : ""}
        />,
        <BarChartCard
          key="4"
          title="Camera Crack Breakdown"
          description="Shows which cameras are contributing the most crack findings across the filtered inspection window."
          data={byCamera}
          bars={[{ dataKey: "crackCount", color: "#27235C", showLabels: true }]}
          xAxisLabel="Crack Detections"
          yAxisLabel="Camera ID"
          layout="horizontal"
          showLegend={false}
          onBarClick={(payload) => interactive.onSelectChartFilter?.("cameraId", payload?.label)}
          activeLabel={interactive.chartFilter?.key === "cameraId" ? interactive.chartFilter.value : ""}
        />,
      ];
    }
    case "unsafe-behavior-detection": {
      const eventTypePalette = {
        "Phone Usage": "#27235C",
        Smoking: "#DE1B54",
        Cigarette: "#F06A8F",
        "Unsafe Behavior": "#3D3880",
      };
      const eventTypeDistribution = ["Phone Usage", "Smoking", "Cigarette", "Unsafe Behavior"].map((label) => ({
        label,
        value: rows.filter((row) => row.eventType === label).length,
        color: eventTypePalette[label],
      }));
      const severityData = ["Critical", "High", "Medium", "Low"].map((label) => ({
        label,
        value: rows.filter((row) => row.severity === label).length,
        color: SEVERITY_COLORS[label] ?? chartPalette[0],
      }));
      const trend = groupRowsByGranularity(rows, granularity).map(({ label, bucketKey, items }) => ({
        label,
        bucketKey,
        smokingCount: items.filter((item) => item.eventType === "Smoking").length,
        phoneUsageCount: items.filter((item) => item.eventType === "Phone Usage").length,
        totalUnsafeCount: items.length,
      }));
      const byZone = Object.entries(groupBy(rows, "zone"))
        .map(([label, items]) => ({
          label,
          unsafeEventCount: items.length,
          smokingCount: items.filter((item) => item.eventType === "Smoking").length,
          phoneUsageCount: items.filter((item) => item.eventType === "Phone Usage").length,
        }))
        .sort((a, b) => b.unsafeEventCount - a.unsafeEventCount);
      const byCamera = Object.entries(groupBy(rows, "cameraId"))
        .map(([label, items]) => ({
          label,
          unsafeEventCount: items.length,
          smokingCount: items.filter((item) => item.eventType === "Smoking").length,
          phoneUsageCount: items.filter((item) => item.eventType === "Phone Usage").length,
        }))
        .sort((a, b) => b.unsafeEventCount - a.unsafeEventCount)
        .slice(0, 8);

      return [
        <DonutChartCard
          key="1"
          title="Event Type Distribution"
          description="Shows the split between phone usage, smoking, cigarette, and unsafe behavior incidents."
          data={eventTypeDistribution.filter((item) => item.value > 0)}
          showSlicePercent
          onSliceClick={(label) => interactive.onSelectChartFilter?.("eventType", label)}
          activeLabel={interactive.chartFilter?.key === "eventType" ? interactive.chartFilter.value : ""}
        />,
        <DonutChartCard
          key="2"
          title="Severity Distribution"
          description="Shows the critical, high, medium, and low-severity mix across unsafe behavior events."
          data={severityData.filter((item) => item.value > 0)}
          showSlicePercent
          onSliceClick={(label) => interactive.onSelectChartFilter?.("severity", label)}
          activeLabel={interactive.chartFilter?.key === "severity" ? interactive.chartFilter.value : ""}
        />,
        <LineChartCard
          key="3"
          title="Unsafe Event Trend"
          description="Tracks smoking, phone usage, and total unsafe events over time."
          data={trend}
          lines={[
            { dataKey: "smokingCount", color: "#DE1B54" },
            { dataKey: "phoneUsageCount", color: "#27235C" },
            { dataKey: "totalUnsafeCount", color: "#3D3880" },
          ]}
          xAxisLabel={granularity}
          yAxisLabel="Unsafe Event Count"
          onPointClick={(payload) => interactive.onSelectChartFilter?.("timeBucket", payload?.bucketKey)}
          activeLabel={interactive.chartFilter?.key === "timeBucket" ? interactive.chartFilter.value : ""}
        />,
        <BarChartCard
          key="4"
          title="Zone Unsafe Breakdown"
          description="Compares zones by unsafe event count and shows where risky behavior is concentrating."
          data={byZone}
          bars={[{ dataKey: "unsafeEventCount", color: "#27235C", showLabels: true }]}
          xAxisLabel="Zone"
          yAxisLabel="Unsafe Event Count"
          showLegend={false}
          onBarClick={(payload) => interactive.onSelectChartFilter?.("zone", payload?.label)}
          activeLabel={interactive.chartFilter?.key === "zone" ? interactive.chartFilter.value : ""}
        />,
        <BarChartCard
          key="5"
          title="Camera Unsafe Breakdown"
          description="Shows which cameras are contributing the most unsafe behavior detections."
          data={byCamera}
          bars={[{ dataKey: "unsafeEventCount", color: "#DE1B54", showLabels: true }]}
          xAxisLabel="Unsafe Event Count"
          yAxisLabel="Camera ID"
          layout="horizontal"
          showLegend={false}
          onBarClick={(payload) => interactive.onSelectChartFilter?.("cameraId", payload?.label)}
          activeLabel={interactive.chartFilter?.key === "cameraId" ? interactive.chartFilter.value : ""}
        />,
      ];
    }
    case "fire-detection": {
      const selections = interactive.fireSelections ?? {};
      const alertTypeRows = applyFireChartFilters(rows, selections, ["alertType", "zone", "cameraId"]);
      const zoneRows = applyFireChartFilters(rows, selections, ["zone", "cameraId"]);
      const cameraRows = applyFireChartFilters(rows, selections, ["cameraId"]);
      const severityRows = applyFireChartFilters(rows, selections, ["severity"]);

      const alertTypeDonut = ["Fire + Smoke", "Fire Only", "Smoke Only", "Clear / No Alert"].map((label) => ({
        label,
        value: alertTypeRows.filter((row) => row.alertType === label).length,
        color: label === "Fire + Smoke" ? "#DE1B54" : label === "Fire Only" ? "#F04E7A" : label === "Smoke Only" ? "#F0718F" : "#27235C",
      }));

      const zoneRisk = Object.entries(groupBy(zoneRows.filter((row) => row.alertType !== "Clear / No Alert"), "zone"))
        .map(([label, items]) => ({
          label,
          "Smoke Only": items.filter((item) => item.alertType === "Smoke Only").length,
          "Fire Only": items.filter((item) => item.alertType === "Fire Only").length,
          "Fire + Smoke": items.filter((item) => item.alertType === "Fire + Smoke").length,
          totalRisk: items.filter((item) => item.alertType !== "Clear / No Alert").length,
        }))
        .sort((a, b) => b.totalRisk - a.totalRisk);
      const cameraAlerts = Object.entries(groupBy(cameraRows.filter((row) => row.alertType !== "Clear / No Alert"), "cameraId"))
        .map(([label, items]) => ({ label, value: items.length }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
      const severityData = ["High", "Medium", "Low", "None"].map((label) => ({
        label,
        value: severityRows.filter((row) => row.severity === label).length,
        color: label === "High" ? "#DE1B54" : label === "Medium" ? "rgba(222, 27, 84, 0.6)" : label === "Low" ? "#F04E7A" : "#27235C",
      }));
      return [
        <DonutChartCard
          key="1"
          title="Alert Type Distribution"
          description="Shows whether current fire and smoke risk is driven by smoke warnings, confirmed fire signals, or both together."
          data={alertTypeDonut}
          showSlicePercent
          onSliceClick={interactive.onSelectFireAlertType}
          activeLabel={selections.alertType}
        />,
        <BarChartCard
          key="2"
          title="Highest-Risk Zones by Alert Volume"
          description="Shows which operational zones are generating the most fire and smoke alerts for the current selection."
          data={zoneRisk}
          bars={[{ dataKey: "Smoke Only", color: "#F0718F" }, { dataKey: "Fire Only", color: "#F04E7A" }, { dataKey: "Fire + Smoke", color: "#DE1B54", showLabels: true }]}
          xAxisLabel="Zone"
          yAxisLabel="Count"
          stacked
          totalLabelKey="totalRisk"
          onBarClick={(payload) => interactive.onSelectFireZone?.(payload?.label)}
          activeLabel={selections.zone}
        />,
        <BarChartCard
          key="3"
          title="Most Triggered Cameras"
          description="Shows which cameras are producing the most alerts for the currently selected alert type and zone."
          data={cameraAlerts}
          bars={[{ dataKey: "value", color: "#27235C", showLabels: true }]}
          xAxisLabel="Alert Count"
          yAxisLabel="Camera ID"
          layout="horizontal"
          showLegend={false}
          onBarClick={(payload) => interactive.onSelectFireCamera?.(payload?.label)}
          activeLabel={selections.cameraId}
        />,
        <DonutChartCard
          key="4"
          title="Severity Distribution"
          description="Shows how serious the currently filtered fire and smoke alerts are, helping teams prioritize the highest-risk cases first."
          data={severityData}
          showSlicePercent
          onSliceClick={interactive.onSelectFireSeverity}
          activeLabel={selections.severity}
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
      const failedRows = rows.filter((row) => row.complianceStatus === "FAIL");
      const byZone = Object.entries(groupBy(failedRows, "zone"))
        .map(([label, items]) => ({ label, value: items.length, barFill: items.length >= 6 ? "#DE1B54" : "#27235C" }))
        .sort((a, b) => b.value - a.value);
      const donut = [
        { label: "Missing Helmet", value: rows.filter((row) => row.helmet === "MISSING").length, color: "#DE1B54" },
        { label: "Missing Vest", value: rows.filter((row) => row.vest === "MISSING").length, color: "rgba(222, 27, 84, 0.6)" },
        { label: "Missing Shoes", value: rows.filter((row) => row.shoes === "MISSING").length, color: "#27235C" },
        { label: "Compliant", value: rows.filter((row) => row.complianceStatus === "PASS").length, color: "#27235C" },
      ];
      const shiftOrder = ["Morning", "Evening", "Night"];
      const byShift = shiftOrder.map((label) => ({
        label,
        value: failedRows.filter((row) => row.shift === label).length,
      }));
      const trend = groupRowsByGranularity(rows, granularity).map(({ label, items }) => ({
        label,
        complianceRate: Number(((items.filter((item) => item.complianceStatus === "PASS").length / Math.max(items.length, 1)) * 100).toFixed(1)),
      }));
      const byCamera = Object.entries(groupBy(failedRows, "cameraId"))
        .map(([label, items]) => ({ label, value: items.length }))
        .sort((a, b) => b.value - a.value);
      return [
        <BarChartCard key="1" title="Top Zones with PPE Violations" description="Highlights zones where workers most frequently violate PPE rules." data={byZone} bars={[{ dataKey: "value", color: "#27235C", showLabels: true }]} xAxisLabel="Zone" yAxisLabel="Violation Count" cellFillForBar="value" showLegend={false} />,
        <DonutChartCard key="2" title="PPE Violation Breakdown" description="Shows which PPE items are most frequently missing across workers." data={donut} showSlicePercent />,
        <BarChartCard key="3" title="Violations by Shift" description="Identifies shifts where worker safety compliance is weakest." data={byShift} bars={[{ dataKey: "value", color: "#27235C", showLabels: true }]} xAxisLabel="Shift" yAxisLabel="Violation Count" showLegend={false} />,
        <LineChartCard key="4" title="Compliance Rate Over Time" description="Tracks whether PPE compliance is improving or declining." data={trend} lines={[{ dataKey: "complianceRate", color: "#27235C" }]} xAxisLabel="Time" yAxisLabel="Compliance %" referenceLines={[{ value: 90, color: "#DE1B54", label: "90% Threshold" }]} />,
        <BarChartCard key="5" title="Violations by Camera" description="Shows which cameras are capturing the highest concentration of non-compliant workers." data={byCamera} bars={[{ dataKey: "value", color: "#27235C", showLabels: true }]} xAxisLabel="Camera ID" yAxisLabel="Violation Count" showLegend={false} />,
      ];
    }
    default:
      return [];
  }
}

const DASHBOARD_NAV = [
  ["crack-detection", "Crack Detection"],
  ["unsafe-behavior-detection", "Unsafe Behavior"],
  ["region-alerts", "Region Alerts Detection"],
  ["queue-management", "Queue Management"],
  ["speed-estimation", "Vehicle Analytics"],
  ["fire-detection", "Fire Detection"],
  ["object-tracking", "Object Tracking"],
  ["ppe-detection", "PPE Detection"],
];

function getMultiSelectKeys(slug) {
  const baseKeys = ["zone"];
  const dashboardSpecific = {
    "crack-detection": ["cameraId", "severity"],
    "unsafe-behavior-detection": ["cameraId", "eventType", "severity"],
    "region-alerts": ["cameraId", "severity", "alertType", "shift"],
    "queue-management": ["cameraId", "counterId"],
    "speed-estimation": ["cameraId", "objectType", "speedLimitKmh", "severity"],
    "fire-detection": ["cameraId", "severity", "alertType", "shift"],
    "class-wise-counting": ["cameraId", "className"],
    "object-tracking": ["cameraId", "objectType"],
    "ppe-detection": ["cameraId", "shift"],
  };
  return [...baseKeys, ...(dashboardSpecific[slug] || [])];
}

export function DashboardPage({ slug, title, description, rows, metricDefs, columns, extraFilterDefs }) {
  const [regionAlertsLanguage, setRegionAlertsLanguage] = useState(getStoredRegionAlertsLanguage);
  const isRegionAlertsDashboard = slug === "region-alerts";
  const tRegionAlerts = (key, ...args) => getRegionAlertsDashboardText(regionAlertsLanguage, key, ...args);
  const updateRegionAlertsLanguage = (nextLanguage) => {
    const resolvedLanguage = resolveRegionAlertsLanguage(nextLanguage);
    setRegionAlertsLanguage(resolvedLanguage);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(REGION_ALERTS_LANGUAGE_STORAGE_KEY, resolvedLanguage);
    }
  };
  const resolvedDefinition = useMemo(() => {
    const baseDefinition = metricDefs && columns && extraFilterDefs
      ? {
          title,
          description,
          metricDefs,
          columns,
          extraFilterDefs,
        }
      : buildDashboardDefinition(slug, rows, description);

    if (slug !== "region-alerts") return baseDefinition;
    return localizeRegionAlertsDefinition(baseDefinition, regionAlertsLanguage);
  }, [slug, rows, title, description, metricDefs, columns, extraFilterDefs, regionAlertsLanguage]);

  const resolvedTitle = resolvedDefinition.title;
  const resolvedDescription = resolvedDefinition.description;
  const resolvedMetricDefs = resolvedDefinition.metricDefs;
  const resolvedColumns = resolvedDefinition.columns;
  const resolvedExtraFilterDefs = slug === "region-alerts"
    ? resolvedDefinition.extraFilterDefs.filter((item) => item.key !== "status")
    : resolvedDefinition.extraFilterDefs;
  const Icon = icons[slug] ?? LayoutDashboard;
  const skeletonLoading = useLoadingSkeleton();
  const usesLiveDashboardData = slug === "ppe-detection" || slug === "fire-detection" || slug === "region-alerts" || slug === "speed-estimation" || slug === "crack-detection" || slug === "unsafe-behavior-detection";
  const initialRows = usesLiveDashboardData ? [] : rows;
  const [filters, setFilters] = useState(() => getGlobalFilters(initialRows, slug));
  const [extraFilters, setExtraFilters] = useState(() => getInitialExtraFilters(slug, resolvedExtraFilterDefs, initialRows));
  const [sortState, setSortState] = useState(() => initialSortStateFor(slug, resolvedColumns));
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [timeGranularity, setTimeGranularity] = useState("Hourly");
  const [regionChartSelections, setRegionChartSelections] = useState({ timeBucket: "", zone: "", alertType: "", severity: "" });
  const [regionDemoIncidentCount, setRegionDemoIncidentCount] = useState(0);
  const [fireChartSelections, setFireChartSelections] = useState({ alertType: "", zone: "", cameraId: "", severity: "" });
  const [fireDemoAlertCount, setFireDemoAlertCount] = useState(0);
  const [chartFilter, setChartFilter] = useState(null);
  const [liveFiltersInitialized, setLiveFiltersInitialized] = useState(!usesLiveDashboardData);

  useEffect(() => {
    if (!isRegionAlertsDashboard || typeof window === "undefined") return;
    window.localStorage.setItem(
      REGION_ALERTS_LANGUAGE_STORAGE_KEY,
      resolveRegionAlertsLanguage(regionAlertsLanguage),
    );
  }, [isRegionAlertsDashboard, regionAlertsLanguage]);

  const { data: fireApiData, loading: fireApiLoading, error: fireApiError } = useFireData({}, slug === "fire-detection");
  const { data: ppeApiData, loading: ppeApiLoading, error: ppeApiError } = usePPEData({}, slug === "ppe-detection");
  const { data: regionApiData, loading: regionApiLoading, error: regionApiError } = useRegionAlertsData({}, slug === "region-alerts");
  const { data: speedApiData, loading: speedApiLoading, error: speedApiError } = useSpeedEstimationData({}, slug === "speed-estimation");
  const { data: crackApiData, loading: crackApiLoading, error: crackApiError } = useCrackDetectionData({}, slug === "crack-detection");
  const { data: unsafeApiData, loading: unsafeApiLoading, error: unsafeApiError } = useUnsafeBehaviorData({}, slug === "unsafe-behavior-detection");

  const sourceRows = useMemo(() => {
    if (slug === "ppe-detection") return ppeApiData.map(normalizePPERecord);
    if (slug === "speed-estimation") return speedApiData.map(normalizeSpeedRow);
    if (slug === "crack-detection") return crackApiData.map(normalizeCrackRow);
    if (slug === "unsafe-behavior-detection") return unsafeApiData.map(normalizeUnsafeBehaviorRow);
    if (slug === "fire-detection") {
      return fireApiData.map(normalizeFireVideoSummary);
    }
    if (slug === "region-alerts") {
      return applyRegionAlertsDemoIntrusionVariety(regionApiData.map(normalizeRegionAlertRow));
    }
    return rows;
  }, [slug, fireApiData, ppeApiData, regionApiData, speedApiData, crackApiData, unsafeApiData, rows]);

  const effectiveSourceRows = useMemo(() => {
    if (slug !== "region-alerts" || usesLiveDashboardData) return sourceRows;
    const baselineRows = sourceRows.filter((row) => !row.isLatestDemoIncident);
    const demoRows = byTimestamp(sourceRows.filter((row) => row.isLatestDemoIncident));
    return [...baselineRows, ...demoRows.slice(0, regionDemoIncidentCount)];
  }, [slug, sourceRows, regionDemoIncidentCount, usesLiveDashboardData]);

  const effectiveFireRows = useMemo(() => {
    if (slug !== "fire-detection") return effectiveSourceRows;
    const baselineRows = effectiveSourceRows.filter((row) => !row.isLatestDemoAlert);
    const demoRows = byTimestamp(effectiveSourceRows.filter((row) => row.isLatestDemoAlert));
    return [...baselineRows, ...demoRows.slice(0, fireDemoAlertCount)];
  }, [slug, effectiveSourceRows, fireDemoAlertCount]);

  useEffect(() => {
    if (slug !== "region-alerts") return;
    setRegionChartSelections({ timeBucket: "", zone: "", alertType: "", severity: "" });
    setRegionDemoIncidentCount(0);
  }, [slug]);

  useEffect(() => {
    if (slug !== "fire-detection") return;
    setFireChartSelections({ alertType: "", zone: "", cameraId: "", severity: "" });
    setFireDemoAlertCount(0);
  }, [slug, rows]);

  useEffect(() => {
    setChartFilter(null);
  }, [slug]);

  useEffect(() => {
    setLiveFiltersInitialized(!usesLiveDashboardData);
  }, [slug, usesLiveDashboardData]);

  useEffect(() => {
    if (!usesLiveDashboardData || liveFiltersInitialized) return;
    const liveLoading = slug === "fire-detection" ? fireApiLoading : slug === "region-alerts" ? regionApiLoading : slug === "speed-estimation" ? speedApiLoading : slug === "crack-detection" ? crackApiLoading : slug === "unsafe-behavior-detection" ? unsafeApiLoading : ppeApiLoading;
    const liveRows = slug === "fire-detection" ? fireApiData : slug === "region-alerts" ? regionApiData : slug === "speed-estimation" ? speedApiData : slug === "crack-detection" ? crackApiData : slug === "unsafe-behavior-detection" ? unsafeApiData : ppeApiData;
    if (liveLoading || liveRows.length === 0) return;
    setFilters(getGlobalFilters(liveRows, slug));
    setExtraFilters(getInitialExtraFilters(slug, resolvedExtraFilterDefs, liveRows));
    setSortState(initialSortStateFor(slug, resolvedColumns));
    setLiveFiltersInitialized(true);
  }, [
    slug,
    usesLiveDashboardData,
    liveFiltersInitialized,
    fireApiLoading,
    ppeApiLoading,
    regionApiLoading,
    speedApiLoading,
    crackApiLoading,
    unsafeApiLoading,
    fireApiData,
    ppeApiData,
    regionApiData,
    speedApiData,
    crackApiData,
    unsafeApiData,
    resolvedExtraFilterDefs,
    resolvedColumns,
  ]);

  const dataLoading = usesLiveDashboardData ? (slug === "fire-detection" ? fireApiLoading : slug === "region-alerts" ? regionApiLoading : slug === "speed-estimation" ? speedApiLoading : slug === "crack-detection" ? crackApiLoading : slug === "unsafe-behavior-detection" ? unsafeApiLoading : ppeApiLoading) : false;
  const dataError = usesLiveDashboardData ? (slug === "fire-detection" ? fireApiError : slug === "region-alerts" ? regionApiError : slug === "speed-estimation" ? speedApiError : slug === "crack-detection" ? crackApiError : slug === "unsafe-behavior-detection" ? unsafeApiError : ppeApiError) : "";
  const loading = skeletonLoading || dataLoading;

  const filterDefs = [
    { key: "location", label: isRegionAlertsDashboard ? tRegionAlerts("location") : "Location" },
    { key: "zone", label: isRegionAlertsDashboard ? tRegionAlerts("zone") : "Zone" },
    { key: "cameraId", label: isRegionAlertsDashboard ? tRegionAlerts("camera") : "Camera ID" },
    ...resolvedExtraFilterDefs,
  ];

  const multiSelectKeys = getMultiSelectKeys(slug);

  const filteredRows = useMemo(() => {
    const merged = filterDefs.map((def) => ({ ...def }));
    const allFilters = { ...filters, ...extraFilters };
    return applyFilters(slug === "fire-detection" ? effectiveFireRows : effectiveSourceRows, allFilters, merged);
  }, [slug, effectiveFireRows, effectiveSourceRows, filters, extraFilters, resolvedExtraFilterDefs]);

  const chartFilteredRows = useMemo(() => {
    if (slug === "region-alerts") return applyRegionChartFilters(filteredRows, regionChartSelections, timeGranularity);
    return applyDashboardChartFilter(filteredRows, slug, chartFilter, timeGranularity);
  }, [slug, filteredRows, regionChartSelections, chartFilter, timeGranularity]);

  const fullyFilteredRows = useMemo(() => {
    if (slug === "region-alerts") return chartFilteredRows;
    if (slug === "fire-detection") return applyFireChartFilters(filteredRows, fireChartSelections);
    return chartFilteredRows;
  }, [slug, chartFilteredRows, filteredRows, fireChartSelections]);

  const clearChartFilter = () => setChartFilter(null);
  const toggleChartFilter = (key, value) => {
    if (!value) return;
    setChartFilter((prev) =>
      prev?.key === key && normalizeChartFilterValue(prev.value) === normalizeChartFilterValue(value)
        ? null
        : { key, value },
    );
  };
  const chartRows = useMemo(() => {
    if (slug === "region-alerts" || slug === "fire-detection") return filteredRows;
    return fullyFilteredRows;
  }, [slug, filteredRows, fullyFilteredRows]);
  const hasInteractiveChartFilter = (slug === "crack-detection" || slug === "unsafe-behavior-detection") && Boolean(chartFilter);
  const activeStatusFilter = (slug === "crack-detection" || slug === "unsafe-behavior-detection") && extraFilters.status && extraFilters.status !== "All"
    ? extraFilters.status
    : "";
  const sortedRows = useMemo(() => sortRows(fullyFilteredRows, sortState), [fullyFilteredRows, sortState]);
  const showLiveEmptyState = usesLiveDashboardData && !dataLoading && !dataError && sourceRows.length === 0;
  const showFilteredEmptyState = !loading && !dataError && !showLiveEmptyState && fullyFilteredRows.length === 0;
  const showChartFilterEmptyState = showFilteredEmptyState && hasInteractiveChartFilter;
  const kpis = useMemo(
    () =>
      resolvedMetricDefs.map((metric) => {
        const computed = metric.compute(fullyFilteredRows);
        return {
          label: metric.label,
          icon: metric.icon,
          value: metric.format(computed, fullyFilteredRows),
          valueClassName: metric.valueClassName?.(computed, fullyFilteredRows),
          subtext: typeof metric.subtext === "function" ? metric.subtext(computed, fullyFilteredRows) : metric.subtext,
          group: metric.group,
          cardClassName: metric.cardClassName?.(computed, fullyFilteredRows),
        };
      }),
    [fullyFilteredRows, resolvedMetricDefs],
  );
  const charts = useMemo(
    () =>
      buildDashboardViews(slug, chartRows, timeGranularity, {
        selections: regionChartSelections,
        copy: isRegionAlertsDashboard ? {
          t: tRegionAlerts,
          granularityLabel: translateRegionAlertsGranularity(regionAlertsLanguage, timeGranularity),
        } : null,
        onSelectTimeBucket: (label) =>
          setRegionChartSelections((prev) => ({ ...prev, timeBucket: prev.timeBucket === label ? "" : label || "" })),
        onSelectZone: (label) =>
          setRegionChartSelections((prev) => ({ ...prev, zone: prev.zone === label ? "" : label || "" })),
        onSelectAlertType: (label) =>
          setRegionChartSelections((prev) => ({ ...prev, alertType: prev.alertType === label ? "" : label || "" })),
        fireSelections: fireChartSelections,
        onSelectFireAlertType: (label) =>
          setFireChartSelections((prev) => ({ ...prev, alertType: prev.alertType === label ? "" : label || "", zone: "", cameraId: "" })),
        onSelectFireZone: (label) =>
          setFireChartSelections((prev) => ({ ...prev, zone: prev.zone === label ? "" : label || "", cameraId: "" })),
        onSelectFireCamera: (label) =>
          setFireChartSelections((prev) => ({ ...prev, cameraId: prev.cameraId === label ? "" : label || "" })),
        onSelectFireSeverity: (label) =>
          setFireChartSelections((prev) => ({ ...prev, severity: prev.severity === label ? "" : label || "" })),
        chartFilter,
        onSelectChartFilter: toggleChartFilter,
      }),
    [slug, chartRows, timeGranularity, regionChartSelections, fireChartSelections, chartFilter, isRegionAlertsDashboard, regionAlertsLanguage],
  );
  const lastUpdated = useMemo(() => {
    const latest = byTimestamp(slug === "fire-detection" ? effectiveFireRows : effectiveSourceRows).at(-1)?.timestamp;
    return latest ? formatDateTime(latest) : "N/A";
  }, [slug, effectiveSourceRows, effectiveFireRows]);
  const optionsFor = (key, includeAllOption = true) => {
    const values = uniqueOptions(slug === "fire-detection" ? effectiveFireRows : effectiveSourceRows, key);
    const optionValues = values.map((value) => ({ label: String(value), value: String(value) }));
    const allLabel = isRegionAlertsDashboard ? tRegionAlerts("all") : "All";

    if (slug === "ppe-detection" && key === "complianceStatus") {
      const statusOptions = [
        { label: "PASS", value: "PASS" },
        { label: "FAIL", value: "FAIL" },
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
    if ((slug === "region-alerts" || slug === "crack-detection" || slug === "unsafe-behavior-detection") && key === "status") {
      const statusOptions = [
        { label: slug === "region-alerts" ? tRegionAlerts("open") : "Open", value: "Open" },
        { label: slug === "region-alerts" ? tRegionAlerts("past") : "Past", value: "Past" },
      ];
      return includeAllOption ? [{ label: slug === "region-alerts" ? allLabel : "All", value: "All" }, ...statusOptions] : statusOptions;
    }
    if (slug === "region-alerts" && key === "shift") {
      const shiftOptions = sortByPreferredOrder(values, SHIFT_ORDER).map((value) => ({ label: translateRegionAlertsShift(regionAlertsLanguage, String(value)), value: String(value) }));
      return includeAllOption ? [{ label: allLabel, value: "All" }, ...shiftOptions] : shiftOptions;
    }
    if (slug === "region-alerts" && key === "severity") {
      const severityOptions = sortByPreferredOrder(values, SEVERITY_ORDER).map((value) => ({ label: translateRegionAlertsSeverity(regionAlertsLanguage, String(value)), value: String(value) }));
      return includeAllOption ? [{ label: allLabel, value: "All" }, ...severityOptions] : severityOptions;
    }
    if (slug === "region-alerts" && key === "alertType") {
      const intrusionTypeOptions = [
        { label: tRegionAlerts("personIntrusion"), value: "Person Intrusion" },
        { label: tRegionAlerts("vehicleIntrusion"), value: "Vehicle Intrusion" },
        { label: tRegionAlerts("personOrVehicleIntrusion"), value: "Person or Vehicle Intrusion" },
      ];
      return includeAllOption ? [{ label: tRegionAlerts("allIntrusionTypes"), value: "All" }, ...intrusionTypeOptions] : intrusionTypeOptions;
    }
    if (slug === "region-alerts" && key === "objectType") {
      const detectedClassOptions = [
        { label: "person", value: "person" },
        { label: "bicycle", value: "bicycle" },
        { label: "car", value: "car" },
        { label: "motorcycle", value: "motorcycle" },
        { label: "bus", value: "bus" },
        { label: "truck", value: "truck" },
        { label: "forklift", value: "forklift" },
      ];
      return includeAllOption ? [{ label: allLabel, value: "All" }, ...detectedClassOptions] : detectedClassOptions;
    }
    return includeAllOption ? [{ label: allLabel, value: "All" }, ...optionValues] : optionValues;
  };

  const handleRegionAlertsSelectAll = () => {
    if (slug !== "region-alerts") return;
    setFilters((prev) => ({
      ...prev,
      location: "All",
      zone: optionsFor("zone", false).map((option) => option.value),
      cameraId: optionsFor("cameraId", false).map((option) => option.value),
    }));
    setExtraFilters((prev) => ({
      ...prev,
      objectType: "All",
      alertType: optionsFor("alertType", false).map((option) => option.value),
      shift: optionsFor("shift", false).map((option) => option.value),
      severity: optionsFor("severity", false).map((option) => option.value),
    }));
  };

  const resetFilters = () => {
    const resetRows = usesLiveDashboardData ? sourceRows : rows;
    setFilters(getGlobalFilters(resetRows, slug));
    setExtraFilters(getInitialExtraFilters(slug, resolvedExtraFilterDefs, resetRows));
    setTimeGranularity("Hourly");
    setSortState(initialSortStateFor(slug, resolvedColumns));
    setRegionChartSelections({ timeBucket: "", zone: "", alertType: "", severity: "" });
    setFireChartSelections({ alertType: "", zone: "", cameraId: "", severity: "" });
    setChartFilter(null);
  };

  return (
    <div className={`flex min-h-screen text-ink ${slug === "speed-estimation" ? "bg-white" : "bg-surface"}`}>
      <aside className="hidden w-72 shrink-0 bg-brand-blue px-5 py-6 text-white lg:block">
        <Link
          href="/"
          className="mb-8 flex items-center gap-3 rounded-2xl border border-white/10 bg-brand-blue-light/30 px-3 py-3 transition hover:bg-brand-blue-light/40"
        >
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-white/20 bg-white p-1">
            <Image alt="Sutherland logo" className="object-contain" fill sizes="44px" src={sutherlandLogo} />
          </div>
          <div className="min-w-0 text-left">
            <div className="truncate text-[0.95rem] font-bold tracking-[0.16em] text-white">
              SUTHERLAND
            </div>
            <div className="mt-1 text-[0.68rem] tracking-[0.18em] text-brand-blue-tint">
              VISION HUB
            </div>
          </div>
        </Link>
        <nav className="space-y-2">
          {DASHBOARD_NAV.filter(([href]) => href !== "queue-management").map(([href, label]) => (
            <Link
              key={href}
              href={`/dashboard/${href}`}
              className={`block rounded-xl px-4 py-3 text-sm font-medium transition ${slug === href ? "bg-brand-red text-white" : "text-brand-blue-tint hover:bg-brand-blue-light"}`}
            >
              {isRegionAlertsDashboard && href === "region-alerts" ? resolvedTitle : label}
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
                <h1 className="text-2xl font-semibold">{resolvedTitle}</h1>
                {slug === "region-alerts" ? null : <p className="mt-1 text-sm text-brand-blue-tint">Last updated: {lastUpdated}</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {isRegionAlertsDashboard ? (
                <div className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-brand-blue-light/70 p-1" dir={regionAlertsLanguage === "ar" ? "rtl" : undefined}>
                  {[
                    { value: "en", label: "English" },
                    { value: "ar", label: "عربي" },
                  ].map((option) => {
                    const active = regionAlertsLanguage === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateRegionAlertsLanguage(option.value)}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                          active ? "bg-white text-brand-blue" : "text-brand-blue-tint hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <div className="rounded-xl bg-brand-blue-light px-4 py-2 text-sm font-medium">
                {slug === "region-alerts"
                  ? tRegionAlerts("lastUpdated", lastUpdated)
                  : `Visible results: ${fullyFilteredRows.length}`}
              </div>
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
                  {DASHBOARD_NAV.filter(([href]) => href !== "queue-management").map(([href, label]) => (
                    <Link
                      key={href}
                      href={`/dashboard/${href}`}
                      onClick={() => setMobileNavOpen(false)}
                      className={`rounded-xl px-4 py-3 text-sm font-medium ${slug === href ? "bg-brand-red text-white" : "text-brand-blue-tint hover:bg-brand-blue-light"}`}
                    >
                      {isRegionAlertsDashboard && href === "region-alerts" ? resolvedTitle : label}
                    </Link>
                  ))}
                </nav>
              </div>
            </div>
          ) : null}
        </header>

        <div className="space-y-6 px-4 py-6 md:px-8">
          {slug === "speed-estimation" ? (
            <Card className="border-brand-blue/10 bg-brand-blue-tint/20">
              <CardContent className="p-4 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">Vehicle Analytics note.</span> Speed values depend on camera calibration and scene geometry, while vehicle counts and crossed-line totals reflect tracked detections captured for this run.
              </CardContent>
            </Card>
          ) : null}
          {slug === "crack-detection" ? (
            <Card className="border-brand-blue/10 bg-brand-blue-tint/20">
              <CardContent className="p-4 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">Crack Detection note.</span> This dashboard reflects crack inspection results stored from Integration processing, including crack counts, severity, and confidence signals per inspected item.
              </CardContent>
            </Card>
          ) : null}
          {slug === "unsafe-behavior-detection" ? (
            <Card className="border-brand-blue/10 bg-brand-blue-tint/20">
              <CardContent className="p-4 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">Unsafe Behavior note.</span> This dashboard reflects smoking and mobile phone usage incidents stored from Integration processing, including severity, confidence, source, and per-event timing.
              </CardContent>
            </Card>
          ) : null}
          <Card className="border-brand-blue/10">
            <CardContent className="flex items-start gap-4 p-5">
              <div className="rounded-xl bg-brand-red-tint p-3 text-brand-red">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-blue">
                  {isRegionAlertsDashboard ? tRegionAlerts("useCaseOverview") : "Use Case Overview"}
                </p>
                  <p className="mt-2 text-sm leading-6 text-muted">{resolvedDescription}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-brand-blue-tint p-2 text-brand-blue">
                  <Filter className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle>{isRegionAlertsDashboard ? tRegionAlerts("filters") : "Filters"}</CardTitle>
                  <CardDescription>{slug === "region-alerts" ? tRegionAlerts("filtersDescription") : "All KPI cards, charts, and table rows update from the same filtered dataset."}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className={slug === "region-alerts" ? "space-y-4" : "space-y-4"}>
              {slug === "region-alerts" ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-ink">{tRegionAlerts("from")}</span>
                      <input className="rounded-lg border border-brand-blue bg-white px-3 py-2 text-sm outline-none focus:border-brand-red" type="date" value={filters.from} onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))} />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-ink">{tRegionAlerts("to")}</span>
                      <input className="rounded-lg border border-brand-blue bg-white px-3 py-2 text-sm outline-none focus:border-brand-red" type="date" value={filters.to} onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))} />
                    </label>
                    <SelectField
                      label={tRegionAlerts("timeGranularity")}
                      value={timeGranularity}
                      onChange={setTimeGranularity}
                      options={TIME_GRANULARITIES.map((label) => ({
                        label: translateRegionAlertsGranularity(regionAlertsLanguage, label),
                        value: label,
                      }))}
                    />
                    <SelectField
                      label={tRegionAlerts("location")}
                      value={filters.location}
                      onChange={(value) => setFilters((prev) => ({ ...prev, location: value }))}
                      options={optionsFor("location")}
                    />
                    <SelectField
                      label={tRegionAlerts("detectedClass")}
                      value={extraFilters.objectType}
                      onChange={(value) => setExtraFilters((prev) => ({ ...prev, objectType: value }))}
                      options={optionsFor("objectType")}
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <RegionAlertsMultiSelectField
                      label={tRegionAlerts("zone")}
                      options={optionsFor("zone", false)}
                      selectedValues={filters.zone}
                      onChange={(values) => setFilters((prev) => ({ ...prev, zone: values }))}
                      allLabel={tRegionAlerts("all")}
                      selectAllLabel={tRegionAlerts("selectAll")}
                      clearAllLabel={tRegionAlerts("clearAll")}
                    />
                    <RegionAlertsMultiSelectField
                      label={tRegionAlerts("camera")}
                      options={optionsFor("cameraId", false)}
                      selectedValues={filters.cameraId}
                      onChange={(values) => setFilters((prev) => ({ ...prev, cameraId: values }))}
                      allLabel={tRegionAlerts("all")}
                      selectAllLabel={tRegionAlerts("selectAll")}
                      clearAllLabel={tRegionAlerts("clearAll")}
                    />
                    <RegionAlertsMultiSelectField
                      label={tRegionAlerts("intrusionType")}
                      options={optionsFor("alertType", false)}
                      selectedValues={Array.isArray(extraFilters.alertType) ? extraFilters.alertType : []}
                      onChange={(values) => setExtraFilters((prev) => ({ ...prev, alertType: values }))}
                      allLabel={tRegionAlerts("allIntrusionTypes")}
                      selectAllLabel={tRegionAlerts("selectAll")}
                      clearAllLabel={tRegionAlerts("clearAll")}
                    />
                    <RegionAlertsMultiSelectField
                      label={tRegionAlerts("shift")}
                      options={optionsFor("shift", false)}
                      selectedValues={Array.isArray(extraFilters.shift) ? extraFilters.shift : []}
                      onChange={(values) => setExtraFilters((prev) => ({ ...prev, shift: values }))}
                      allLabel={tRegionAlerts("all")}
                      selectAllLabel={tRegionAlerts("selectAll")}
                      clearAllLabel={tRegionAlerts("clearAll")}
                    />
                    <RegionAlertsMultiSelectField
                      label={tRegionAlerts("severity")}
                      options={optionsFor("severity", false)}
                      selectedValues={Array.isArray(extraFilters.severity) ? extraFilters.severity : []}
                      onChange={(values) => setExtraFilters((prev) => ({ ...prev, severity: values }))}
                      allLabel={tRegionAlerts("all")}
                      selectAllLabel={tRegionAlerts("selectAll")}
                      clearAllLabel={tRegionAlerts("clearAll")}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-ink">From</span>
                      <input className="rounded-lg border border-brand-blue bg-white px-3 py-2 text-sm outline-none focus:border-brand-red" type="date" value={filters.from} onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))} />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-ink">To</span>
                      <input className="rounded-lg border border-brand-blue bg-white px-3 py-2 text-sm outline-none focus:border-brand-red" type="date" value={filters.to} onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))} />
                    </label>
                    <SelectField
                      label="Time Granularity"
                      value={timeGranularity}
                      onChange={setTimeGranularity}
                      options={TIME_GRANULARITIES.map((label) => ({ label, value: label }))}
                    />
                    <SelectField label="Location" value={filters.location} onChange={(value) => setFilters((prev) => ({ ...prev, location: value }))} options={optionsFor("location")} />
                  </div>
                  <div className="space-y-3">
                    <div>
                      <span className="block text-sm font-medium text-ink mb-2">Zone</span>
                      <PillCheckboxRow
                        options={optionsFor("zone", false)}
                        selectedValues={filters.zone}
                        onChange={(values) => setFilters((prev) => ({ ...prev, zone: values }))}
                      />
                    </div>
                    <div>
                      <span className="block text-sm font-medium text-ink mb-2">Camera</span>
                      <PillCheckboxRow
                        options={optionsFor("cameraId", false)}
                        selectedValues={filters.cameraId}
                        onChange={(values) => setFilters((prev) => ({ ...prev, cameraId: values }))}
                      />
                    </div>
                    {resolvedExtraFilterDefs.map((def) => {
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
                </>
              )}
              <div className="flex justify-end">
                <div className="flex flex-wrap justify-end gap-3">
                  {slug === "region-alerts" ? (
                    <>
                      <Button variant="outline" className="border-brand-blue text-brand-blue hover:bg-brand-blue-tint" onClick={handleRegionAlertsSelectAll}>
                        {tRegionAlerts("selectAll")}
                      </Button>
                      <Button variant="outline" className="border-brand-red text-brand-red hover:bg-brand-red-tint" onClick={resetFilters}>
                        {tRegionAlerts("clearAll")}
                      </Button>
                    </>
                  ) : null}
                  {slug === "fire-detection" && fireDemoAlertCount < sourceRows.filter((row) => row.isLatestDemoAlert).length ? (
                    <Button variant="outline" className="border-brand-red text-brand-red hover:bg-brand-red-tint" onClick={() => setFireDemoAlertCount((count) => count + 1)}>
                      Simulate Latest Alert
                    </Button>
                  ) : null}
                  {slug !== "region-alerts" ? (
                    <Button variant="default" className="gap-2 shadow-card" onClick={resetFilters}>
                      <TimerReset className="h-4 w-4" />
                      Reset Filters
                    </Button>
                  ) : null}
                </div>
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
                  Loading live dashboard data...
                </div>
              ) : null}
              {dataError ? (
                <div className="rounded-xl border border-brand-red/30 bg-brand-red-tint px-4 py-3 text-sm text-brand-red">
                  {dataError}
                </div>
              ) : null}
              {hasInteractiveChartFilter ? (
                <Card className="border-brand-red/20 bg-brand-red-tint/20">
                  <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-brand-blue">Chart-driven filter is active</p>
                      <div className="flex flex-wrap gap-2 text-xs font-semibold">
                        {activeStatusFilter ? (
                          <span className="rounded-full border border-brand-blue/20 bg-white px-3 py-1 text-brand-blue">
                            Status: {activeStatusFilter}
                          </span>
                        ) : null}
                        <span className="rounded-full border border-brand-red/30 bg-white px-3 py-1 text-brand-red">
                          Filtered by: {chartFilterLabel(chartFilter, timeGranularity)}
                        </span>
                      </div>
                    </div>
                    <Button variant="outline" className="border-brand-red text-brand-red hover:bg-brand-red-tint" onClick={clearChartFilter}>
                      Clear Filter
                    </Button>
                  </CardContent>
                </Card>
              ) : null}
              {showLiveEmptyState ? (
                <Card className="border-brand-blue/10">
                  <CardContent className="p-8">
                    <p className="text-lg font-semibold text-brand-blue">
                      {slug === "ppe-detection"
                        ? "No PPE records available yet"
                        : slug === "region-alerts"
                          ? tRegionAlerts("noIntrusionEventsAvailableYet")
                        : slug === "speed-estimation"
                            ? "No Vehicle Analytics records available yet"
                            : slug === "crack-detection"
                              ? "No crack inspection results yet"
                              : slug === "unsafe-behavior-detection"
                                ? "No unsafe behavior results yet"
                              : "No fire or smoke alerts available yet"}
                    </p>
                    <p className="mt-2 text-sm text-muted">
                      {slug === "ppe-detection"
                        ? "Process a PPE video to populate the database. The dashboard will refresh automatically every 5 seconds."
                        : slug === "region-alerts"
                          ? tRegionAlerts("noIntrusionEventsAvailableDescription")
                          : slug === "speed-estimation"
                            ? "Process a speed-estimation video to populate vehicle counts, crossed-line analytics, and speed KPIs. The dashboard will refresh automatically every 5 seconds."
                            : slug === "crack-detection"
                              ? "No crack inspection results yet. Process crack images or videos from the Integration tab."
                              : slug === "unsafe-behavior-detection"
                                ? "No unsafe behavior results yet. Process workplace images or videos from the Integration tab."
                          : "Process a fire or smoke video to populate the database. The dashboard will refresh automatically every 5 seconds."}
                    </p>
                  </CardContent>
                </Card>
              ) : null}
              {showFilteredEmptyState ? (
                <Card className="border-brand-blue/10">
                  <CardContent className="p-8">
                    {showChartFilterEmptyState ? (
                      <>
                        <p className="text-lg font-semibold text-brand-blue">
                          {slug === "region-alerts"
                            ? tRegionAlerts("noIntrusionEventsMatchFilter")
                            : "No records match the selected chart filter. Clear the filter to view all incidents."}
                        </p>
                        <p className="mt-2 text-sm text-muted">
                          {slug === "region-alerts"
                            ? tRegionAlerts("noIntrusionEventsMatchFilterDescription")
                            : "The current global filters are still applied, but this chart selection does not match any remaining records."}
                        </p>
                        <div className="mt-4">
                          <Button variant="outline" className="border-brand-red text-brand-red hover:bg-brand-red-tint" onClick={clearChartFilter}>
                            Clear Filter
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-lg font-semibold text-brand-blue">
                          {slug === "region-alerts" ? tRegionAlerts("noProcessedIncidents") : "No processed incidents available for this view. Run Integration to populate the dashboard."}
                        </p>
                        <p className="mt-2 text-sm text-muted">
                          {slug === "region-alerts" ? tRegionAlerts("noProcessedIncidentsDescription") : "Adjust the filters or process new inputs from the Integration tab to refresh this business view."}
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              ) : null}
              {slug === "fire-detection" && fireDemoAlertCount > 0 ? (
                <Card className="border-brand-red/20 bg-brand-red-tint/20">
                  <CardContent className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-brand-blue">Latest fire/smoke sample alert added to the dashboard story</p>
                      <p className="text-xs text-muted">The newest sample alert is now included so the cards, drill-down charts, and table reflect the latest safety event together.</p>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-red">
                      {fireDemoAlertCount} demo alert{fireDemoAlertCount > 1 ? "s" : ""} applied
                    </div>
                  </CardContent>
                </Card>
              ) : null}
              {!showLiveEmptyState && !showFilteredEmptyState && (slug === "region-alerts" ? (
                <>
                  <section className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-blue">{tRegionAlerts("intrusionSnapshot")}</p>
                      <p className="mt-1 text-sm text-muted">{tRegionAlerts("intrusionSnapshotDescription")}</p>
                    </div>
                    <KpiGrid items={kpis.filter((item) => item.group === "top")} className="xl:grid-cols-4" />
                  </section>
                  <Card className="border-brand-blue/10">
                    <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-brand-blue">{tRegionAlerts("severityFocus")}</p>
                        <p className="text-xs text-muted">{tRegionAlerts("severityFocusDescription")}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: "High", displayLabel: tRegionAlerts("highSeverity"), color: SEVERITY_COLORS.High },
                          { label: "Medium", displayLabel: tRegionAlerts("mediumSeverity"), color: SEVERITY_COLORS.Medium },
                          { label: "Low", displayLabel: tRegionAlerts("lowSeverity"), color: SEVERITY_COLORS.Low },
                        ].map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => setRegionChartSelections((prev) => ({ ...prev, severity: prev.severity === item.label ? "" : item.label }))}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                              regionChartSelections.severity === item.label
                                ? "border-transparent text-white shadow-card"
                                : "border-brand-blue bg-white text-brand-blue hover:bg-brand-blue-tint"
                            }`}
                            style={regionChartSelections.severity === item.label ? { backgroundColor: item.color } : undefined}
                          >
                            {item.displayLabel}
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <CrossFilterSummary
                    selections={regionChartSelections}
                    copy={{
                      t: tRegionAlerts,
                      translateAlertType: (value) => ({
                        "Person Intrusion": tRegionAlerts("personIntrusion"),
                        "Vehicle Intrusion": tRegionAlerts("vehicleIntrusion"),
                        "Person or Vehicle Intrusion": tRegionAlerts("personOrVehicleIntrusion"),
                      }[value] ?? value),
                      translateSeverity: (value) => translateRegionAlertsSeverity(regionAlertsLanguage, value),
                    }}
                    onClear={() => setRegionChartSelections({ timeBucket: "", zone: "", alertType: "", severity: "" })}
                    onClearOne={(key) => setRegionChartSelections((prev) => ({ ...prev, [key]: "" }))}
                  />
                </>
              ) : slug === "fire-detection" ? (
                <>
                  <CrossFilterSummary
                    selections={{ timeBucket: "", zone: fireChartSelections.zone, alertType: fireChartSelections.alertType, severity: fireChartSelections.severity }}
                    onClear={() => setFireChartSelections({ alertType: "", zone: "", cameraId: "", severity: "" })}
                    onClearOne={(key) =>
                      setFireChartSelections((prev) => ({
                        ...prev,
                        [key === "alertType" ? "alertType" : key === "zone" ? "zone" : key === "severity" ? "severity" : key]: "",
                        ...(key === "alertType" ? { zone: "", cameraId: "" } : {}),
                        ...(key === "zone" ? { cameraId: "" } : {}),
                      }))
                    }
                  />
                  {fireChartSelections.cameraId ? (
                    <Card className="border-brand-red/20 bg-brand-red-tint/20">
                      <CardContent className="flex items-center justify-between gap-4 p-4">
                        <div>
                          <p className="text-sm font-semibold text-brand-blue">Camera drill-down is active</p>
                          <p className="text-xs text-muted">The table is currently focused on alerts from {fireChartSelections.cameraId}.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFireChartSelections((prev) => ({ ...prev, cameraId: "" }))}
                          className="rounded-full border border-brand-blue bg-white px-3 py-1.5 text-xs font-semibold text-brand-blue hover:bg-brand-blue-tint"
                        >
                          Clear camera
                        </button>
                      </CardContent>
                    </Card>
                  ) : null}
                  <KpiGrid items={kpis} />
                </>
              ) : slug === "crack-detection" ? (
                <>
                  <section className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-blue">Overall Defect Summary</p>
                      <p className="mt-1 text-sm text-muted">Highlights the volume, severity, and concentration of defects in the current view.</p>
                    </div>
                    <KpiGrid items={kpis.filter((item) => item.group === "overall")} />
                  </section>
                  <section className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-blue">Open Inspection Issues</p>
                      <p className="mt-1 text-sm text-muted">Focuses only on unresolved defect issues that still need inspection or follow-up.</p>
                    </div>
                    <KpiGrid items={kpis.filter((item) => item.group === "action")} />
                  </section>
                </>
              ) : slug === "unsafe-behavior-detection" ? (
                <>
                  <section className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-blue">Overall Safety Violations</p>
                      <p className="mt-1 text-sm text-muted">Tracks policy-related unsafe behavior volume and where risk is building up.</p>
                    </div>
                    <KpiGrid items={kpis.filter((item) => item.group === "overall")} />
                  </section>
                  <section className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-blue">Open Safety Events</p>
                      <p className="mt-1 text-sm text-muted">Surfaces only open unsafe events that still need supervisor attention or immediate review.</p>
                    </div>
                    <KpiGrid items={kpis.filter((item) => item.group === "action")} />
                  </section>
                </>
              ) : (
                <KpiGrid items={kpis} />
              ))}
              {!showLiveEmptyState && !showFilteredEmptyState ? <section className="grid gap-6 xl:grid-cols-2">{charts}</section> : null}
            </>
          )}

          {!showLiveEmptyState && !showFilteredEmptyState ? (
          <Card>
            <CardHeader>
              <CardTitle>
                {slug === "crack-detection"
                  ? "Defect Register"
                  : slug === "unsafe-behavior-detection"
                    ? "Unsafe Event Register"
                    : slug === "region-alerts"
                      ? tRegionAlerts("detectedIntrusionEvents")
                      : "Filtered Results"}
              </CardTitle>
              <CardDescription>
                {slug === "crack-detection"
                  ? "Business-friendly defect records for the current filter selection."
                  : slug === "unsafe-behavior-detection"
                    ? "Business-friendly unsafe behavior records for the current filter selection."
                    : slug === "region-alerts"
                      ? tRegionAlerts("detectedIntrusionEventsDescription")
                      : "Sortable detailed results for the current filter selection."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={resolvedColumns}
                rows={sortedRows}
                sortState={sortState}
                rowClassName={
                  slug === "region-alerts"
                    ? (row) => (row.isLatestDemoIncident ? "bg-brand-red-tint/90" : row.escalationNeeded === "Yes" ? "bg-brand-red-tint/70" : "")
                    : slug === "fire-detection"
                      ? (row) => (row.isLatestDemoAlert ? "bg-brand-red-tint/90" : row.severity === "High" ? "bg-brand-red-tint/60" : "")
                      : slug === "speed-estimation"
                        ? (row) => (row.status === "Violation" ? "bg-brand-red-tint/40" : "")
                        : slug === "crack-detection"
                          ? (row) => (row.status === "Open" ? "bg-brand-red-tint/35" : "")
                          : slug === "unsafe-behavior-detection"
                            ? (row) => (row.status === "Open" ? "bg-brand-red-tint/35" : "")
                        : slug === "ppe-detection"
                          ? (row) => (row.complianceStatus === "FAIL" ? "bg-brand-red-tint/35" : "")
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
          ) : null}
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
      title: "Region Alerts Detection",
      description: "Detect people or vehicles entering restricted, hazardous, or monitored zones.",
      extraFilterDefs: [
        { key: "objectType", label: "Detected Class" },
        { key: "alertType", label: "Intrusion Type" },
        { key: "shift", label: "Shift" },
        { key: "severity", label: "Severity" },
        { key: "status", label: "Status" },
      ],
      metricDefs: [
        {
          label: "Total Intrusions",
          icon: ShieldAlert,
          compute: (items) => items.filter(isRegionIncident).length,
          format: (value) => value.toLocaleString(),
          subtext: "All intrusion events in the selected monitoring window.",
          valueClassName: () => "text-brand-blue",
          group: "top",
        },
        {
          label: "High / Critical Alerts",
          icon: AlertTriangle,
          compute: (items) => items.filter((item) => isRegionIncident(item) && (item.severity === "High" || item.severity === "Critical")).length,
          format: String,
          subtext: "High-priority intrusion events that need the fastest response.",
          valueClassName: () => "text-brand-red",
          group: "top",
        },
        {
          label: "Most Affected Zone",
          icon: ShieldAlert,
          compute: (items) => Object.entries(groupBy(items.filter(isRegionIncident), "zone")).sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? "No incidents",
          format: String,
          subtext: "Zone with the highest concentration of intrusion activity.",
          valueClassName: () => "text-brand-blue",
          group: "top",
        },
        {
          label: "Latest Alert",
          icon: Activity,
          compute: (items) => byTimestamp(items.filter(isRegionIncident)).at(-1),
          format: (value) => formatLatestIncidentLabel(value, "No alerts"),
          subtext: "Most recent intrusion event surfaced in the current view.",
          valueClassName: () => "text-brand-blue",
          group: "top",
        },
      ],
      columns: [
        { key: "id", label: "Event ID", sortable: true },
        { key: "cameraId", label: "Camera", sortable: true },
        { key: "zone", label: "Zone", sortable: true },
        { key: "shift", label: "Shift", sortable: true },
        { key: "objectType", label: "Detected Class", sortable: true },
        { key: "entryTime", label: "Entry Time", sortable: true, render: formatDateTime },
        { key: "exitTime", label: "Exit Time", sortable: true, render: (value) => (value ? formatDateTime(value) : "Still Open") },
        { key: "durationSec", label: "Duration", sortable: true, render: formatDurationLabel },
        { key: "alertType", label: "Intrusion Type", sortable: true },
        { key: "severity", label: "Severity", sortable: true, render: badgeRender },
        { key: "status", label: "Status", sortable: true, render: badgeRender },
        { key: "confidenceScore", label: "Confidence", sortable: true, render: (value) => `${(Number(value || 0) * 100).toFixed(1)}%` },
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
      title: "Vehicle Analytics Dashboard",
      description: info,
      extraFilterDefs: [
        { key: "objectType", label: "Object Type" },
        { key: "status", label: "Status" },
        { key: "speedLimitKmh", label: "Speed Limit" },
        { key: "severity", label: "Severity" },
      ],
      metricDefs: [
        {
          label: "Total Vehicles",
          icon: LayoutDashboard,
          compute: (items) => countUniqueSpeedObjects(items),
          format: String,
          subtext: "Unique tracked vehicles across the selected monitoring window.",
        },
        {
          label: "Average Speed",
          icon: Activity,
          compute: (items) => average(items.map((item) => item.detectedSpeedKmh)),
          format: (value) => `${Number(value || 0).toFixed(1)} km/h`,
          subtext: "Average detected speed across tracked vehicles.",
        },
        {
          label: "Maximum Speed",
          icon: Activity,
          compute: (items) => (items.length ? Math.max(...items.map((item) => item.detectedSpeedKmh)) : 0),
          format: (value) => `${Number(value || 0).toFixed(1)} km/h`,
          subtext: "Fastest tracked vehicle in the current filtered dataset.",
          valueClassName: () => "text-brand-red",
        },
        {
          label: "Speeding Violations",
          icon: AlertTriangle,
          compute: (items) => items.filter((item) => item.isOverspeeding === "Yes").length,
          format: String,
          subtext: "Vehicles traveling above the configured zone speed limit.",
          valueClassName: () => "text-brand-red",
        },
        {
          label: "Crossed Vehicles",
          icon: Route,
          compute: (items) => items.filter((item) => item.crossedLine === "Yes").length,
          format: String,
          subtext: "Vehicles that crossed the counting line during the selected period.",
        },
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
        { key: "crossedLine", label: "Crossed Line", sortable: true, render: (value) => badgeRender(value === "Yes" ? "Crossed" : "Not crossed") },
        { key: "direction", label: "Direction", sortable: true, render: (value) => String(value || "unknown").replace(/\b\w/g, (char) => char.toUpperCase()) },
        { key: "classCountForType", label: "Class Count", sortable: true },
        { key: "severity", label: "Severity", sortable: true, render: (value) => <Badge tone={value === "High" ? "high" : value === "Medium" ? "warning" : value === "Low" ? "alert" : "normal"}>{value}</Badge> },
        { key: "confidenceScore", label: "Confidence Score", sortable: true, render: (value) => `${(Number(value || 0) * 100).toFixed(1)}%` },
        { key: "status", label: "Status", sortable: true, render: badgeRender },
      ],
    },
    "crack-detection": {
      title: "Crack Detection Dashboard",
      description: info,
      extraFilterDefs: [
        { key: "severity", label: "Severity" },
        { key: "status", label: "Global Status Filter" },
      ],
      metricDefs: [
        {
          label: "Total Defects",
          icon: LayoutDashboard,
          compute: (items) => sum(items.map((item) => item.crackCount)),
          format: String,
          subtext: "All recorded defect findings in the current inspection view.",
          group: "overall",
        },
        {
          label: "Critical Defects",
          icon: AlertTriangle,
          compute: (items) => items.filter((item) => item.severity === "Critical").length,
          format: String,
          subtext: "Critical defect records that need prompt attention.",
          valueClassName: () => "text-brand-red",
          group: "overall",
        },
        {
          label: "Affected Zones",
          icon: ShieldAlert,
          compute: (items) => new Set(items.filter((item) => item.crackDetected === "Yes").map((item) => item.zone || item.location)).size,
          format: String,
          subtext: "Distinct zones or assets where defects have been identified.",
          group: "overall",
        },
        {
          label: "Most Affected Area",
          icon: AlertTriangle,
          compute: (items) =>
            Object.entries(groupBy(items.filter((item) => item.crackDetected === "Yes"), (item) => item.location || item.zone || "Unknown"))
              .sort((a, b) => sum(b[1].map((row) => row.crackCount)) - sum(a[1].map((row) => row.crackCount)))[0]?.[0] ?? "No affected area",
          format: String,
          subtext: "Location with the highest concentration of defects.",
          valueClassName: () => "text-brand-red",
          group: "overall",
        },
        {
          label: "Open Defects",
          icon: AlertTriangle,
          compute: (items) => items.filter((item) => item.status === "Open" && item.crackDetected === "Yes").length,
          format: String,
          subtext: "Defect records that still require attention or closure.",
          valueClassName: () => "text-brand-red",
          group: "action",
        },
        {
          label: "Critical Open Defects",
          icon: AlertTriangle,
          compute: (items) => items.filter((item) => item.status === "Open" && item.crackDetected === "Yes" && item.severity === "Critical").length,
          format: String,
          subtext: "Open critical defect records requiring urgent attention.",
          valueClassName: () => "text-brand-red",
          group: "action",
        },
        {
          label: "Needs Inspection",
          icon: AlertTriangle,
          compute: (items) =>
            items.filter(
              (item) =>
                item.crackDetected === "Yes"
                && (item.status === "Open" || item.recommendedAction === "Inspection required" || item.severity === "High" || item.severity === "Critical"),
            ).length,
          format: String,
          subtext: "Open or high-priority defects that should be reviewed by an inspection team.",
          group: "action",
        },
        {
          label: "Latest Open Alert",
          icon: Activity,
          compute: (items) => byTimestamp(items.filter((item) => item.status === "Open" && item.crackDetected === "Yes")).at(-1),
          format: (value) => formatLatestIncidentLabel(value, "No open alerts"),
          subtext: "Most recent open defect surfaced in this filtered view.",
          group: "action",
        },
      ],
      columns: [
        { key: "timestamp", label: "Time", sortable: true, render: formatDateTime },
        { key: "location", label: "Location", sortable: true },
        { key: "zone", label: "Zone / Asset", sortable: true },
        { key: "defectType", label: "Defect Type", sortable: true },
        { key: "crackCount", label: "Defect Count", sortable: true },
        { key: "severity", label: "Severity", sortable: true, render: (value) => <Badge tone={value === "Critical" || value === "High" ? "high" : value === "Medium" ? "warning" : value === "Low" ? "alert" : "normal"}>{value}</Badge> },
        { key: "status", label: "Status", sortable: true, render: badgeRender },
        { key: "recommendedAction", label: "Recommended Action", sortable: true },
        { key: "maxConfidence", label: "Confidence", sortable: true, render: (value) => `${(Number(value || 0) * 100).toFixed(1)}%` },
        { key: "evidence", label: "Evidence", sortable: false, render: evidenceLinkRender },
      ],
    },
    "unsafe-behavior-detection": {
      title: "Unsafe Behavior Dashboard",
      description: info,
      extraFilterDefs: [
        { key: "eventType", label: "Event Type" },
        { key: "severity", label: "Severity" },
        { key: "status", label: "Global Status Filter" },
      ],
      metricDefs: [
        {
          label: "Total Unsafe Events",
          icon: ShieldAlert,
          compute: (items) => items.length,
          format: String,
          subtext: "All unsafe incidents in the current view.",
          valueClassName: () => "text-brand-red",
          group: "overall",
        },
        {
          label: "Phone Usage Events",
          icon: Smartphone,
          compute: (items) => items.filter((item) => item.eventType === "Phone Usage").length,
          format: String,
          subtext: "Unsafe events linked to mobile phone usage.",
          group: "overall",
        },
        {
          label: "Smoking / Cigarette Events",
          icon: Flame,
          compute: (items) => items.filter((item) => String(item.eventType).toLowerCase().includes("smoking") || String(item.eventType).toLowerCase().includes("cigarette")).length,
          format: String,
          subtext: "Smoking-related safety or policy incidents.",
          valueClassName: () => "text-brand-red",
          group: "overall",
        },
        {
          label: "Most Risky Zone",
          icon: ShieldAlert,
          compute: (items) => Object.entries(groupBy(items, "zone")).sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? "No risky zone",
          format: String,
          subtext: "Zone generating the highest number of unsafe incidents.",
          group: "overall",
        },
        {
          label: "Open Events",
          icon: ShieldAlert,
          compute: (items) => items.filter((item) => item.status === "Open").length,
          format: String,
          subtext: "Unsafe incidents that still need follow-up.",
          valueClassName: () => "text-brand-red",
          group: "action",
        },
        {
          label: "Critical Open Events",
          icon: AlertTriangle,
          compute: (items) => items.filter((item) => item.status === "Open" && item.severity === "Critical").length,
          format: String,
          subtext: "Open critical unsafe incidents requiring urgent review.",
          valueClassName: () => "text-brand-red",
          group: "action",
        },
        {
          label: "Needs Supervisor Review",
          icon: AlertTriangle,
          compute: (items) =>
            items.filter(
              (item) =>
                item.status === "Open"
                || item.recommendedAction === "Supervisor review required"
                || item.recommendedAction === "Immediate review"
                || item.severity === "High"
                || item.severity === "Critical",
            ).length,
          format: String,
          subtext: "Unsafe incidents needing supervisor or immediate review.",
          valueClassName: () => "text-brand-red",
          group: "action",
        },
        {
          label: "Latest Open Event",
          icon: Activity,
          compute: (items) => byTimestamp(items.filter((item) => item.status === "Open")).at(-1),
          format: (value) => formatLatestIncidentLabel(value, "No open events"),
          subtext: "Most recent open unsafe incident in the filtered view.",
          group: "action",
        },
      ],
      columns: [
        { key: "timestamp", label: "Time", sortable: true, render: formatDateTime },
        { key: "cameraId", label: "Camera", sortable: true },
        { key: "location", label: "Location", sortable: true },
        { key: "zone", label: "Zone", sortable: true },
        { key: "eventType", label: "Unsafe Behavior", sortable: true, render: badgeRender },
        { key: "severity", label: "Severity", sortable: true, render: (value) => <Badge tone={value === "Critical" || value === "High" ? "high" : value === "Medium" ? "warning" : value === "Low" ? "alert" : "normal"}>{value}</Badge> },
        { key: "status", label: "Status", sortable: true, render: badgeRender },
        { key: "confidence", label: "Confidence", sortable: true, render: (value) => `${(Number(value || 0) * 100).toFixed(1)}%` },
        { key: "timestampSec", label: "Frame Time (sec)", sortable: true, render: (value) => Number(value || 0).toFixed(2) },
        { key: "recommendedAction", label: "Recommended Action", sortable: true },
        {
          key: "evidence",
          label: "Evidence",
          sortable: false,
          render: (value) => {
            if (value?.url) return evidenceLinkRender(value.url);
            if (value?.hasBoundingEvidence) return "Evidence available";
            return "Not available";
          },
        },
      ],
    },
    "fire-detection": {
      title: "Warehouse Fire & Smoke Safety Center",
      description: info,
      extraFilterDefs: [
        { key: "facility", label: "Facility" },
        { key: "shift", label: "Shift" },
        { key: "alertType", label: "Alert Type" },
        { key: "severity", label: "Severity" },
      ],
      metricDefs: [
        {
          label: "Total Fire/Smoke Alerts",
          icon: Flame,
          compute: (items) => items.filter((item) => item.alertType !== "Clear / No Alert").length,
          format: String,
          subtext: "All video summaries with confirmed fire or smoke activity.",
          valueClassName: () => "text-brand-red",
        },
        {
          label: "Critical Alerts",
          icon: AlertTriangle,
          compute: (items) => items.filter((item) => item.severity === "High").length,
          format: String,
          subtext: "Confirmed high-severity alerts that safety teams should review first.",
          valueClassName: () => "text-brand-red",
        },
        {
          label: "Fire + Smoke Confirmed Alerts",
          icon: Flame,
          compute: (items) => items.filter((item) => item.alertType === "Fire + Smoke").length,
          format: String,
          subtext: "Alerts showing both smoke and direct fire signal in the same clip.",
          valueClassName: () => "text-brand-red",
        },
        {
          label: "Smoke-Only Warnings",
          icon: Flame,
          compute: (items) => items.filter((item) => item.alertType === "Smoke Only").length,
          format: String,
          subtext: "Warnings that may indicate early smoke or exhaust-like activity needing verification.",
          valueClassName: () => "text-brand-blue",
        },
        {
          label: "Most Affected Zone",
          icon: Flame,
          compute: (items) => Object.entries(groupBy(items.filter((item) => item.alertType !== "Clear / No Alert"), "zone")).sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? "No alerts",
          format: String,
          subtext: "Zone accumulating the highest number of fire or smoke alerts.",
          valueClassName: () => "text-brand-blue",
        },
        {
          label: "Most Triggered Camera",
          icon: Flame,
          compute: (items) => Object.entries(groupBy(items.filter((item) => item.alertType !== "Clear / No Alert"), "cameraId")).sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? "No alerts",
          format: String,
          subtext: "Camera that most often captures potential fire or smoke events.",
          valueClassName: () => "text-brand-blue",
        },
      ],
      columns: [
        { key: "cameraId", label: "Camera ID", sortable: true },
        { key: "location", label: "Location", sortable: true },
        { key: "zone", label: "Zone", sortable: true },
        { key: "facility", label: "Facility", sortable: true },
        { key: "shift", label: "Shift", sortable: true },
        { key: "alertType", label: "Alert Type", sortable: true },
        { key: "severity", label: "Severity", sortable: true, render: (value) => <Badge tone={value === "High" ? "high" : value === "Medium" ? "medium" : "normal"}>{value}</Badge> },
        { key: "confidenceScore", label: "Confidence Score", sortable: true, render: (value) => `${(Number(value || 0) * 100).toFixed(1)}%` },
        { key: "fireDetected", label: "Fire Detected", sortable: true, render: (value) => badgeRender(value === "Yes" ? "Yes" : "No") },
        { key: "smokeDetected", label: "Smoke Detected", sortable: true, render: (value) => badgeRender(value === "Yes" ? "Yes" : "No") },
        { key: "outputVideo", label: "Output Video", sortable: false, render: (value) => (value ? <a className="font-semibold text-brand-blue hover:underline" href={value} rel="noreferrer" target="_blank">Open output</a> : "N/A") },
        { key: "timestamp", label: "Timestamp", sortable: true, render: formatDateTime },
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
        { key: "complianceStatus", label: "Compliance Status" },
      ],
      metricDefs: [
        { label: "Total Workers Checked", icon: LayoutDashboard, compute: (items) => new Set(items.map((item) => `${item.inputId}:${item.trackedWorkerId}`)).size, format: String },
        { label: "Workers with PPE Violations", icon: AlertTriangle, compute: (items) => items.filter((item) => item.complianceStatus === "FAIL").length, format: String, valueClassName: () => "text-brand-red" },
        { label: "PPE Compliance Rate (%)", icon: Activity, compute: (items) => (items.length ? (items.filter((item) => item.complianceStatus === "PASS").length / items.length) * 100 : 0), format: (value) => `${Number(value || 0).toFixed(1)}%` },
        { label: "Missing Helmet Cases", icon: HardHat, compute: (items) => items.filter((item) => item.helmet === "MISSING").length, format: String, valueClassName: () => "text-brand-red" },
        { label: "Missing Vest Cases", icon: HardHat, compute: (items) => items.filter((item) => item.vest === "MISSING").length, format: String, valueClassName: () => "text-brand-red" },
        { label: "Missing Shoe Cases", icon: HardHat, compute: (items) => items.filter((item) => item.shoes === "MISSING").length, format: String, valueClassName: () => "text-brand-red" },
        { label: "Most Affected Zone", icon: AlertTriangle, compute: (items) => Object.entries(groupBy(items.filter((item) => item.complianceStatus === "FAIL"), "zone")).sort((a, b) => b[1].length - a[1].length)[0]?.[0] ?? "No violations", format: String },
      ],
      columns: [
        { key: "cameraId", label: "Camera ID", sortable: true },
        { key: "zone", label: "Zone", sortable: true },
        { key: "shift", label: "Shift", sortable: true },
        { key: "trackedWorkerId", label: "Worker ID", sortable: true },
        { key: "helmet", label: "Helmet", sortable: true, render: (value) => <Badge tone={value === "MISSING" ? "alert" : value === "UNKNOWN" ? "warning" : "normal"}>{value}</Badge> },
        { key: "vest", label: "Vest", sortable: true, render: (value) => <Badge tone={value === "MISSING" ? "alert" : value === "UNKNOWN" ? "warning" : "normal"}>{value}</Badge> },
        { key: "shoes", label: "Shoes", sortable: true, render: (value) => <Badge tone={value === "MISSING" ? "alert" : value === "UNKNOWN" ? "warning" : "normal"}>{value}</Badge> },
        { key: "missingItems", label: "Missing Items", sortable: true, render: (value) => Array.isArray(value) && value.length ? value.join(", ") : "None" },
        { key: "complianceStatus", label: "Compliance Status", sortable: true, render: (value) => <Badge tone={value === "FAIL" ? "alert" : "normal"}>{value}</Badge> },
        { key: "durationSec", label: "Duration (sec)", sortable: true },
        { key: "outputVideoUrl", label: "Output Video", sortable: false, render: (value) => (value ? <a className="font-semibold text-brand-blue hover:underline" href={value} rel="noreferrer" target="_blank">Open video</a> : "N/A") },
      ],
    },
  };

  return configs[slug];
}
