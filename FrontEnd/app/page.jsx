"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";

import DetailPage from "../components/DetailPage";
import LandingPage from "../components/LandingPage";
import UseCasesPage from "../components/UseCasesPage";
import {
  API_BASE_URL,
  categoryDetails,
  getIntegrationDefaults,
  integrationSupportedUseCases,
  resolveBackendUrl,
  sampleMediaByUseCase,
  sectionLabelToParam,
  sectionParamToLabel,
  tabLabelToParam,
  tabParamToLabel,
  useCaseToAnalyticsDashboardSlug,
  useCases,
} from "../components/visionLabConfig";

function buildEmptyIntegrationOverview() {
  return {
    connected: false,
    processing: false,
    message: "",
    last_sync_at: null,
    connection: null,
    recent_runs: [],
    input_videos: [],
    output_videos: [],
    summary: {},
  };
}

function buildEmptyIntegrationModelState() {
  return {
    use_case_id: "",
    has_staged_model: false,
    staged_model_version_id: null,
    staged_model_path: null,
    has_active_model: false,
    active_model_path: null,
    default_model_available: true,
  };
}

function friendlyPlaygroundErrorMessage(message) {
  const normalizedMessage = String(message || "");
  if (
    normalizedMessage.includes("models/crack_detection/best.pt")
    && (normalizedMessage.includes("Crack detection model not found") || normalizedMessage.includes("Defect detection model not found"))
  ) {
    return "Defect Detection model is not installed yet. Place best.pt under BackEnd/models/crack_detection/best.pt.";
  }
  if (normalizedMessage.includes("Smoking model not found at models/unsafe_behavior/smoking_best.pt")) {
    return "Smoking model is not installed yet. Place smoking_best.pt under BackEnd/models/unsafe_behavior/.";
  }
  if (normalizedMessage.includes("COCO model not found or could not be loaded")) {
    return "COCO YOLO model could not be loaded. Place yolov8n.pt under BackEnd/models/common/ or allow Ultralytics to load yolov8n.pt.";
  }
  return message;
}

function integrationAssetLabel(useCaseId) {
  return ["crack-detection", "unsafe-behavior-detection"].includes(String(useCaseId || "").trim().toLowerCase())
    ? "file"
    : "video";
}

function getDefaultIntegrationFetchCount(useCaseId) {
  return String(useCaseId || "").trim().toLowerCase() === "region-alerts" ? 5 : 3;
}

const DEFAULT_REGION_ALERT_RULE_CONFIG = {
  trigger_type: "enter",
  alert_delay_sec: 0,
  confidence_threshold: 0.5,
  alerts_enabled: true,
};

const REGION_ALERTS_LANGUAGE_STORAGE_KEY = "region-alerts-ui-language";
const REGION_ALERT_ZONE_OPTIONS = ["Zone 1", "Zone 2", "Zone 3"];
const REGION_ALERT_INTRUSION_TYPE_OPTIONS = [
  { value: "person_intrusion", key: "personIntrusion", label: "Person Intrusion" },
  { value: "vehicle_intrusion", key: "vehicleIntrusion", label: "Vehicle Intrusion" },
  { value: "person_or_vehicle_intrusion", key: "personOrVehicleIntrusion", label: "Person or Vehicle Intrusion" },
];
const DEFAULT_REGION_ALERT_PLAYGROUND_ROI = {
  x: 0.25,
  y: 0.25,
  width: 0.5,
  height: 0.5,
};
const DEFAULT_REGION_ALERT_ROI_PAYLOAD = Object.freeze({
  type: "rectangle",
  normalized: true,
  x1: 0.25,
  y1: 0.25,
  x2: 0.75,
  y2: 0.75,
});
const FULL_VIDEO_CONTENT_BOX = Object.freeze({
  left: 0,
  top: 0,
  width: 1,
  height: 1,
});

const REGION_ALERTS_I18N = {
  en: {
    title: "Region Alerts Detection",
    description: "Monitors restricted or risky zones and raises alerts when a person or vehicle enters a defined area in warehouses, factory floors, airports, hospitals, and security zones.",
    home: "Home",
    modelPlayground: "Model Playground",
    integration: "Integration",
    dashboard: "Dashboard",
    fineTuning: "Fine-Tuning",
    input: "Input",
    imageAndVideo: "Image & Video",
    uploadImageOrVideo: "Upload image or video",
    uploadPrompt: (useCaseTitle) => `Drop files here or click to preview a sample inference for ${useCaseTitle}.`,
    trySample: "Try a Sample",
    customPreviewOptions: "Custom preview options",
    customPreviewHelp: "Upload your own input or pick a sample, then re-run the preview with the settings below.",
    alertRules: "Alert Rules",
    activeRegionAlertConfiguration: "Active Region Alert Configuration",
    regionOfInterest: "Region of interest",
    roiHelp: "Drag a rectangle on the current input preview. Region Alerts will treat it as the restricted zone.",
    roiDetailOne: "Region Alerts currently detects person intrusion inside one selected region. Draw a region and rerun preview to test the rule.",
    roiDetailTwo: "Objects outside the selected region are ignored for alerts.",
    roiSelected: "ROI selected",
    clearRoi: "Clear ROI",
    roiEmptyState: "Select a sample or upload a file first, then drag on the preview to define an ROI.",
    runPreview: "Run Preview",
    processAgain: "Process Again",
    runningPreview: "Running preview...",
    output: "Output",
    inferencePreview: "Inference Preview",
    awaitingInput: "Awaiting Input",
    generatingPreview: "Generating preview...",
    runningBackendInference: (sourceLabel) => `Running backend inference for ${sourceLabel}.`,
    sourceLabel: (label) => `Source: ${label}`,
    detections: "Detections",
    noDetectionsReturned: "No detections returned",
    previewInBrowser: "Preview in Browser",
    downloadResults: "Download Results",
    uploadedFilePrefix: "Uploaded",
    integrationConfiguration: "Integration Configuration",
    processingMode: "Processing Mode",
    auto: "Auto",
    manual: "Manual",
    connect: "Connect",
    reconnectMinio: "Reconnect",
    connected: "Connected",
    notConnected: "Not Connected",
    manualFetchProcess: "Manual Fetch & Process",
    selectAll: "Select All",
    clearSelection: "Clear Selection",
    fetchCount: "Fetch count",
    fetchVideos: "Fetch Videos",
    fetchFiles: "Fetch Files",
    processSelected: (count) => `Process Selected${count > 0 ? ` (${count})` : ""}`,
    zone: "Zone",
    triggerType: "Trigger Type",
    detectionTypeIntrusionType: "Detection Type / Intrusion Type",
    minimumConfidence: "Minimum Confidence",
    triggerAlertAfterNViolations: "Trigger alert after N violations",
    saveConfiguration: "Save Configuration",
    configurationSaved: "Configuration saved for this demo run.",
    regionAlertsControlsHint: "Demo-friendly Region Alerts controls for the Integration tab. ROI selection and existing processing behavior stay unchanged.",
    currentTriggerBehavior: "Existing Region Alerts processing continues to use the current ROI trigger behavior.",
    zoneEntry: "Zone Entry",
    zoneExit: "Zone Exit",
    personIntrusion: "Person Intrusion",
    vehicleIntrusion: "Vehicle Intrusion",
    personOrVehicleIntrusion: "Person or Vehicle Intrusion",
    selected: "Selected",
    notSelected: "Not selected",
    roiSource: "ROI source",
    manualRoiSelected: "Manual ROI selected",
    defaultRoiSource: "Default ROI",
    zoneType: "Zone type",
    singleRectangleZone: "Single rectangle zone",
    confidence: "Confidence",
    alertDelay: "Alert delay",
    alerts: "Alerts",
    enabled: "Enabled",
    disabled: "Disabled",
    trigger: "Trigger",
  },
  ar: {
    title: "كشف تنبيهات المناطق",
    description: "اكتشاف دخول الأشخاص أو المركبات إلى المناطق المقيّدة أو الخطرة أو الخاضعة للمراقبة.",
    home: "الرئيسية",
    modelPlayground: "ساحة تجربة النموذج",
    integration: "التكامل",
    dashboard: "لوحة المعلومات",
    fineTuning: "الضبط الدقيق",
    input: "الإدخال",
    imageAndVideo: "صور وفيديو",
    uploadImageOrVideo: "رفع صورة أو فيديو",
    uploadPrompt: (useCaseTitle) => `أسقط الملفات هنا أو انقر لمعاينة استدلال تجريبي لـ ${useCaseTitle}.`,
    trySample: "جرّب عينة",
    customPreviewOptions: "خيارات المعاينة المخصصة",
    customPreviewHelp: "ارفع مدخلاً خاصاً بك أو اختر عينة، ثم أعد تشغيل المعاينة بالإعدادات أدناه.",
    alertRules: "قواعد التنبيه",
    activeRegionAlertConfiguration: "إعداد تنبيه المنطقة النشط",
    regionOfInterest: "منطقة الاهتمام",
    roiHelp: "اسحب مستطيلاً فوق معاينة الإدخال الحالية. سيعامل تنبيه المناطق هذا المستطيل كمنطقة مقيّدة.",
    roiDetailOne: "يكتشف تنبيه المناطق حالياً دخول الأشخاص داخل منطقة واحدة محددة. ارسم منطقة ثم أعد تشغيل المعاينة لاختبار القاعدة.",
    roiDetailTwo: "يتم تجاهل العناصر خارج المنطقة المحددة عند إطلاق التنبيهات.",
    roiSelected: "تم تحديد منطقة الاهتمام",
    clearRoi: "مسح منطقة الاهتمام",
    roiEmptyState: "اختر عينة أو ارفع ملفاً أولاً، ثم اسحب فوق المعاينة لتحديد منطقة الاهتمام.",
    runPreview: "تشغيل المعاينة",
    processAgain: "إعادة المعالجة",
    runningPreview: "جارٍ تشغيل المعاينة...",
    output: "الإخراج",
    inferencePreview: "معاينة الاستدلال",
    awaitingInput: "بانتظار الإدخال",
    generatingPreview: "جارٍ إنشاء المعاينة...",
    runningBackendInference: (sourceLabel) => `جارٍ تشغيل الاستدلال الخلفي لـ ${sourceLabel}.`,
    sourceLabel: (label) => `المصدر: ${label}`,
    detections: "الاكتشافات",
    noDetectionsReturned: "لم يتم إرجاع اكتشافات",
    previewInBrowser: "معاينة في المتصفح",
    downloadResults: "تنزيل النتائج",
    uploadedFilePrefix: "مرفوع",
    integrationConfiguration: "إعدادات التكامل",
    processingMode: "وضع المعالجة",
    auto: "تلقائي",
    manual: "يدوي",
    connect: "اتصال",
    reconnectMinio: "إعادة الاتصال",
    connected: "متصل",
    notConnected: "غير متصل",
    manualFetchProcess: "جلب ومعالجة يدوياً",
    selectAll: "تحديد الكل",
    clearSelection: "مسح التحديد",
    fetchCount: "عدد العناصر المطلوب جلبها",
    fetchVideos: "جلب الفيديوهات",
    fetchFiles: "جلب الملفات",
    processSelected: (count) => `معالجة المحدد${count > 0 ? ` (${count})` : ""}`,
    zone: "المنطقة",
    triggerType: "نوع التشغيل",
    detectionTypeIntrusionType: "نوع الاكتشاف / نوع التسلل",
    minimumConfidence: "الحد الأدنى للثقة",
    triggerAlertAfterNViolations: "تشغيل التنبيه بعد N مخالفات",
    saveConfiguration: "حفظ الإعدادات",
    configurationSaved: "تم حفظ الإعدادات لهذا العرض التجريبي.",
    regionAlertsControlsHint: "عناصر تحكم مبسطة لتنبيهات المناطق داخل تبويب التكامل. يظل اختيار منطقة الاهتمام وسلوك المعالجة الحالي كما هو.",
    currentTriggerBehavior: "تستمر معالجة تنبيهات المناطق الحالية باستخدام سلوك تشغيل منطقة الاهتمام الحالي.",
    zoneEntry: "دخول إلى المنطقة",
    zoneExit: "خروج من المنطقة",
    personIntrusion: "تسلل شخص",
    vehicleIntrusion: "تسلل مركبة",
    personOrVehicleIntrusion: "تسلل شخص أو مركبة",
    selected: "محدد",
    notSelected: "غير محدد",
    roiSource: "مصدر منطقة الاهتمام",
    manualRoiSelected: "تم تحديد منطقة اهتمام يدوية",
    defaultRoiSource: "منطقة الاهتمام الافتراضية",
    zoneType: "نوع المنطقة",
    singleRectangleZone: "منطقة مستطيلة واحدة",
    confidence: "الثقة",
    alertDelay: "تأخير التنبيه",
    alerts: "التنبيهات",
    enabled: "مفعلة",
    disabled: "معطلة",
    trigger: "المحفّز",
  },
};

function resolveRegionAlertsLanguage(value) {
  return value === "ar" ? "ar" : "en";
}

function getRegionAlertsText(language, key, ...args) {
  const normalizedLanguage = resolveRegionAlertsLanguage(language);
  const localizedValue = REGION_ALERTS_I18N[normalizedLanguage]?.[key];
  const fallbackValue = REGION_ALERTS_I18N.en[key];
  const entry = localizedValue ?? fallbackValue;
  return typeof entry === "function" ? entry(...args) : entry ?? key;
}

function isIntegrationConnectedPayload(payload) {
  if (typeof payload?.connected === "boolean") return payload.connected;
  if (typeof payload?.is_connected === "boolean") return payload.is_connected;

  const connectionStatus = String(payload?.connection_status ?? payload?.status ?? "").trim().toLowerCase();
  if (connectionStatus) {
    return connectionStatus === "connected";
  }

  return Boolean(payload?.connection && typeof payload.connection === "object");
}

function normalizeIntegrationConnection(payload) {
  if (payload?.connection && typeof payload.connection === "object") {
    return payload.connection;
  }

  const connection = {};
  const stringFields = ["endpoint", "bucket", "input_prefix", "output_prefix", "processing_mode"];

  stringFields.forEach((field) => {
    if (typeof payload?.[field] === "string" && payload[field].trim()) {
      connection[field] = payload[field];
    }
  });

  if (payload?.rule_config && typeof payload.rule_config === "object") {
    connection.rule_config = payload.rule_config;
  }
  if (Array.isArray(payload?.zone_points_normalized)) {
    connection.zone_points_normalized = payload.zone_points_normalized;
  }

  if (Object.keys(connection).length > 0) {
    return connection;
  }

  return isIntegrationConnectedPayload(payload) ? {} : null;
}

function readStoredRegionAlertsLanguage() {
  if (typeof window === "undefined") return "en";
  return resolveRegionAlertsLanguage(window.localStorage.getItem(REGION_ALERTS_LANGUAGE_STORAGE_KEY));
}

function formatRegionAlertsViolationCountForLanguage(value, language) {
  const count = Number(value);
  if (!Number.isFinite(count) || count < 0) {
    return language === "ar" ? "0 مخالفات" : "0 violations";
  }
  if (language === "ar") {
    if (count === 1) return "1 مخالفة";
    if (count === 2) return "2 مخالفتان";
    return `${count} مخالفات`;
  }
  return `${count} violation${count === 1 ? "" : "s"}`;
}

function applyRegionAlertsDetailTranslations(container, language) {
  if (!container) return;
  const liveStatusKeys = new Set(["connect", "reconnectMinio", "connected", "notConnected"]);

  const exactTextEntries = [
    ["Home", "home"],
    ["Model Playground", "modelPlayground"],
    ["Integration", "integration"],
    ["Dashboard", "dashboard"],
    ["Fine-Tuning", "fineTuning"],
    ["Input", "input"],
    ["Image & Video", "imageAndVideo"],
    ["Upload image or video", "uploadImageOrVideo"],
    ["Try a Sample", "trySample"],
    ["Custom preview options", "customPreviewOptions"],
    ["Upload your own input or pick a sample, then re-run the preview with the settings below.", "customPreviewHelp"],
    ["Alert Rules", "alertRules"],
    ["Active Region Alert Configuration", "activeRegionAlertConfiguration"],
    ["Region of interest", "regionOfInterest"],
    ["Drag a rectangle on the current input preview. Region Alerts will treat it as the restricted zone.", "roiHelp"],
    ["Region Alerts currently detects person intrusion inside one selected region. Draw a region and rerun preview to test the rule.", "roiDetailOne"],
    ["Objects outside the selected region are ignored for alerts.", "roiDetailTwo"],
    ["ROI selected", "roiSelected"],
    ["Clear ROI", "clearRoi"],
    ["Select a sample or upload a file first, then drag on the preview to define an ROI.", "roiEmptyState"],
    ["Run Preview", "runPreview"],
    ["Run Preview with Current Settings", "runPreview"],
    ["Process Again", "processAgain"],
    ["Running preview...", "runningPreview"],
    ["Output", "output"],
    ["Inference Preview", "inferencePreview"],
    ["Awaiting Input", "awaitingInput"],
    ["Generating preview...", "generatingPreview"],
    ["Detections", "detections"],
    ["No detections returned", "noDetectionsReturned"],
    ["Preview in Browser", "previewInBrowser"],
    ["Download Results", "downloadResults"],
    ["Integration Configuration", "integrationConfiguration"],
    ["Processing Mode", "processingMode"],
    ["Auto", "auto"],
    ["Manual", "manual"],
    ["Connect", "connect"],
    ["Reconnect", "reconnectMinio"],
    ["Reconnect MinIO", "reconnectMinio"],
    ["Connected", "connected"],
    ["Not Connected", "notConnected"],
    ["Manual Fetch & Process", "manualFetchProcess"],
    ["Select All", "selectAll"],
    ["Clear Selection", "clearSelection"],
    ["Fetch count", "fetchCount"],
    ["Fetch Videos", "fetchVideos"],
    ["Fetch Files", "fetchFiles"],
  ];
  const exactLookup = new Map();

  exactTextEntries.forEach(([text, key]) => {
    exactLookup.set(text, key);
    exactLookup.set(getRegionAlertsText("ar", key), key);
  });

  const processSelectedPatterns = [
    /^Process Selected(?: \((\d+)\))?$/,
    /^معالجة المحدد(?: \((\d+)\))?$/,
  ];
  const uploadPromptPatterns = [
    /^Drop files here or click to preview a sample inference for (.+)\.$/,
    /^أسقط الملفات هنا أو انقر لمعاينة استدلال تجريبي لـ (.+)\.$/,
  ];
  const runningInferencePatterns = [
    /^Running backend inference for (.+)\.$/,
    /^جارٍ تشغيل الاستدلال الخلفي لـ (.+)\.$/,
  ];
  const sourceLabelPatterns = [
    /^Source: (.+)$/,
    /^المصدر: (.+)$/,
  ];

  const leafElements = Array.from(container.querySelectorAll("button, div, h1, h2, h3, label, p, span, th"));

  leafElements.forEach((element) => {
    if (element.children.length > 0) return;
    const currentText = element.textContent?.trim();
    if (!currentText) return;

    const detectedExactKey = exactLookup.get(currentText);
    const cachedExactKey = element.dataset.regionAlertsI18nKey;
    const exactKey = detectedExactKey && liveStatusKeys.has(detectedExactKey)
      ? detectedExactKey
      : cachedExactKey || detectedExactKey;
    if (exactKey) {
      const nextText = getRegionAlertsText(language, exactKey);
      if (element.textContent !== nextText) element.textContent = nextText;
      element.dataset.regionAlertsI18nKey = exactKey;
      return;
    }

    const processMatch = processSelectedPatterns.map((pattern) => currentText.match(pattern)).find(Boolean);
    if (processMatch) {
      const count = Number(processMatch[1] || 0);
      const nextText = getRegionAlertsText(language, "processSelected", count);
      if (element.textContent !== nextText) element.textContent = nextText;
      return;
    }

    const uploadPromptMatch = uploadPromptPatterns.map((pattern) => currentText.match(pattern)).find(Boolean);
    if (uploadPromptMatch) {
      const nextText = getRegionAlertsText(language, "uploadPrompt", uploadPromptMatch[1]);
      if (element.textContent !== nextText) element.textContent = nextText;
      return;
    }

    const runningInferenceMatch = runningInferencePatterns.map((pattern) => currentText.match(pattern)).find(Boolean);
    if (runningInferenceMatch) {
      const nextText = getRegionAlertsText(language, "runningBackendInference", runningInferenceMatch[1]);
      if (element.textContent !== nextText) element.textContent = nextText;
      return;
    }

    const sourceLabelMatch = sourceLabelPatterns.map((pattern) => currentText.match(pattern)).find(Boolean);
    if (sourceLabelMatch) {
      const nextText = getRegionAlertsText(language, "sourceLabel", sourceLabelMatch[1]);
      if (element.textContent !== nextText) element.textContent = nextText;
    }
  });
}

function zonePointsNormalizedFromRoi(roi) {
  if (!roi) return null;
  return [
    [roi.x, roi.y],
    [roi.x + roi.width, roi.y],
    [roi.x + roi.width, roi.y + roi.height],
    [roi.x, roi.y + roi.height],
  ];
}

function roiFromZonePointsNormalized(zonePoints) {
  if (!Array.isArray(zonePoints) || zonePoints.length < 4) return null;

  const normalizedPoints = zonePoints
    .map((point) => (
      Array.isArray(point) && point.length === 2
        ? [Number(point[0]), Number(point[1])]
        : null
    ))
    .filter((point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]));

  if (normalizedPoints.length < 4) return null;

  const xs = normalizedPoints.map(([x]) => Math.max(0, Math.min(1, x)));
  const ys = normalizedPoints.map(([, y]) => Math.max(0, Math.min(1, y)));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;

  if (width < 0.01 || height < 0.01) return null;

  return {
    x: minX,
    y: minY,
    width,
    height,
  };
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function buildRoiFromPoints(start, end) {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  if (width < 0.01 || height < 0.01) return null;
  return {
    x: clamp01(left),
    y: clamp01(top),
    width: clamp01(width),
    height: clamp01(height),
  };
}

function roiStyle(roi) {
  return {
    left: `${clamp01(roi?.x ?? 0) * 100}%`,
    top: `${clamp01(roi?.y ?? 0) * 100}%`,
    width: `${clamp01(roi?.width ?? 0) * 100}%`,
    height: `${clamp01(roi?.height ?? 0) * 100}%`,
  };
}

function resolveDisplayedVideoContentBox(videoElement) {
  if (!videoElement) return FULL_VIDEO_CONTENT_BOX;

  const rect = videoElement.getBoundingClientRect();
  const renderedWidth = rect.width || videoElement.clientWidth || 0;
  const renderedHeight = rect.height || videoElement.clientHeight || 0;
  if (renderedWidth <= 0 || renderedHeight <= 0) {
    return FULL_VIDEO_CONTENT_BOX;
  }

  const naturalWidth = Number(videoElement.videoWidth) || 0;
  const naturalHeight = Number(videoElement.videoHeight) || 0;
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return FULL_VIDEO_CONTENT_BOX;
  }

  const naturalAspectRatio = naturalWidth / naturalHeight;
  const renderedAspectRatio = renderedWidth / renderedHeight;
  let contentWidth = renderedWidth;
  let contentHeight = renderedHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (renderedAspectRatio > naturalAspectRatio) {
    contentHeight = renderedHeight;
    contentWidth = contentHeight * naturalAspectRatio;
    offsetX = (renderedWidth - contentWidth) / 2;
  } else if (renderedAspectRatio < naturalAspectRatio) {
    contentWidth = renderedWidth;
    contentHeight = contentWidth / naturalAspectRatio;
    offsetY = (renderedHeight - contentHeight) / 2;
  }

  return {
    left: clamp01(offsetX / renderedWidth),
    top: clamp01(offsetY / renderedHeight),
    width: clamp01(contentWidth / renderedWidth),
    height: clamp01(contentHeight / renderedHeight),
  };
}

function videoContentBoxStyle(contentBox) {
  const box = contentBox ?? FULL_VIDEO_CONTENT_BOX;
  return {
    left: `${clamp01(box.left) * 100}%`,
    top: `${clamp01(box.top) * 100}%`,
    width: `${clamp01(box.width) * 100}%`,
    height: `${clamp01(box.height) * 100}%`,
  };
}

function buildRegionAlertRectanglePayload(roi) {
  if (!roi) return null;

  const x1 = clamp01(roi.x);
  const y1 = clamp01(roi.y);
  const x2 = clamp01((roi.x ?? 0) + (roi.width ?? 0));
  const y2 = clamp01((roi.y ?? 0) + (roi.height ?? 0));

  if (x2 <= x1 || y2 <= y1) return null;

  // Future polygon ROI mode can reuse the same normalized video-content space.
  return {
    type: "rectangle",
    normalized: true,
    x1,
    y1,
    x2,
    y2,
  };
}

function cloneDefaultRegionAlertsRoiPayload() {
  return { ...DEFAULT_REGION_ALERT_ROI_PAYLOAD };
}

function roiPayloadToDisplayRoi(roiPayload) {
  if (!roiPayload || typeof roiPayload !== "object") return null;

  if (Number.isFinite(roiPayload.x1) && Number.isFinite(roiPayload.y1) && Number.isFinite(roiPayload.x2) && Number.isFinite(roiPayload.y2)) {
    const x1 = clamp01(roiPayload.x1);
    const y1 = clamp01(roiPayload.y1);
    const x2 = clamp01(roiPayload.x2);
    const y2 = clamp01(roiPayload.y2);
    if (x2 <= x1 || y2 <= y1) return null;
    return {
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
    };
  }

  if (Number.isFinite(roiPayload.x) && Number.isFinite(roiPayload.y) && Number.isFinite(roiPayload.width) && Number.isFinite(roiPayload.height)) {
    return buildRoiFromPoints(
      { x: clamp01(roiPayload.x), y: clamp01(roiPayload.y) },
      { x: clamp01((roiPayload.x ?? 0) + (roiPayload.width ?? 0)), y: clamp01((roiPayload.y ?? 0) + (roiPayload.height ?? 0)) },
    );
  }

  if (Array.isArray(roiPayload.points)) {
    return roiFromZonePointsNormalized(
      roiPayload.points.map((point) => (
        point && typeof point === "object" && !Array.isArray(point)
          ? [point.x, point.y]
          : point
      )),
    );
  }

  return null;
}

function zonePointsNormalizedFromRoiPayload(roiPayload) {
  if (!roiPayload || typeof roiPayload !== "object") {
    return zonePointsNormalizedFromRoi(DEFAULT_REGION_ALERT_PLAYGROUND_ROI);
  }

  if (Array.isArray(roiPayload.points) && roiPayload.points.length >= 4) {
    return roiPayload.points
      .map((point) => (
        point && typeof point === "object" && !Array.isArray(point)
          ? [clamp01(point.x), clamp01(point.y)]
          : Array.isArray(point) && point.length === 2
            ? [clamp01(point[0]), clamp01(point[1])]
            : null
      ))
      .filter(Boolean);
  }

  const normalizedRectangle = Number.isFinite(roiPayload.x1)
    ? roiPayload
    : buildRegionAlertRectanglePayload(roiPayloadToDisplayRoi(roiPayload));
  if (!normalizedRectangle) {
    return zonePointsNormalizedFromRoi(DEFAULT_REGION_ALERT_PLAYGROUND_ROI);
  }

  return [
    [normalizedRectangle.x1, normalizedRectangle.y1],
    [normalizedRectangle.x2, normalizedRectangle.y1],
    [normalizedRectangle.x2, normalizedRectangle.y2],
    [normalizedRectangle.x1, normalizedRectangle.y2],
  ];
}

function buildRegionAlertsSelectedRoi(mode, roiPayload) {
  if (mode === "manual") {
    const normalizedManualPayload = Number.isFinite(roiPayload?.x1)
      ? {
          type: "rectangle",
          normalized: true,
          x1: clamp01(roiPayload.x1),
          y1: clamp01(roiPayload.y1),
          x2: clamp01(roiPayload.x2),
          y2: clamp01(roiPayload.y2),
        }
      : buildRegionAlertRectanglePayload(roiPayloadToDisplayRoi(roiPayload));
    if (normalizedManualPayload) {
      return {
        mode: "manual",
        roi: normalizedManualPayload,
      };
    }
  }

  return {
    mode: "default",
    roi: cloneDefaultRegionAlertsRoiPayload(),
  };
}

function isDefaultRegionAlertsRoiSelection(selection) {
  const roiPayload = selection?.roi;
  if (!roiPayload || !Number.isFinite(roiPayload.x1) || !Number.isFinite(roiPayload.y1) || !Number.isFinite(roiPayload.x2) || !Number.isFinite(roiPayload.y2)) {
    return true;
  }

  return (
    clamp01(roiPayload.x1) === DEFAULT_REGION_ALERT_ROI_PAYLOAD.x1
    && clamp01(roiPayload.y1) === DEFAULT_REGION_ALERT_ROI_PAYLOAD.y1
    && clamp01(roiPayload.x2) === DEFAULT_REGION_ALERT_ROI_PAYLOAD.x2
    && clamp01(roiPayload.y2) === DEFAULT_REGION_ALERT_ROI_PAYLOAD.y2
  );
}

function formatRegionAlertTriggerType(triggerType, language = "en") {
  return triggerType === "exit"
    ? getRegionAlertsText(language, "zoneExit")
    : getRegionAlertsText(language, "zoneEntry");
}

function getRegionAlertIntrusionLabel(value, language = "en") {
  const option = REGION_ALERT_INTRUSION_TYPE_OPTIONS.find((item) => item.value === value);
  if (!option) return getRegionAlertsText(language, "personIntrusion");
  return option.key ? getRegionAlertsText(language, option.key) : option.label;
}

function formatRegionAlertViolationCount(value, language = "en") {
  return formatRegionAlertsViolationCountForLanguage(value, resolveRegionAlertsLanguage(language));
}

function RegionAlertsIntegrationDemoControls({
  intrusionType,
  language = "en",
  onIntrusionTypeChange,
  onRuleConfigChange,
  onSave,
  onZoneChange,
  roiSelection,
  ruleConfig,
  saveMessage,
  selectedZone,
}) {
  const safeRuleConfig = normalizeRegionAlertsRuleConfig(ruleConfig);
  const t = (key, ...args) => getRegionAlertsText(language, key, ...args);
  const roiSourceLabel = roiSelection?.mode === "manual" ? t("manualRoiSelected") : t("defaultRoiSource");

  return (
    <div className="mt-5 space-y-4" dir={language === "ar" ? "rtl" : undefined}>
      <div className="rounded-2xl border border-brandBlue/10 bg-brandBlue/[0.03] px-4 py-4 text-sm text-slate-600">
        {t("regionAlertsControlsHint")}
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-700">
        <span className="font-semibold text-slate-900">{t("roiSource")}:</span>{" "}
        <span>{roiSourceLabel}</span>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <label className="block rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <span className="block text-sm font-semibold text-slate-700">{t("zone")}</span>
          <select
            className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-brandBlue"
            value={selectedZone}
            onChange={(event) => onZoneChange(event.target.value)}
          >
            {REGION_ALERT_ZONE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold text-slate-700">{t("triggerType")}</div>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800">
            {formatRegionAlertTriggerType(safeRuleConfig.trigger_type, language)}
          </div>
          <p className="mt-2 text-xs text-slate-500">{t("currentTriggerBehavior")}</p>
        </div>

        <label className="block rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <span className="block text-sm font-semibold text-slate-700">{t("detectionTypeIntrusionType")}</span>
          <select
            className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-brandBlue"
            value={intrusionType}
            onChange={(event) => onIntrusionTypeChange(event.target.value)}
          >
            {REGION_ALERT_INTRUSION_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{getRegionAlertIntrusionLabel(option.value, language)}</option>
            ))}
          </select>
        </label>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-semibold text-slate-700" htmlFor="region-alert-confidence-cleanup">
              {t("minimumConfidence")}
            </label>
            <input
              id="region-alert-confidence-cleanup-number"
              className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm text-slate-700 outline-none focus:border-brandBlue"
              max="1"
              min="0.1"
              step="0.05"
              type="number"
              value={safeRuleConfig.confidence_threshold}
              onChange={(event) => onRuleConfigChange({ ...safeRuleConfig, confidence_threshold: Number(event.target.value) })}
            />
          </div>
          <input
            id="region-alert-confidence-cleanup"
            className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-brandBlue"
            max="1"
            min="0.1"
            step="0.05"
            type="range"
            value={safeRuleConfig.confidence_threshold}
            onChange={(event) => onRuleConfigChange({ ...safeRuleConfig, confidence_threshold: Number(event.target.value) })}
          />
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span>0.1</span>
            <span>1.0</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 xl:col-span-2">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center justify-between gap-3 lg:min-w-[20rem]">
              <label className="text-sm font-semibold text-slate-700" htmlFor="region-alert-violations-cleanup">
                {t("triggerAlertAfterNViolations")}
              </label>
              <input
                id="region-alert-violations-cleanup-number"
                className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm text-slate-700 outline-none focus:border-brandBlue"
                max="10"
                min="0"
                step="1"
                type="number"
                value={safeRuleConfig.alert_delay_sec}
                onChange={(event) => onRuleConfigChange({ ...safeRuleConfig, alert_delay_sec: Number(event.target.value) })}
              />
            </div>
            <div className="text-sm font-semibold text-brandBlue">{formatRegionAlertViolationCount(safeRuleConfig.alert_delay_sec, language)}</div>
          </div>
          <input
            id="region-alert-violations-cleanup"
            className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-brandBlue"
            max="10"
            min="0"
            step="1"
            type="range"
            value={safeRuleConfig.alert_delay_sec}
            onChange={(event) => onRuleConfigChange({ ...safeRuleConfig, alert_delay_sec: Number(event.target.value) })}
          />
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span>0</span>
            <span>10</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-xl bg-brandBlue px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95"
          onClick={onSave}
          type="button"
        >
          {t("saveConfiguration")}
        </button>
        {saveMessage ? (
          <span className="rounded-full border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
            {saveMessage}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function RegionAlertsIntegrationDemoSummary({ intrusionType, language = "en", roiSelection, ruleConfig, selectedZone }) {
  const safeRuleConfig = normalizeRegionAlertsRuleConfig(ruleConfig);
  const t = (key, ...args) => getRegionAlertsText(language, key, ...args);
  const summaryRows = [
    [t("roiSource"), roiSelection?.mode === "manual" ? t("manualRoiSelected") : t("defaultRoiSource")],
    [t("zone"), selectedZone],
    [t("triggerType"), formatRegionAlertTriggerType(safeRuleConfig.trigger_type, language)],
    [t("detectionTypeIntrusionType"), getRegionAlertIntrusionLabel(intrusionType, language)],
    [t("minimumConfidence"), safeRuleConfig.confidence_threshold.toFixed(2)],
    [t("triggerAlertAfterNViolations"), formatRegionAlertViolationCount(safeRuleConfig.alert_delay_sec, language)],
  ];

  return (
    <div className="mt-5 grid gap-3" dir={language === "ar" ? "rtl" : undefined}>
      {summaryRows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
          <div className="text-sm font-semibold text-slate-800">{value}</div>
        </div>
      ))}
    </div>
  );
}

function RegionAlertsPlaygroundInputPanel({
  effectiveRoi,
  hasProcessedOutput,
  helperMessage,
  isProcessing,
  language = "en",
  manualRoi,
  onClearManualRoi,
  onProcess,
  onRoiModeChange,
  onUploadFile,
  onVideoPointerDown,
  onVideoPointerLeave,
  onVideoPointerMove,
  onVideoPointerUp,
  roiDraft,
  roiMode,
  uploadedFile,
  uploadedVideoUrl,
}) {
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const hasUploadedVideo = Boolean(uploadedFile && uploadedVideoUrl);
  const [videoContentBox, setVideoContentBox] = useState(FULL_VIDEO_CONTENT_BOX);
  const isArabic = language === "ar";
  const t = (key, ...args) => getRegionAlertsText(language, key, ...args);
  const overlayLabel = roiMode === "manual" && manualRoi
    ? (isArabic ? "منطقة اهتمام يدوية" : "Manual ROI")
    : (isArabic ? "منطقة الاهتمام الافتراضية" : "Default ROI");
  const interactiveVideoStyle = videoContentBoxStyle(videoContentBox);

  useEffect(() => {
    if (!hasUploadedVideo) {
      setVideoContentBox(FULL_VIDEO_CONTENT_BOX);
      return undefined;
    }

    const videoElement = videoRef.current;
    if (!videoElement) return undefined;

    const syncVideoContentBox = () => {
      setVideoContentBox(resolveDisplayedVideoContentBox(videoElement));
    };

    syncVideoContentBox();
    videoElement.addEventListener("loadedmetadata", syncVideoContentBox);
    videoElement.addEventListener("loadeddata", syncVideoContentBox);

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => syncVideoContentBox())
      : null;
    resizeObserver?.observe(videoElement);
    window.addEventListener("resize", syncVideoContentBox);

    return () => {
      videoElement.removeEventListener("loadedmetadata", syncVideoContentBox);
      videoElement.removeEventListener("loadeddata", syncVideoContentBox);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncVideoContentBox);
    };
  }, [hasUploadedVideo, uploadedVideoUrl]);

  return (
    <div className="mt-5 space-y-5" dir={isArabic ? "rtl" : undefined}>
      <div className="rounded-2xl border border-brandBlue/10 bg-brandBlue/[0.03] px-4 py-4 text-sm text-slate-600">
        {isArabic
          ? "ارفع فيديو تنبيهات المناطق يدوياً، وراجع الإدخال على اليسار، واحتفظ بالمخرجات المعالجة على اليمين."
          : "Upload a Region Alerts video manually, review the input on the left, and keep the processed output on the right."}
      </div>

      <input
        ref={fileInputRef}
        accept="video/*,.mp4,.avi,.mov,.mkv,.webm"
        className="hidden"
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          onUploadFile(file);
          event.target.value = "";
        }}
      />

      {hasUploadedVideo ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">{t("regionOfInterest")}</div>
              <p className="mt-1 text-sm text-slate-500">
                {isArabic
                  ? "اختر منطقة الاهتمام الافتراضية في المنتصف أو ارسم منطقة يدوية مباشرة فوق فيديو الإدخال المرفوع."
                  : "Choose the default center ROI or draw a manual region directly on the uploaded input video."}
              </p>
            </div>
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
              {[
                { value: "default", label: isArabic ? "منطقة الاهتمام الافتراضية" : "Default ROI" },
                { value: "manual", label: isArabic ? "تحديد منطقة الاهتمام يدوياً" : "Select ROI manually" },
              ].map((option) => (
                <button
                  key={option.value}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    roiMode === option.value ? "bg-slate-50 text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                  onClick={() => onRoiModeChange(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
            <video
              ref={videoRef}
              className="block h-72 w-full object-contain"
              controls
              muted
              playsInline
              src={uploadedVideoUrl}
            />
            {effectiveRoi ? (
              <div className="pointer-events-none absolute" style={interactiveVideoStyle}>
                <div className="absolute border-2 border-dashed border-amber-300 bg-amber-300/10" style={roiStyle(effectiveRoi)}>
                  <span className="absolute left-0 top-0 bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">{overlayLabel}</span>
                </div>
              </div>
            ) : null}
            {roiMode === "manual" ? (
              <div
                className="absolute cursor-crosshair touch-none"
                style={interactiveVideoStyle}
                onPointerDown={onVideoPointerDown}
                onPointerLeave={onVideoPointerLeave}
                onPointerMove={onVideoPointerMove}
                onPointerUp={onVideoPointerUp}
              >
                {roiDraft ? (
                  <div className="absolute border-2 border-dashed border-white bg-white/10" style={roiStyle(roiDraft)} />
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">{t("uploadedFilePrefix")}: {uploadedFile.name}</div>
              <p className="mt-1 text-sm text-slate-500">{helperMessage}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-brandBlue/30"
                disabled={roiMode !== "manual" || !manualRoi}
                onClick={onClearManualRoi}
                type="button"
              >
                {isArabic ? "مسح منطقة الاهتمام اليدوية" : "Clear Manual ROI"}
              </button>
              <button
                className="rounded-xl border border-brandBlue px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlue hover:text-white"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                {isArabic ? "رفع فيديو آخر" : "Upload Another Video"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          className="flex h-72 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center transition hover:border-brandBlue hover:bg-white"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            onUploadFile(event.dataTransfer.files?.[0]);
          }}
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          <div className="mb-3 rounded-full bg-white p-4 shadow-sm">
            <div className="h-8 w-8 rounded-lg border border-brandBlue/20 bg-brandBlue/5" />
          </div>
          <div className="text-lg font-semibold text-slate-900">{isArabic ? "رفع فيديو الإدخال" : "Upload input video"}</div>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
            {isArabic
              ? "اختر أو أسقط هنا فيديو لتنبيهات المناطق لمعاينة تدفق الإدخال وتحديد منطقة الاهتمام قبل المعالجة."
              : "Select or drop a Region Alerts video here to preview the input stream and define an ROI before processing."}
          </p>
        </button>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-xl bg-brandBlue px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!uploadedFile || isProcessing}
          onClick={onProcess}
          type="button"
        >
          {isProcessing ? t("runningPreview") : t(hasProcessedOutput ? "processAgain" : "runPreview")}
        </button>
        {roiMode === "manual" && !manualRoi && uploadedFile ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-700">
            {isArabic
              ? "لم يتم تحديد منطقة يدوية بعد. سيتم استخدام منطقة الاهتمام الافتراضية ما لم ترسم منطقة فوق الفيديو المرفوع."
              : "No manual region selected yet. Default ROI will be used unless you draw one on the uploaded video."}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function normalizeRegionAlertsRuleConfig(ruleConfig) {
  if (!ruleConfig || typeof ruleConfig !== "object") {
    return DEFAULT_REGION_ALERT_RULE_CONFIG;
  }

  const triggerType = ruleConfig.trigger_type === "exit" ? "exit" : "enter";
  const alertDelay = Number(ruleConfig.alert_delay_sec);
  const confidenceThreshold = Number(ruleConfig.confidence_threshold);

  return {
    trigger_type: triggerType,
    alert_delay_sec: Number.isFinite(alertDelay) ? Math.max(0, Math.min(10, Math.round(alertDelay))) : 0,
    confidence_threshold: Number.isFinite(confidenceThreshold)
      ? Math.max(0.1, Math.min(1, Math.round(confidenceThreshold * 100) / 100))
      : 0.5,
    alerts_enabled: typeof ruleConfig.alerts_enabled === "boolean"
      ? ruleConfig.alerts_enabled
      : true,
  };
}

function isVisibleFrontendSection(sectionLabel) {
  return String(sectionLabel || "").trim().toLowerCase() !== "customer experience";
}

function getPresentationUseCase(useCase, language = "en") {
  if (!useCase) return useCase;
  if (useCase.id === "region-alerts") {
    return {
      ...useCase,
      title: getRegionAlertsText(language, "title"),
      description: getRegionAlertsText(language, "description"),
    };
  }
  return {
    ...useCase,
    title: String(useCase.title || "").replace(/\bSutherland Hub\b|\bSouthernland Hub\b|\bSoutherntherland Hub\b|\bSutherland V Hub\b/gi, "Sutherland Vision Hub"),
    description: String(useCase.description || "").replace(/\bSutherland Hub\b|\bSouthernland Hub\b|\bSoutherntherland Hub\b|\bSutherland V Hub\b/gi, "Sutherland Vision Hub"),
  };
}

function getPresentationDetections(useCaseId, detections) {
  if (!Array.isArray(detections)) return [];
  if (useCaseId !== "region-alerts") return detections;

  return detections.map((detection, index) => {
    const row = {
      "Intrusion Event": String(detection?.event_type || detection?.alert_type || `Intrusion ${index + 1}`),
    };
    const severity = detection?.severity || detection?.alert_severity || detection?.risk_level;
    const zone = detection?.zone || detection?.zone_name || detection?.region || detection?.area;
    const detectedClass = detection?.detected_class || detection?.class_name || detection?.object_type || detection?.label || detection?.object || detection?.class;

    if (severity) row.Severity = severity;
    if (zone) row.Zone = zone;
    if (detectedClass) row["Detected Class"] = String(detectedClass).replaceAll("_", " ");

    return row;
  });
}

function looksLikeVideoUrl(value) {
  const normalized = String(value || "").split("?")[0].split("#")[0].toLowerCase();
  return [".mp4", ".webm", ".mov", ".avi", ".mkv"].some((extension) => normalized.endsWith(extension));
}

function firstNonEmptyField(payload, fieldNames) {
  for (const fieldName of fieldNames) {
    const value = payload?.[fieldName];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function resolvePreviewAssetUrl(value) {
  if (!value) return "";
  if (String(value).startsWith("data:")) return value;
  return resolveBackendUrl(String(value));
}

function countRegionAlertIntrusions(payload) {
  const explicitCountCandidates = [
    payload?.intrusion_count,
    payload?.intrusionCount,
    payload?.total_intrusions,
    payload?.totalIntrusions,
    payload?.summary?.intrusion_count,
    payload?.summary?.total_intrusions,
  ];

  for (const candidate of explicitCountCandidates) {
    const count = Number(candidate);
    if (Number.isFinite(count) && count >= 0) return count;
  }

  if (Array.isArray(payload?.events)) {
    return payload.events.length;
  }

  if (Array.isArray(payload?.detections)) {
    return payload.detections.length;
  }

  return 0;
}

function buildRegionAlertDetectionSummary(payload, language = "en") {
  const intrusionCount = countRegionAlertIntrusions(payload);
  return [
    {
      class: language === "ar"
        ? `عدد حالات التسلل: ${intrusionCount}`
        : `Number of intrusions: ${intrusionCount}`,
      object_type: "summary",
    },
  ];
}

function resolvePlaygroundPreviewMedia(payload) {
  const explicitVideoUrl = firstNonEmptyField(payload, [
    "output_video_url",
    "outputVideoUrl",
    "output_video_link",
    "outputVideoLink",
    "processed_video_url",
    "processedVideoUrl",
    "result_video_url",
    "resultVideoUrl",
    "video_url",
    "videoUrl",
  ]);
  const genericOutputUrl = firstNonEmptyField(payload, ["output_url", "outputUrl"]);
  const selectedVideoUrl = explicitVideoUrl || (looksLikeVideoUrl(genericOutputUrl) ? genericOutputUrl : "");
  const selectedImageUrl = firstNonEmptyField(payload, [
    "output_image_url",
    "outputImageUrl",
    "preview_image_url",
    "previewImageUrl",
    "frame_url",
    "frameUrl",
    "annotated_frame_url",
    "annotatedFrameUrl",
    "image_url",
    "imageUrl",
  ]);
  const selectedImageBase64 = firstNonEmptyField(payload, [
    "image_base64",
    "imageBase64",
    "preview_image_base64",
    "previewImageBase64",
    "output_image_base64",
    "outputImageBase64",
  ]);

  return {
    outputVideoUrl: selectedVideoUrl ? resolvePreviewAssetUrl(selectedVideoUrl) : "",
    imageBase64: selectedImageBase64 || resolvePreviewAssetUrl(selectedImageUrl),
  };
}

function normalizePlaygroundMetrics(useCaseId, payload) {
  const baseMetrics = payload?.metrics && typeof payload.metrics === "object" ? payload.metrics : null;

  if (useCaseId !== "crack-detection") {
    return baseMetrics;
  }

  const normalizedMetrics = baseMetrics ? { ...baseMetrics } : {};
  const detectionCount = Number(
    normalizedMetrics.total_defects
    ?? normalizedMetrics.defect_count
    ?? normalizedMetrics.crack_count
    ?? normalizedMetrics.detections_count
    ?? normalizedMetrics.crack_detections
    ?? payload?.total_defects
    ?? payload?.defect_count
    ?? payload?.crack_count
    ?? payload?.crack_detections
    ?? 0
  );
  const hasDetections = Number.isFinite(detectionCount) ? detectionCount > 0 : false;

  [
    "total_defects",
    "defect_detected",
    "defect_count",
    "defect_type_counts",
    "crack_count",
    "detections_count",
    "frames_analyzed",
    "frames_with_defects",
    "crack_detections",
    "defect_rate_pct",
    "frames_with_cracks",
    "crack_rate_pct",
    "max_confidence",
    "avg_confidence",
    "severity",
    "highest_severity",
    "max_severity_label",
  ].forEach((fieldName) => {
    if (payload?.[fieldName] !== undefined && normalizedMetrics[fieldName] === undefined) {
      normalizedMetrics[fieldName] = payload[fieldName];
    }
  });

  if (normalizedMetrics.total_defects === undefined && Number.isFinite(detectionCount)) {
    normalizedMetrics.total_defects = detectionCount;
  }
  if (normalizedMetrics.defect_count === undefined && Number.isFinite(detectionCount)) {
    normalizedMetrics.defect_count = detectionCount;
  }
  if (normalizedMetrics.defect_detected === undefined) {
    if (typeof payload?.defect_detected === "boolean") {
      normalizedMetrics.defect_detected = payload.defect_detected;
    } else if (typeof normalizedMetrics.crack_detected === "boolean") {
      normalizedMetrics.defect_detected = normalizedMetrics.crack_detected;
    } else if (typeof payload?.crack_detected === "boolean") {
      normalizedMetrics.defect_detected = payload.crack_detected;
    } else if (Number.isFinite(detectionCount)) {
      normalizedMetrics.defect_detected = hasDetections;
    }
  }
  if (normalizedMetrics.frames_with_defects === undefined && normalizedMetrics.frames_with_cracks !== undefined) {
    normalizedMetrics.frames_with_defects = normalizedMetrics.frames_with_cracks;
  }
  if (normalizedMetrics.defect_rate_pct === undefined && normalizedMetrics.crack_rate_pct !== undefined) {
    normalizedMetrics.defect_rate_pct = normalizedMetrics.crack_rate_pct;
  }

  return Object.keys(normalizedMetrics).length > 0 ? normalizedMetrics : null;
}

function buildPlaygroundSuccessState(useCaseId, payload, sourceLabel, language = "en") {
  const media = resolvePlaygroundPreviewMedia(payload);
  const detections = useCaseId === "region-alerts"
    ? buildRegionAlertDetectionSummary(payload, language)
    : getPresentationDetections(useCaseId, payload?.detections);
  const metrics = normalizePlaygroundMetrics(useCaseId, payload);
  const hasRenderableMedia = Boolean(media.outputVideoUrl || media.imageBase64);

  if (useCaseId === "region-alerts" && !hasRenderableMedia) {
    return {
      status: "error",
      imageBase64: "",
      outputVideoUrl: "",
      detections,
      metrics,
      sourceLabel,
      error: "Preview completed, but no processed output video was returned by the API.",
    };
  }

  return {
    status: "success",
    imageBase64: media.imageBase64,
    outputVideoUrl: media.outputVideoUrl,
    detections,
    metrics,
    sourceLabel,
    error: "",
  };
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <VisionLabPage />
    </Suspense>
  );
}

function VisionLabPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const regionAlertsDetailHostRef = useRef(null);
  const [selectedSample, setSelectedSample] = useState(null);
  const [regionAlertsLanguage, setRegionAlertsLanguage] = useState(readStoredRegionAlertsLanguage);
  const [playgroundState, setPlaygroundState] = useState({
    status: "idle",
    imageBase64: "",
    outputVideoUrl: "",
    detections: [],
    metrics: null,
    sourceLabel: "",
    error: "",
  });
  const [regionAlertsRoi, setRegionAlertsRoi] = useState(DEFAULT_REGION_ALERT_PLAYGROUND_ROI);
  const [selectedRegionAlertsRoi, setSelectedRegionAlertsRoi] = useState(() => buildRegionAlertsSelectedRoi("default"));
  const [regionAlertsRuleConfig, setRegionAlertsRuleConfig] = useState(DEFAULT_REGION_ALERT_RULE_CONFIG);
  const [isRegionAlertsRoiDirty, setIsRegionAlertsRoiDirty] = useState(false);
  const [isRegionAlertsRuleConfigDirty, setIsRegionAlertsRuleConfigDirty] = useState(false);
  const [integrationForm, setIntegrationForm] = useState({
    endpoint: "http://127.0.0.1:9000",
    access_key: "demo-access-key",
    secret_key: "demo-secret-key",
    bucket: "vision-demo",
    input_prefix: "ppe/input/",
    output_prefix: "ppe/output/",
  });
  const [integrationOverview, setIntegrationOverview] = useState(buildEmptyIntegrationOverview);
  const [integrationModelState, setIntegrationModelState] = useState(buildEmptyIntegrationModelState);
  const [isConnectingIntegration, setIsConnectingIntegration] = useState(false);
  const [integrationError, setIntegrationError] = useState("");
  const [integrationMode, setIntegrationMode] = useState("manual");
  const [integrationManualModelMode, setIntegrationManualModelMode] = useState("active");
  const [integrationAutoModelMode, setIntegrationAutoModelMode] = useState("active");
  const [integrationFetchCount, setIntegrationFetchCount] = useState(() => (
    getDefaultIntegrationFetchCount(searchParams.get("usecase") ?? "ppe-detection")
  ));
  const [integrationFetchedVideos, setIntegrationFetchedVideos] = useState([]);
  const [selectedIntegrationVideos, setSelectedIntegrationVideos] = useState([]);
  const [isFetchingIntegrationVideos, setIsFetchingIntegrationVideos] = useState(false);
  const [isProcessingIntegrationVideos, setIsProcessingIntegrationVideos] = useState(false);
  const [integrationFetchMessage, setIntegrationFetchMessage] = useState("");
  const [integrationProcessMessage, setIntegrationProcessMessage] = useState("");
  const [expandedRunId, setExpandedRunId] = useState(null);
  const [regionAlertsSelectedZone, setRegionAlertsSelectedZone] = useState(REGION_ALERT_ZONE_OPTIONS[0]);
  const [regionAlertsIntrusionType, setRegionAlertsIntrusionType] = useState(REGION_ALERT_INTRUSION_TYPE_OPTIONS[0].value);
  const [regionAlertsDemoSaveMessage, setRegionAlertsDemoSaveMessage] = useState("");
  const [regionAlertsUiHosts, setRegionAlertsUiHosts] = useState({ controls: null, summary: null });
  const [regionAlertsPlaygroundUploadedFile, setRegionAlertsPlaygroundUploadedFile] = useState(null);
  const [regionAlertsPlaygroundUploadedVideoUrl, setRegionAlertsPlaygroundUploadedVideoUrl] = useState("");
  const [regionAlertsPlaygroundRoiMode, setRegionAlertsPlaygroundRoiMode] = useState("default");
  const [regionAlertsPlaygroundManualRoi, setRegionAlertsPlaygroundManualRoi] = useState(null);
  const [regionAlertsPlaygroundRoiDraft, setRegionAlertsPlaygroundRoiDraft] = useState(null);
  const [regionAlertsPlaygroundRoiStart, setRegionAlertsPlaygroundRoiStart] = useState(null);
  const [regionAlertsPlaygroundInputHost, setRegionAlertsPlaygroundInputHost] = useState(null);
  const [isRegionAlertsPreviewRunning, setIsRegionAlertsPreviewRunning] = useState(false);

  const currentView =
    searchParams.get("view") === "detail"
      ? "detail"
      : searchParams.get("view") === "usecases"
        ? "usecases"
        : "landing";

  const activeTab = tabParamToLabel[searchParams.get("tab")] ?? "Model Playground";
  const visibleSections = categoryDetails.filter((section) => isVisibleFrontendSection(section.label));
  const requestedSection = sectionParamToLabel[searchParams.get("section")] ?? "Safety & Compliance";
  const requestedUseCaseId = searchParams.get("usecase") ?? "ppe-detection";
  const matchedUseCase = useCases.find((useCase) => useCase.id === requestedUseCaseId) ?? useCases[0];
  const activeUseCaseId = matchedUseCase.id;
  const activeUseCase = getPresentationUseCase(
    matchedUseCase,
    activeUseCaseId === "region-alerts" ? regionAlertsLanguage : "en",
  );
  const isRegionAlertsDetailView = currentView === "detail" && activeUseCaseId === "region-alerts";
  const tRegionAlerts = (key, ...args) => getRegionAlertsText(regionAlertsLanguage, key, ...args);
  const updateRegionAlertsLanguage = (nextLanguage) => {
    const resolvedLanguage = resolveRegionAlertsLanguage(nextLanguage);
    setRegionAlertsLanguage(resolvedLanguage);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(REGION_ALERTS_LANGUAGE_STORAGE_KEY, resolvedLanguage);
    }
  };
  const activeSection = visibleSections.some((section) => section.label === requestedSection)
    ? requestedSection
    : isVisibleFrontendSection(matchedUseCase.category)
      ? matchedUseCase.category
      : visibleSections[0]?.label ?? matchedUseCase.category;
  const sampleMedia = sampleMediaByUseCase[activeUseCaseId] ?? [];

  const applyRegionAlertsDefaultSelection = ({ clearManual = false, markDirty = false } = {}) => {
    setSelectedRegionAlertsRoi(buildRegionAlertsSelectedRoi("default"));
    setRegionAlertsRoi(DEFAULT_REGION_ALERT_PLAYGROUND_ROI);
    setRegionAlertsPlaygroundRoiMode("default");
    if (clearManual) {
      setRegionAlertsPlaygroundManualRoi(null);
    }
    if (markDirty) {
      setIsRegionAlertsRoiDirty(true);
    }
  };

  const applyRegionAlertsManualSelection = (nextRoi, { markDirty = false } = {}) => {
    const normalizedManualPayload = buildRegionAlertRectanglePayload(nextRoi);
    if (!normalizedManualPayload) {
      applyRegionAlertsDefaultSelection({ markDirty });
      return;
    }
    setSelectedRegionAlertsRoi(buildRegionAlertsSelectedRoi("manual", normalizedManualPayload));
    setRegionAlertsRoi(nextRoi);
    setRegionAlertsPlaygroundManualRoi(nextRoi);
    setRegionAlertsPlaygroundRoiMode("manual");
    if (markDirty) {
      setIsRegionAlertsRoiDirty(true);
    }
  };

  const normalizeIntegrationOverview = (payload) => {
    const normalizedConnection = normalizeIntegrationConnection(payload);
    return {
      connected: isIntegrationConnectedPayload(payload) || Boolean(normalizedConnection),
      processing: Boolean(payload?.processing),
      message: payload?.message ?? "",
      last_sync_at: payload?.last_sync_at ?? null,
      connection: normalizedConnection,
      recent_runs: Array.isArray(payload?.recent_runs) ? payload.recent_runs : [],
      input_videos: Array.isArray(payload?.input_videos) ? payload.input_videos : [],
      output_videos: Array.isArray(payload?.output_videos) ? payload.output_videos : [],
      summary: payload?.summary && typeof payload.summary === "object" ? payload.summary : {},
    };
  };

  const buildRegionAlertsIntegrationPayload = () => (
    activeUseCaseId === "region-alerts"
      ? {
          zone_points_normalized: zonePointsNormalizedFromRoiPayload(selectedRegionAlertsRoi?.roi),
          rule_config: normalizeRegionAlertsRuleConfig(regionAlertsRuleConfig),
        }
      : {}
  );

  const handleRegionAlertsRoiChange = (nextRoi) => {
    if (nextRoi) {
      applyRegionAlertsManualSelection(nextRoi, { markDirty: true });
      return;
    }
    applyRegionAlertsDefaultSelection({ clearManual: true, markDirty: true });
  };

  const handleRegionAlertsRuleConfigChange = (nextConfig) => {
    setRegionAlertsRuleConfig(normalizeRegionAlertsRuleConfig(nextConfig));
    setIsRegionAlertsRuleConfigDirty(true);
    setRegionAlertsDemoSaveMessage("");
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      REGION_ALERTS_LANGUAGE_STORAGE_KEY,
      resolveRegionAlertsLanguage(regionAlertsLanguage),
    );
  }, [regionAlertsLanguage]);

  const handleRegionAlertsPlaygroundUpload = (file) => {
    if (!file) return;
    const contentType = String(file.type || "").toLowerCase();
    if (contentType && !contentType.startsWith("video/")) return;

    setIsRegionAlertsPreviewRunning(false);
    setRegionAlertsPlaygroundUploadedVideoUrl((current) => {
      if (current && current.startsWith("blob:")) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setRegionAlertsPlaygroundUploadedFile(file);
    setRegionAlertsPlaygroundRoiDraft(null);
    setRegionAlertsPlaygroundRoiStart(null);
    applyRegionAlertsDefaultSelection({ clearManual: true, markDirty: true });
    setSelectedSample(null);
    setPlaygroundState({
      status: "idle",
      imageBase64: "",
      outputVideoUrl: "",
      detections: [],
      metrics: null,
      sourceLabel: "",
      error: "",
    });
  };

  const getRegionAlertsPlaygroundPointerPoint = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / Math.max(rect.width, 1)),
      y: clamp01((event.clientY - rect.top) / Math.max(rect.height, 1)),
    };
  };

  const handleRegionAlertsPlaygroundPointerDown = (event) => {
    if (regionAlertsPlaygroundRoiMode !== "manual" || !regionAlertsPlaygroundUploadedVideoUrl) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = getRegionAlertsPlaygroundPointerPoint(event);
    setRegionAlertsPlaygroundRoiStart(point);
    setRegionAlertsPlaygroundRoiDraft(buildRoiFromPoints(point, point));
  };

  const handleRegionAlertsPlaygroundPointerMove = (event) => {
    if (!regionAlertsPlaygroundRoiStart) return;
    event.preventDefault();
    setRegionAlertsPlaygroundRoiDraft(buildRoiFromPoints(regionAlertsPlaygroundRoiStart, getRegionAlertsPlaygroundPointerPoint(event)));
  };

  const handleRegionAlertsPlaygroundPointerUp = (event) => {
    if (!regionAlertsPlaygroundRoiStart) return;
    event.preventDefault();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const nextRoi = buildRoiFromPoints(regionAlertsPlaygroundRoiStart, getRegionAlertsPlaygroundPointerPoint(event));
    setRegionAlertsPlaygroundRoiStart(null);
    setRegionAlertsPlaygroundRoiDraft(null);
    if (!nextRoi) {
      applyRegionAlertsDefaultSelection({ markDirty: true });
      return;
    }
    applyRegionAlertsManualSelection(nextRoi, { markDirty: true });
  };

  const handleRegionAlertsPlaygroundPointerLeave = () => {
    setRegionAlertsPlaygroundRoiStart(null);
    setRegionAlertsPlaygroundRoiDraft(null);
  };

  const handleRegionAlertsPlaygroundProcess = async () => {
    if (!regionAlertsPlaygroundUploadedFile) return;
    await runPlaygroundPreview(
      regionAlertsPlaygroundUploadedFile,
      `${tRegionAlerts("uploadedFilePrefix")}: ${regionAlertsPlaygroundUploadedFile.name}`,
      { roi: selectedRegionAlertsRoi?.roi ?? cloneDefaultRegionAlertsRoiPayload() },
    );
  };

  const fetchIntegrationOverview = async () => {
    if (!integrationSupportedUseCases.has(activeUseCaseId)) {
      setIntegrationOverview(buildEmptyIntegrationOverview());
      setIntegrationModelState(buildEmptyIntegrationModelState());
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/integrations/minio/status?use_case_id=${encodeURIComponent(activeUseCaseId)}`);
      if (!response.ok) throw new Error("Unable to load MinIO integration status.");
      const data = await response.json();
      const normalizedConnection = normalizeIntegrationConnection(data);
      setIntegrationOverview(normalizeIntegrationOverview(data));
      if (normalizedConnection) {
        setIntegrationForm((current) => ({
          ...current,
          endpoint: normalizedConnection.endpoint ?? current.endpoint,
          bucket: normalizedConnection.bucket ?? current.bucket,
          input_prefix: normalizedConnection.input_prefix ?? current.input_prefix,
          output_prefix: normalizedConnection.output_prefix ?? current.output_prefix,
        }));
        if (normalizedConnection.processing_mode) {
          setIntegrationMode(normalizedConnection.processing_mode);
        }
        if (activeUseCaseId === "region-alerts") {
          if (!isRegionAlertsRuleConfigDirty && normalizedConnection.rule_config !== undefined) {
            setRegionAlertsRuleConfig(normalizeRegionAlertsRuleConfig(normalizedConnection.rule_config));
          }
          if (!isRegionAlertsRoiDirty && normalizedConnection.zone_points_normalized !== undefined) {
            const nextDisplayRoi = roiFromZonePointsNormalized(normalizedConnection.zone_points_normalized);
            const nextSelection = buildRegionAlertsSelectedRoi("manual", buildRegionAlertRectanglePayload(nextDisplayRoi));
            if (isDefaultRegionAlertsRoiSelection(nextSelection)) {
              applyRegionAlertsDefaultSelection({ clearManual: true });
            } else {
              applyRegionAlertsManualSelection(nextDisplayRoi, { markDirty: false });
            }
          }
        }
      } else {
        const defaults = getIntegrationDefaults(activeUseCaseId);
        setIntegrationForm((current) => ({ ...current, input_prefix: defaults.input_prefix, output_prefix: defaults.output_prefix }));
        if (activeUseCaseId === "region-alerts") {
          if (!isRegionAlertsRuleConfigDirty) {
            setRegionAlertsRuleConfig(DEFAULT_REGION_ALERT_RULE_CONFIG);
          }
          if (!isRegionAlertsRoiDirty) {
            applyRegionAlertsDefaultSelection({ clearManual: true });
          }
        }
      }

      try {
        const modelStateResponse = await fetch(`${API_BASE_URL}/api/integrations/model-state/${encodeURIComponent(activeUseCaseId)}`);
        if (modelStateResponse.ok) {
          const modelStatePayload = await modelStateResponse.json();
          setIntegrationModelState(modelStatePayload);
          if (!modelStatePayload?.has_staged_model) {
            setIntegrationManualModelMode("active");
            setIntegrationAutoModelMode("active");
          }
        }
      } catch (modelStateError) {
        console.error(modelStateError);
      }

      setIntegrationError("");
    } catch (error) {
      setIntegrationError(error instanceof Error ? error.message : "Unable to load MinIO integration status.");
    }
  };

  const handleIntegrationFieldChange = (field, value) => {
    setIntegrationForm((current) => ({ ...current, [field]: value }));
  };

  const handleIntegrationConnect = async (modeOverride = integrationMode, modelModeOverride = null) => {
    const resolvedMode = modeOverride === "auto" || modeOverride === "manual" ? modeOverride : integrationMode;
    const requestedModelMode = resolvedMode === "auto" ? (modelModeOverride ?? integrationAutoModelMode) : "active";
    const requestedModelVersionId =
      requestedModelMode === "staging" ? integrationModelState.staged_model_version_id : null;
    setIsConnectingIntegration(true);
    setIntegrationError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/integrations/minio/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...integrationForm,
          use_case_id: activeUseCaseId,
          processing_mode: resolvedMode,
          model_mode: requestedModelMode,
          model_version_id: requestedModelVersionId,
          ...buildRegionAlertsIntegrationPayload(),
        }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.detail ?? "Unable to connect to MinIO.");
      }
      const data = await response.json();
      setIntegrationOverview(normalizeIntegrationOverview(data));
      setIntegrationMode(data?.connection?.processing_mode ?? resolvedMode);
      if (activeUseCaseId === "region-alerts") {
        setIsRegionAlertsRoiDirty(false);
        setIsRegionAlertsRuleConfigDirty(false);
      }
    } catch (error) {
      setIntegrationError(
        friendlyPlaygroundErrorMessage(error instanceof Error ? error.message : "Unable to connect to MinIO."),
      );
    } finally {
      setIsConnectingIntegration(false);
    }
  };

  const handleIntegrationModeChange = async (nextMode) => {
    setIntegrationMode(nextMode);
    setIntegrationFetchMessage("");
    setIntegrationProcessMessage("");
    if (!integrationOverview.connected) return;
    await handleIntegrationConnect(nextMode, nextMode === "auto" ? integrationAutoModelMode : "active");
  };

  const handleIntegrationAutoModelModeChange = async (nextMode) => {
    setIntegrationAutoModelMode(nextMode);
    setIntegrationProcessMessage("");
    if (!integrationOverview.connected || integrationMode !== "auto") return;
    await handleIntegrationConnect("auto", nextMode);
  };

  const handleIntegrationFetchVideos = async () => {
    if (!integrationSupportedUseCases.has(activeUseCaseId)) return;
    const requestedFetchCount = Number(integrationFetchCount) || getDefaultIntegrationFetchCount(activeUseCaseId);
    setIsFetchingIntegrationVideos(true);
    setIntegrationFetchMessage("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/integrations/minio/input-videos?use_case_id=${encodeURIComponent(activeUseCaseId)}&limit=${encodeURIComponent(String(requestedFetchCount))}`,
      );
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.detail ?? "Unable to fetch MinIO videos.");
      }
      const data = await response.json();
      const videos = Array.isArray(data?.videos) ? data.videos : [];
      const assetLabel = integrationAssetLabel(activeUseCaseId);
      setIntegrationFetchedVideos(videos);
      setSelectedIntegrationVideos((current) => current.filter((key) => videos.some((video) => video.object_key === key && video.status !== "completed" && video.status !== "processing")));
      setIntegrationFetchMessage(
        `Fetched ${Number(data?.fetched_count ?? videos.length)} ${assetLabel}${Number(data?.fetched_count ?? videos.length) === 1 ? "" : "s"} from ${activeUseCase.title} input storage.`,
      );
      setIntegrationError("");
    } catch (error) {
      setIntegrationFetchMessage(
        `✗ ${friendlyPlaygroundErrorMessage(error instanceof Error ? error.message : "Unable to fetch MinIO videos.")}`,
      );
    } finally {
      setIsFetchingIntegrationVideos(false);
    }
  };

  const handleIntegrationProcessSelected = async () => {
    if (selectedIntegrationVideos.length === 0) return;
    setIsProcessingIntegrationVideos(true);
    setIntegrationProcessMessage("");
    try {
      const requestedModelMode =
        integrationManualModelMode === "staging" && integrationModelState.has_staged_model ? "staging" : "active";
      const requestedModelVersionId =
        requestedModelMode === "staging" ? integrationModelState.staged_model_version_id : null;
      const response = await fetch(`${API_BASE_URL}/api/integrations/minio/process-selected`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          use_case_id: activeUseCaseId,
          object_keys: selectedIntegrationVideos,
          model_mode: requestedModelMode,
          model_version_id: requestedModelVersionId,
          model_mode: requestedModelMode,
          model_version_id: requestedModelVersionId,
          ...buildRegionAlertsIntegrationPayload(),
        }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.detail ?? "Unable to queue selected videos.");
      }
      const data = await response.json();
      if (data?.overview) {
        setIntegrationOverview(normalizeIntegrationOverview(data.overview));
      } else {
        await fetchIntegrationOverview();
      }
      const modelModeMessage =
        data?.model_mode_used === "staging"
          ? "Using for this request: Staged fine-tuned model."
          : "Using for this request: Current active model.";
      setIntegrationProcessMessage(`${data?.message ?? "Selected videos have been queued."} ${modelModeMessage}`.trim());
      setSelectedIntegrationVideos([]);
      if (activeUseCaseId === "region-alerts") {
        setIsRegionAlertsRoiDirty(false);
        setIsRegionAlertsRuleConfigDirty(false);
      }
      await handleIntegrationFetchVideos();
    } catch (error) {
      setIntegrationProcessMessage(
        `✗ ${friendlyPlaygroundErrorMessage(error instanceof Error ? error.message : "Unable to queue selected videos.")}`,
      );
    } finally {
      setIsProcessingIntegrationVideos(false);
    }
  };

  useEffect(() => {
    if (!integrationSupportedUseCases.has(activeUseCaseId)) return;
    fetchIntegrationOverview();
  }, [activeUseCaseId]);

  useEffect(() => {
    if (!integrationSupportedUseCases.has(activeUseCaseId) || !integrationOverview.connected) return;
    const poller = setInterval(fetchIntegrationOverview, 5000);
    return () => clearInterval(poller);
  }, [activeUseCaseId, integrationOverview.connected, integrationOverview.processing, isRegionAlertsRoiDirty, isRegionAlertsRuleConfigDirty]);

  useEffect(() => {
    setIntegrationFetchedVideos([]);
    setSelectedIntegrationVideos([]);
    setIntegrationFetchMessage("");
    setIntegrationProcessMessage("");
    setExpandedRunId(null);
  }, [activeUseCaseId]);

  useEffect(() => {
    setSelectedSample(null);
    setIsRegionAlertsPreviewRunning(false);
    setPlaygroundState({
      status: "idle",
      imageBase64: "",
      outputVideoUrl: "",
      detections: [],
      sourceLabel: "",
      error: "",
    });
    const defaults = getIntegrationDefaults(activeUseCaseId);
    setIntegrationOverview(buildEmptyIntegrationOverview());
    setIntegrationModelState(buildEmptyIntegrationModelState());
    setIntegrationForm((current) => ({
      ...current,
      input_prefix: defaults.input_prefix,
      output_prefix: defaults.output_prefix,
    }));
    setIntegrationMode("manual");
    setIntegrationManualModelMode("active");
    setIntegrationAutoModelMode("active");
    setIntegrationError("");
    setIntegrationFetchMessage("");
    setIntegrationProcessMessage("");
    setIntegrationFetchCount(getDefaultIntegrationFetchCount(activeUseCaseId));
    setRegionAlertsRuleConfig(DEFAULT_REGION_ALERT_RULE_CONFIG);
    setIsRegionAlertsRoiDirty(false);
    setIsRegionAlertsRuleConfigDirty(false);
    setRegionAlertsSelectedZone(REGION_ALERT_ZONE_OPTIONS[0]);
    setRegionAlertsIntrusionType(REGION_ALERT_INTRUSION_TYPE_OPTIONS[0].value);
    setRegionAlertsDemoSaveMessage("");
    setRegionAlertsPlaygroundUploadedFile(null);
    setRegionAlertsPlaygroundUploadedVideoUrl("");
    setRegionAlertsRoi(DEFAULT_REGION_ALERT_PLAYGROUND_ROI);
    setSelectedRegionAlertsRoi(buildRegionAlertsSelectedRoi("default"));
    setRegionAlertsPlaygroundRoiMode("default");
    setRegionAlertsPlaygroundManualRoi(null);
    setRegionAlertsPlaygroundRoiDraft(null);
    setRegionAlertsPlaygroundRoiStart(null);
  }, [activeUseCaseId]);

  useEffect(() => {
    return () => {
      if (regionAlertsPlaygroundUploadedVideoUrl && regionAlertsPlaygroundUploadedVideoUrl.startsWith("blob:")) {
        URL.revokeObjectURL(regionAlertsPlaygroundUploadedVideoUrl);
      }
    };
  }, [regionAlertsPlaygroundUploadedVideoUrl]);

  useEffect(() => {
    if (activeUseCaseId !== "region-alerts" || activeTab !== "Integration" || currentView !== "detail") {
      setRegionAlertsUiHosts({ controls: null, summary: null });
      return;
    }

    const mountHosts = () => {
      const headingNodes = Array.from(document.querySelectorAll("h3"));
      const rulesHeading = headingNodes.find((node) => (
        [getRegionAlertsText("en", "alertRules"), getRegionAlertsText("ar", "alertRules")].includes(node.textContent?.trim())
      ));
      const summaryHeading = headingNodes.find((node) => (
        [getRegionAlertsText("en", "activeRegionAlertConfiguration"), getRegionAlertsText("ar", "activeRegionAlertConfiguration")].includes(node.textContent?.trim())
      ));
      const rulesSection = rulesHeading?.closest("section");
      const summarySection = summaryHeading?.closest("section");

      if (!rulesSection || !summarySection) return;

      Array.from(rulesSection.children).forEach((child, index) => {
        if (index > 0 && !child.hasAttribute("data-region-alerts-demo-controls-host")) {
          child.style.display = "none";
        }
      });
      Array.from(summarySection.children).forEach((child, index) => {
        if (index > 0 && !child.hasAttribute("data-region-alerts-demo-summary-host")) {
          child.style.display = "none";
        }
      });

      let controlsHost = rulesSection.querySelector("[data-region-alerts-demo-controls-host]");
      if (!controlsHost) {
        controlsHost = document.createElement("div");
        controlsHost.setAttribute("data-region-alerts-demo-controls-host", "true");
        rulesSection.appendChild(controlsHost);
      }

      let summaryHost = summarySection.querySelector("[data-region-alerts-demo-summary-host]");
      if (!summaryHost) {
        summaryHost = document.createElement("div");
        summaryHost.setAttribute("data-region-alerts-demo-summary-host", "true");
        summarySection.appendChild(summaryHost);
      }

      setRegionAlertsUiHosts((current) => (
        current.controls === controlsHost && current.summary === summaryHost
          ? current
          : { controls: controlsHost, summary: summaryHost }
      ));
    };

    mountHosts();
    const timer = window.setTimeout(mountHosts, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, activeUseCaseId, currentView, regionAlertsLanguage, regionAlertsRuleConfig]);

  useEffect(() => {
    if (activeUseCaseId !== "region-alerts" || activeTab !== "Model Playground" || currentView !== "detail") {
      setRegionAlertsPlaygroundInputHost(null);
      return;
    }

    const mountInputHost = () => {
      const headingNodes = Array.from(document.querySelectorAll("h2"));
      const inputHeading = headingNodes.find((node) => (
        [getRegionAlertsText("en", "input"), getRegionAlertsText("ar", "input")].includes(node.textContent?.trim())
      ));
      const inputSection = inputHeading?.closest("section");

      if (!inputSection) return;

      Array.from(inputSection.children).forEach((child, index) => {
        if (index > 0 && !child.hasAttribute("data-region-alerts-playground-input-host")) {
          child.style.display = "none";
        }
      });

      let inputHost = inputSection.querySelector("[data-region-alerts-playground-input-host]");
      if (!inputHost) {
        inputHost = document.createElement("div");
        inputHost.setAttribute("data-region-alerts-playground-input-host", "true");
        inputSection.appendChild(inputHost);
      }

      setRegionAlertsPlaygroundInputHost((current) => (current === inputHost ? current : inputHost));
    };

    mountInputHost();
    const timer = window.setTimeout(mountInputHost, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, activeUseCaseId, currentView, regionAlertsLanguage]);

  useEffect(() => {
    if (!isRegionAlertsDetailView) return;
    const container = regionAlertsDetailHostRef.current;
    if (!container) return;

    const applyTranslations = () => applyRegionAlertsDetailTranslations(container, regionAlertsLanguage);
    applyTranslations();
    const timer = window.setTimeout(applyTranslations, 0);
    return () => window.clearTimeout(timer);
  }, [
    activeTab,
    integrationFetchedVideos.length,
    integrationOverview.connected,
    isRegionAlertsDetailView,
    playgroundState.sourceLabel,
    playgroundState.status,
    regionAlertsDemoSaveMessage,
    regionAlertsLanguage,
    regionAlertsPlaygroundManualRoi,
    regionAlertsPlaygroundUploadedFile,
    regionAlertsRoi,
    selectedIntegrationVideos.length,
  ]);

  const navigateTo = (nextView, nextTab, method = "push", nextSection = activeSection, useCaseId) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextView === "detail") {
      params.set("view", "detail");
      params.set("tab", tabLabelToParam[nextTab] ?? "playground");
      params.set("section", sectionLabelToParam[nextSection] ?? "safety-compliance");
      if (useCaseId) params.set("usecase", useCaseId);
    } else if (nextView === "usecases") {
      params.set("view", "usecases");
      params.delete("tab");
      params.set("section", sectionLabelToParam[nextSection] ?? "safety-compliance");
      params.delete("usecase");
    } else {
      params.delete("view");
      params.delete("tab");
      params.delete("section");
      params.delete("usecase");
    }
    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    router[method](href, { scroll: false });
  };

  const runPlaygroundPreview = async (file, sourceLabel, previewOptions = {}) => {
    const isRegionAlertsPreview = activeUseCaseId === "region-alerts";
    if (isRegionAlertsPreview) {
      setIsRegionAlertsPreviewRunning(true);
    }
    setPlaygroundState({ status: "loading", imageBase64: "", outputVideoUrl: "", detections: [], metrics: null, sourceLabel, error: "" });
    navigateTo("detail", "Model Playground", "replace", activeSection, activeUseCaseId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("use_case_id", activeUseCaseId);
      if (previewOptions.fireDetectionMode) {
        formData.append("fire_detection_mode", previewOptions.fireDetectionMode);
      }
      if (previewOptions.roi) {
        formData.append("roi_json", JSON.stringify(previewOptions.roi));
      }
      const response = await fetch(`${API_BASE_URL}/api/playground-preview`, { method: "POST", body: formData });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail ?? "Playground preview failed.");
      }
      const data = await response.json();
      setPlaygroundState(buildPlaygroundSuccessState(activeUseCaseId, data, sourceLabel, regionAlertsLanguage));
    } catch (error) {
      setPlaygroundState({
        status: "error",
        imageBase64: "",
        outputVideoUrl: "",
        detections: [],
        metrics: null,
        sourceLabel,
        error: error instanceof Error ? friendlyPlaygroundErrorMessage(error.message) : "Unable to generate playground preview.",
      });
    } finally {
      if (isRegionAlertsPreview) {
        setIsRegionAlertsPreviewRunning(false);
      }
    }
  };

  const handleProcessInput = async (sampleId, fileOverride, previewOptions = {}) => {
    const matchingSample = sampleMedia.find((sample) => sample.id === sampleId);
    const sourceLabel = fileOverride?.name
      ? `${activeUseCaseId === "region-alerts" ? tRegionAlerts("uploadedFilePrefix") : "Uploaded"}: ${fileOverride.name}`
      : matchingSample?.label ?? "Uploaded File";
    setSelectedSample(sampleId);
    if (fileOverride) {
      await runPlaygroundPreview(fileOverride, sourceLabel, previewOptions);
      return;
    }
    if (!matchingSample) return;

    const isRegionAlertsPreview = activeUseCaseId === "region-alerts";
    try {
      if (isRegionAlertsPreview) {
        setIsRegionAlertsPreviewRunning(true);
      }
      setPlaygroundState({ status: "loading", imageBase64: "", outputVideoUrl: "", detections: [], metrics: null, sourceLabel, error: "" });
      navigateTo("detail", "Model Playground", "replace", activeSection, activeUseCaseId);
      const formData = new FormData();
      formData.append("sample_name", matchingSample.label);
      formData.append("use_case_id", activeUseCaseId);
      if (previewOptions.fireDetectionMode) {
        formData.append("fire_detection_mode", previewOptions.fireDetectionMode);
      }
      if (previewOptions.roi) {
        formData.append("roi_json", JSON.stringify(previewOptions.roi));
      }
      const response = await fetch(`${API_BASE_URL}/api/playground-preview-sample`, { method: "POST", body: formData });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail ?? "Unable to load sample media.");
      }
      const data = await response.json();
      setPlaygroundState(buildPlaygroundSuccessState(activeUseCaseId, data, sourceLabel, regionAlertsLanguage));
    } catch (error) {
      setPlaygroundState({
        status: "error",
        imageBase64: "",
        outputVideoUrl: "",
        detections: [],
        metrics: null,
        sourceLabel,
        error: error instanceof Error ? friendlyPlaygroundErrorMessage(error.message) : "Unable to process sample media.",
      });
    } finally {
      if (isRegionAlertsPreview) {
        setIsRegionAlertsPreviewRunning(false);
      }
    }
  };

  const regionAlertsPlaygroundEffectiveRoi =
    regionAlertsPlaygroundRoiMode === "manual" && regionAlertsPlaygroundManualRoi
      ? regionAlertsPlaygroundManualRoi
      : DEFAULT_REGION_ALERT_PLAYGROUND_ROI;
  const regionAlertsPlaygroundHelperMessage = regionAlertsPlaygroundUploadedFile
    ? (regionAlertsLanguage === "ar"
      ? "تم رفع الفيديو. سيتم استخدام منطقة الاهتمام الافتراضية ما لم يتم تحديد منطقة يدوية."
      : "Video uploaded. Default ROI will be used unless a manual region is selected.")
    : (regionAlertsLanguage === "ar"
      ? "ارفع فيديو لمعاينة تدفق إدخال تنبيهات المناطق."
      : "Upload a video to preview the Region Alerts input flow.");

  return (
    <>
      <div className="min-h-screen bg-white text-slate-900">
        {currentView === "landing" && (
          <LandingPage onExploreSection={(section) => navigateTo("usecases", undefined, "push", section)} />
        )}
        {currentView === "usecases" && (
          <UseCasesPage
            activeSection={activeSection}
            onChangeSection={(section) => navigateTo("usecases", undefined, "push", section)}
            onGoHome={() => navigateTo("landing")}
            onOpenUseCase={(useCaseId, category) => navigateTo("detail", "Model Playground", "push", category, useCaseId)}
          />
        )}
        {currentView === "detail" && (
          <div ref={regionAlertsDetailHostRef} className="relative">
            {isRegionAlertsDetailView ? (
              <div className="pointer-events-none absolute right-6 top-6 z-20 md:right-10" dir={regionAlertsLanguage === "ar" ? "rtl" : undefined}>
                <div className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur">
                  {[
                    { value: "en", label: "English" },
                    { value: "ar", label: "عربي" },
                  ].map((option) => {
                    const active = regionAlertsLanguage === option.value;
                    return (
                      <button
                        key={option.value}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                          active
                            ? "bg-brandBlue text-white"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                        onClick={() => updateRegionAlertsLanguage(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <DetailPage
              activeTab={activeTab}
              activeUseCase={activeUseCase}
              onBack={() => navigateTo("usecases", undefined, "push", activeSection)}
              onGoHome={() => navigateTo("landing")}
              onProcessInput={handleProcessInput}
              playgroundState={playgroundState}
              selectedSample={selectedSample}
              sampleMedia={sampleMedia}
              persistedRegionAlertsRoi={regionAlertsRoi}
              regionAlertsRoi={regionAlertsRoi}
              regionAlertsZonePointsNormalized={zonePointsNormalizedFromRoiPayload(selectedRegionAlertsRoi?.roi)}
              onRegionAlertsRoiChange={handleRegionAlertsRoiChange}
              regionAlertsRuleConfig={regionAlertsRuleConfig}
              onRegionAlertsRuleConfigChange={handleRegionAlertsRuleConfigChange}
              setActiveTab={(tab) => navigateTo("detail", tab, "push", activeSection, activeUseCaseId)}
              integrationForm={integrationForm}
              integrationOverview={integrationOverview}
              integrationModelState={integrationModelState}
              integrationError={integrationError}
              isConnectingIntegration={isConnectingIntegration}
              integrationMode={integrationMode}
              integrationManualModelMode={integrationManualModelMode}
              integrationAutoModelMode={integrationAutoModelMode}
              integrationFetchCount={integrationFetchCount}
              integrationFetchedVideos={integrationFetchedVideos}
              selectedIntegrationVideos={selectedIntegrationVideos}
              isFetchingIntegrationVideos={isFetchingIntegrationVideos}
              isProcessingIntegrationVideos={isProcessingIntegrationVideos}
              integrationFetchMessage={integrationFetchMessage}
              integrationProcessMessage={integrationProcessMessage}
              expandedRunId={expandedRunId}
              onIntegrationFieldChange={handleIntegrationFieldChange}
              onIntegrationConnect={handleIntegrationConnect}
              onIntegrationModeChange={handleIntegrationModeChange}
              onIntegrationManualModelModeChange={setIntegrationManualModelMode}
              onIntegrationAutoModelModeChange={handleIntegrationAutoModelModeChange}
              onIntegrationFetchCountChange={setIntegrationFetchCount}
              onIntegrationFetchVideos={handleIntegrationFetchVideos}
              onIntegrationSelectionChange={setSelectedIntegrationVideos}
              onIntegrationProcessSelected={handleIntegrationProcessSelected}
              onToggleRunAnalysis={(runId) => setExpandedRunId((current) => (current === runId ? null : runId))}
              onOpenAnalyticsDashboard={() => {
                const slug = useCaseToAnalyticsDashboardSlug[activeUseCaseId] ?? activeUseCaseId;
                router.push(`/dashboard/${slug}`);
              }}
            />
          </div>
        )}
      </div>
      {regionAlertsPlaygroundInputHost ? createPortal(
        <RegionAlertsPlaygroundInputPanel
          effectiveRoi={regionAlertsPlaygroundEffectiveRoi}
          hasProcessedOutput={Boolean(playgroundState.outputVideoUrl || playgroundState.imageBase64)}
          helperMessage={regionAlertsPlaygroundHelperMessage}
          isProcessing={isRegionAlertsPreviewRunning}
          language={regionAlertsLanguage}
          manualRoi={regionAlertsPlaygroundManualRoi}
          onClearManualRoi={() => {
            setRegionAlertsPlaygroundRoiDraft(null);
            setRegionAlertsPlaygroundRoiStart(null);
            applyRegionAlertsDefaultSelection({ clearManual: true, markDirty: true });
          }}
          onProcess={() => void handleRegionAlertsPlaygroundProcess()}
          onRoiModeChange={(value) => {
            setRegionAlertsPlaygroundRoiDraft(null);
            setRegionAlertsPlaygroundRoiStart(null);
            if (value === "manual") {
              if (regionAlertsPlaygroundManualRoi) {
                applyRegionAlertsManualSelection(regionAlertsPlaygroundManualRoi, { markDirty: true });
              } else {
                setRegionAlertsPlaygroundRoiMode("manual");
              }
              return;
            }
            applyRegionAlertsDefaultSelection({ markDirty: true });
          }}
          onUploadFile={handleRegionAlertsPlaygroundUpload}
          onVideoPointerDown={handleRegionAlertsPlaygroundPointerDown}
          onVideoPointerLeave={handleRegionAlertsPlaygroundPointerLeave}
          onVideoPointerMove={handleRegionAlertsPlaygroundPointerMove}
          onVideoPointerUp={handleRegionAlertsPlaygroundPointerUp}
          roiDraft={regionAlertsPlaygroundRoiDraft}
          roiMode={regionAlertsPlaygroundRoiMode}
          uploadedFile={regionAlertsPlaygroundUploadedFile}
          uploadedVideoUrl={regionAlertsPlaygroundUploadedVideoUrl}
        />,
        regionAlertsPlaygroundInputHost,
      ) : null}
      {regionAlertsUiHosts.controls ? createPortal(
        <RegionAlertsIntegrationDemoControls
          intrusionType={regionAlertsIntrusionType}
          language={regionAlertsLanguage}
          onIntrusionTypeChange={(value) => {
            setRegionAlertsIntrusionType(value);
            setRegionAlertsDemoSaveMessage("");
          }}
          onRuleConfigChange={handleRegionAlertsRuleConfigChange}
          onSave={() => setRegionAlertsDemoSaveMessage(tRegionAlerts("configurationSaved"))}
          onZoneChange={(value) => {
            setRegionAlertsSelectedZone(value);
            setRegionAlertsDemoSaveMessage("");
          }}
          roiSelection={selectedRegionAlertsRoi}
          ruleConfig={regionAlertsRuleConfig}
          saveMessage={regionAlertsDemoSaveMessage}
          selectedZone={regionAlertsSelectedZone}
        />,
        regionAlertsUiHosts.controls,
      ) : null}
      {regionAlertsUiHosts.summary ? createPortal(
        <RegionAlertsIntegrationDemoSummary
          intrusionType={regionAlertsIntrusionType}
          language={regionAlertsLanguage}
          roiSelection={selectedRegionAlertsRoi}
          ruleConfig={regionAlertsRuleConfig}
          selectedZone={regionAlertsSelectedZone}
        />,
        regionAlertsUiHosts.summary,
      ) : null}
    </>
  );
}
