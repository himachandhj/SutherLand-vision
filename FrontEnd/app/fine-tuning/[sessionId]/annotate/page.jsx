"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  Trash2,
  Wand2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import {
  assistPropagateLabels,
  autoLabelDataset,
  loadAnnotationWorkspace,
  saveManualAnnotations,
  segmentAnnotationWithSam,
  trainAssistModel,
} from "../../../../components/fine-tuning/fineTuningApi";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { sectionLabelToParam, useCases } from "../../../../components/visionLabConfig";

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function makeBoxId(prefix = "box") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const CLASS_COLOR_PALETTE = [
  "#e11d48",
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
];

function getClassColor(className) {
  const normalized = String(className || "unknown").toLowerCase().trim();
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = normalized.charCodeAt(index) + ((hash << 5) - hash);
  }
  return CLASS_COLOR_PALETTE[Math.abs(hash) % CLASS_COLOR_PALETTE.length];
}

function hexToRgba(hexColor, alpha = 1) {
  const normalized = String(hexColor || "").replace("#", "").trim();
  if (normalized.length !== 6) return `rgba(15, 23, 42, ${alpha})`;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getReadableTextColor(hexColor) {
  const normalized = String(hexColor || "").replace("#", "").trim();
  if (normalized.length !== 6) return "#ffffff";
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const brightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return brightness > 160 ? "#0f172a" : "#ffffff";
}

function qualityFromConfidence(confidence) {
  const score = Number(confidence);
  if (!Number.isFinite(score)) return "medium";
  if (score > 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

function normalizeQuality(value, confidence) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") return normalized;
  return qualityFromConfidence(confidence);
}

function normalizeBox(box, index = 0, fallbackSource = "manual") {
  const width = Math.max(0.001, clamp01(box?.width ?? 0));
  const height = Math.max(0.001, clamp01(box?.height ?? 0));
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  return {
    id: box?.id ?? makeBoxId(`${fallbackSource}-${index}`),
    class_id: Number.isFinite(Number(box?.class_id)) ? Number(box.class_id) : undefined,
    class_name: String(box?.class_name || "object").trim().toLowerCase(),
    x_center: Math.min(1 - halfWidth, Math.max(halfWidth, clamp01(box?.x_center ?? 0.5))),
    y_center: Math.min(1 - halfHeight, Math.max(halfHeight, clamp01(box?.y_center ?? 0.5))),
    width,
    height,
    confidence: box?.confidence,
    quality: normalizeQuality(box?.quality, box?.confidence),
    source: box?.source ?? fallbackSource,
  };
}

function annotationStyle(box) {
  const normalized = normalizeBox(box);
  const left = clamp01(normalized.x_center - normalized.width / 2);
  const top = clamp01(normalized.y_center - normalized.height / 2);
  return {
    left: `${left * 100}%`,
    top: `${top * 100}%`,
    width: `${Math.min(1 - left, normalized.width) * 100}%`,
    height: `${Math.min(1 - top, normalized.height) * 100}%`,
  };
}

function buildBoxFromPoints(start, end, className) {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  const width = right - left;
  const height = bottom - top;
  if (width < 0.01 || height < 0.01) return null;
  return normalizeBox(
    {
      class_name: className,
      x_center: left + width / 2,
      y_center: top + height / 2,
      width,
      height,
      source: "manual",
    },
    0,
    "manual",
  );
}

function annotationPayload(box) {
  const normalized = normalizeBox(box);
  return {
    class_name: normalized.class_name,
    x_center: Number(normalized.x_center.toFixed(6)),
    y_center: Number(normalized.y_center.toFixed(6)),
    width: Number(normalized.width.toFixed(6)),
    height: Number(normalized.height.toFixed(6)),
  };
}

function itemKey(item) {
  return item?.object_key ?? item?.media_object_key ?? item?.item_id ?? "";
}

function normalizeWorkspaceItems(items) {
  const annotationsByItem = {};
  for (const item of items ?? []) {
    const key = itemKey(item);
    if (!key) continue;
    annotationsByItem[key] = (item.annotations ?? []).map((box, index) =>
      normalizeBox(box, index, item.label_source ?? box?.source ?? "saved"),
    );
  }
  return annotationsByItem;
}

function parsePromptTerms(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function formatCount(value, fallback = "0") {
  if (value === undefined || value === null) return fallback;
  return Number(value).toLocaleString();
}

function defaultClassOptions(useCaseId) {
  const defaults = {
    "fire-detection": ["fire", "smoke"],
    "ppe-detection": ["person", "helmet", "vest", "shoes"],
    "region-alerts": ["person"],
  };
  return defaults[useCaseId] ?? ["object"];
}

function statusToneForSaveState(state) {
  if (state === "Saved") return "compliant";
  if (state === "Unsaved changes") return "warning";
  if (state === "Suggestions ready") return "warning";
  return "normal";
}

function suggestionPalette(quality) {
  if (quality === "high") {
    return {
      badgeTone: "compliant",
      border: "border-emerald-400",
      background: "bg-emerald-400/10",
      label: "bg-emerald-500 text-white",
      row: "border-emerald-200 bg-emerald-50/70",
    };
  }
  if (quality === "low") {
    return {
      badgeTone: "alert",
      border: "border-brandRed",
      background: "bg-brandRed/10",
      label: "bg-brandRed text-white",
      row: "border-brandRed/20 bg-brandRed/[0.04]",
    };
  }
  return {
    badgeTone: "warning",
    border: "border-amber-400",
    background: "bg-amber-300/10",
    label: "bg-amber-500 text-white",
    row: "border-amber-200 bg-amber-50/70",
  };
}

function reviewStatusConfig(status) {
  if (status === "completed") return { label: "Completed", tone: "compliant" };
  if (status === "needs_review") return { label: "Needs review", tone: "warning" };
  return { label: "Unlabeled", tone: "alert" };
}

function priorityConfig(tier) {
  if (tier === "high") return { label: "High priority", tone: "alert" };
  if (tier === "medium") return { label: "Medium priority", tone: "warning" };
  return { label: "Low priority", tone: "normal" };
}

function formatTimestamp(value) {
  if (!value) return "No timestamp";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "No timestamp";
  return timestamp.toLocaleString();
}

function assistPhaseConfig(phase) {
  if (phase === "suggestions_ready") return { label: "Suggestions ready", tone: "warning" };
  if (phase === "assist_model_ready") return { label: "Assist model ready", tone: "compliant" };
  if (phase === "running_predictions") return { label: "Running predictions", tone: "warning" };
  if (phase === "training_assist_model") return { label: "Training assist model", tone: "warning" };
  if (phase === "preparing_dataset") return { label: "Preparing dataset", tone: "normal" };
  if (phase === "error") return { label: "Needs attention", tone: "alert" };
  return { label: "Idle", tone: "normal" };
}

const TEST_AUTO_LABEL_LIMIT = 6;
const BATCH_FIND_OPTIONS = [
  { value: "5", label: "5" },
  { value: "10", label: "10" },
  { value: "20", label: "20" },
  { value: "all", label: "All unlabeled" },
];

export default function AnnotationEditorPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = String(params?.sessionId ?? "");
  const useCaseId = searchParams.get("usecase") ?? "ppe-detection";
  const activeUseCase = useCases.find((useCase) => useCase.id === useCaseId) ?? useCases[0];
  const sectionParam = searchParams.get("section") ?? sectionLabelToParam[activeUseCase.category] ?? "safety-compliance";
  const backHref = useMemo(() => {
    const paramsForBack = new URLSearchParams({
      view: "detail",
      tab: "fine-tuning",
      section: sectionParam,
      usecase: activeUseCase.id,
      ftStep: "labels",
    });
    return `/?${paramsForBack.toString()}`;
  }, [activeUseCase.id, sectionParam]);

  const [workspace, setWorkspace] = useState(null);
  const [annotationsByItem, setAnnotationsByItem] = useState({});
  const [suggestionsByItem, setSuggestionsByItem] = useState({});
  const [dirtyItems, setDirtyItems] = useState({});
  const [activeItemId, setActiveItemId] = useState("");
  const [selectedBoxId, setSelectedBoxId] = useState("");
  const [drawStart, setDrawStart] = useState(null);
  const [draftBox, setDraftBox] = useState(null);
  const [selectedClass, setSelectedClass] = useState("object");
  const [autoLabelPrompt, setAutoLabelPrompt] = useState("");
  const [awaitingSamPoint, setAwaitingSamPoint] = useState(false);
  const [samPreview, setSamPreview] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saveResult, setSaveResult] = useState(null);
  const [autoLabelPreview, setAutoLabelPreview] = useState(null);
  const [assistMode, setAssistMode] = useState(false);
  const [assistSummary, setAssistSummary] = useState(null);
  const [assistModelStatus, setAssistModelStatus] = useState(null);
  const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [lastSuggestionContext, setLastSuggestionContext] = useState("");
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [showAllAnnotations, setShowAllAnnotations] = useState(false);
  const [batchFindCount, setBatchFindCount] = useState("5");
  const [batchOnlyUnlabeled, setBatchOnlyUnlabeled] = useState(true);
  const [hasSavedSampleLabels, setHasSavedSampleLabels] = useState(false);
  const [hasValidatedSuggestions, setHasValidatedSuggestions] = useState(false);
  const [hasApprovedSuggestions, setHasApprovedSuggestions] = useState(false);
  const [hasSavedApprovedSuggestions, setHasSavedApprovedSuggestions] = useState(false);
  const [approvedItemKeys, setApprovedItemKeys] = useState([]);
  const [loading, setLoading] = useState({
    workspace: false,
    save: false,
    auto: false,
    assist: false,
    sam: false,
    trainAssist: false,
    propagate: false,
  });

  const classOptions = workspace?.classes?.length ? workspace.classes : defaultClassOptions(activeUseCase.id);
  const promptSuggestions = classOptions.slice(0, 6);
  const workspaceItems = workspace?.items ?? [];
  const displayItems = useMemo(() => {
    if (!assistMode) return workspaceItems;
    return [...workspaceItems].sort((left, right) => {
      const scoreGap = Number(right?.priority_score ?? 0) - Number(left?.priority_score ?? 0);
      if (scoreGap) return scoreGap;
      const leftNeedsReview = left?.review_status === "needs_review" ? 0 : left?.review_status === "unlabeled" ? -1 : 1;
      const rightNeedsReview = right?.review_status === "needs_review" ? 0 : right?.review_status === "unlabeled" ? -1 : 1;
      if (leftNeedsReview !== rightNeedsReview) return leftNeedsReview - rightNeedsReview;
      const lowConfidenceGap = Number(Boolean(right?.has_low_confidence_predictions)) - Number(Boolean(left?.has_low_confidence_predictions));
      if (lowConfidenceGap) return lowConfidenceGap;
      return String(left?.file_name ?? "").localeCompare(String(right?.file_name ?? ""));
    });
  }, [assistMode, workspaceItems]);
  const activeItem = displayItems.find((item) => itemKey(item) === activeItemId) ?? workspaceItems.find((item) => itemKey(item) === activeItemId) ?? displayItems[0] ?? workspaceItems[0] ?? null;
  const activeKey = itemKey(activeItem) || activeItemId;
  const currentAnnotations = activeKey ? annotationsByItem[activeKey] ?? [] : [];
  const currentSuggestions = activeKey ? suggestionsByItem[activeKey] ?? [] : [];
  const visibleAnnotations = showAllAnnotations ? currentAnnotations : currentAnnotations.slice(0, 8);
  const hasMoreAnnotations = currentAnnotations.length > 8;
  const visibleSuggestions = showAllSuggestions ? currentSuggestions : currentSuggestions.slice(0, 8);
  const hasMoreSuggestions = currentSuggestions.length > 8;
  const hasCurrentItemSuggestions = currentSuggestions.length > 0;
  const selectedAnnotation = currentAnnotations.find((box) => box.id === selectedBoxId) ?? null;
  const activeItemIndex = displayItems.findIndex((item) => itemKey(item) === activeKey);
  const lowConfidenceCount = currentSuggestions.filter((box) => normalizeQuality(box.quality, box.confidence) === "low").length;
  const mediumConfidenceCount = currentSuggestions.filter((box) => normalizeQuality(box.quality, box.confidence) === "medium").length;
  const activeReviewStatus = currentSuggestions.length
    ? "needs_review"
    : currentAnnotations.length || Number(activeItem?.saved_annotation_count ?? activeItem?.annotation_count ?? 0) > 0 || activeItem?.has_label
      ? "completed"
      : activeItem?.review_status ?? "unlabeled";
  const activePriority = priorityConfig(activeItem?.priority_tier ?? "low");
  const activeReview = reviewStatusConfig(activeReviewStatus);
  const saveState = activeKey
    ? dirtyItems[activeKey]
      ? "Unsaved changes"
      : currentSuggestions.length
        ? "Suggestions ready"
        : saveResult?.media_object_key === activeKey
          ? "Saved"
          : "Ready"
    : "No image selected";
  const assistPhase = assistPhaseConfig(assistModelStatus?.phase);
  const savedImageCount = useMemo(
    () => workspaceItems.filter((item) => Number(item?.saved_annotation_count ?? item?.annotation_count ?? 0) > 0).length,
    [workspaceItems],
  );
  const unlabeledImageCount = useMemo(
    () => workspaceItems.filter((item) => Number(item?.saved_annotation_count ?? item?.annotation_count ?? 0) <= 0).length,
    [workspaceItems],
  );
  const pendingSuggestionCount = useMemo(
    () => Object.values(suggestionsByItem).reduce((count, boxes) => count + (Array.isArray(boxes) ? boxes.length : 0), 0),
    [suggestionsByItem],
  );
  const pendingApprovedSaveKeys = useMemo(
    () => approvedItemKeys.filter((key) => dirtyItems[key]),
    [approvedItemKeys, dirtyItems],
  );
  const validationImageCount = useMemo(() => {
    if (lastSuggestionContext !== "test") return 0;
    return Number(autoLabelPreview?.returned_item_count ?? autoLabelPreview?.processed_item_count ?? 0);
  }, [autoLabelPreview, lastSuggestionContext]);
  const hasPendingSuggestions = pendingSuggestionCount > 0;
  const requiresApprovedSave = hasApprovedSuggestions && !hasSavedApprovedSuggestions;
  const workflowStage = !assistMode
    ? { label: "Manual labeling", tone: "normal" }
    : hasPendingSuggestions
      ? { label: "Review suggestions", tone: "warning" }
      : requiresApprovedSave
        ? { label: "Save approved labels", tone: "warning" }
        : hasApprovedSuggestions && hasSavedApprovedSuggestions
        ? { label: "Ready for remaining images", tone: "compliant" }
        : hasSavedSampleLabels
          ? { label: "Ready for test", tone: "normal" }
          : { label: "Build sample labels", tone: "normal" };
  const workflowHelperText = !assistMode
    ? "Label a few sample images manually."
    : hasPendingSuggestions
      ? "Review these suggestions carefully before applying to the dataset."
      : requiresApprovedSave
        ? "Please save approved labels before proceeding."
        : hasApprovedSuggestions && hasSavedApprovedSuggestions
          ? "Apply auto-labeling to remaining images."
          : hasSavedSampleLabels
            ? "Now test auto-labeling on a few unseen images."
            : "Label a few sample images manually.";

  const setLoadingFlag = (key, value) => {
    setLoading((current) => ({ ...current, [key]: value }));
  };

  const updateZoomLevel = (nextValue) => {
    setZoomLevel(Math.max(0.75, Math.min(2.5, nextValue)));
  };

  const markItemDirty = (key, dirty = true) => {
    if (!key) return;
    setDirtyItems((current) => ({ ...current, [key]: dirty }));
  };

  const resetValidationFlow = () => {
    setHasValidatedSuggestions(false);
    setHasApprovedSuggestions(false);
    setHasSavedApprovedSuggestions(false);
    setApprovedItemKeys([]);
  };

  const trackApprovedItems = (keys) => {
    const normalizedKeys = keys.filter(Boolean);
    if (!normalizedKeys.length) return;
    setApprovedItemKeys((current) => [...new Set([...current, ...normalizedKeys])]);
    setHasApprovedSuggestions(true);
    setHasSavedApprovedSuggestions(false);
  };

  const applyWorkspace = (payload, preferredItemId = "") => {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const nextActiveItemId = preferredItemId || itemKey(items[0]) || "";
    setWorkspace(payload);
    setAnnotationsByItem(normalizeWorkspaceItems(items));
    setSuggestionsByItem({});
    setDirtyItems({});
    setActiveItemId(nextActiveItemId);
    setSelectedBoxId("");
    setDrawStart(null);
    setDraftBox(null);
    setAwaitingSamPoint(false);
    setSamPreview(null);
    setSelectedClass(payload?.classes?.[0] ?? defaultClassOptions(activeUseCase.id)[0] ?? "object");
    setAutoLabelPreview(null);
    setAssistSummary(null);
    setAssistModelStatus(null);
    setAdvancedToolsOpen(false);
    setLastSuggestionContext("");
    setShowAllSuggestions(false);
    resetValidationFlow();
    return nextActiveItemId;
  };

  const loadWorkspace = async ({ silent = false, preferredItemId = "" } = {}) => {
    if (!sessionId) return null;
    if (!silent) setLoadingFlag("workspace", true);
    setError("");
    try {
      const payload = await loadAnnotationWorkspace(sessionId, 80);
      applyWorkspace(payload, preferredItemId || activeKey);
      setMessage(
        payload.items?.length
          ? "Annotation workspace loaded. Draw on the image, review suggestions, then save current labels."
          : "Workspace loaded, but no supported images were found in the selected dataset.",
      );
      return payload;
    } catch (loadError) {
      setError(loadError?.message || "Unable to load annotation workspace.");
      return null;
    } finally {
      if (!silent) setLoadingFlag("workspace", false);
    }
  };

  useEffect(() => {
    void loadWorkspace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    setHasSavedSampleLabels(
      workspaceItems.some((item) => Number(item?.saved_annotation_count ?? item?.annotation_count ?? 0) > 0),
    );
  }, [workspaceItems]);

  useEffect(() => {
    if (!hasApprovedSuggestions || !approvedItemKeys.length) {
      setHasSavedApprovedSuggestions(false);
      return;
    }
    const hasDirtyApprovedItems = approvedItemKeys.some((key) => dirtyItems[key]);
    setHasSavedApprovedSuggestions(!hasDirtyApprovedItems);
  }, [approvedItemKeys, dirtyItems, hasApprovedSuggestions]);

  useEffect(() => {
    setShowAllAnnotations(false);
  }, [activeKey]);

  const ensureWorkspaceLoaded = async () => {
    if (workspace?.items?.length) return workspace;
    return loadWorkspace({ preferredItemId: activeKey });
  };

  const mergeSuggestionPayload = (result, source = "suggestion") => {
    const items = Array.isArray(result?.items) ? result.items : [];
    setShowAllSuggestions(false);
    if (!items.length) return "";
    setSuggestionsByItem((current) => {
      const next = { ...current };
      for (const item of items) {
        const key = itemKey(item);
        if (!key) continue;
        next[key] = (item.annotations ?? []).map((box, index) => normalizeBox({ ...box, source }, index, source));
      }
      return next;
    });
    setWorkspace((current) => {
      const existingItems = new Map((current?.items ?? []).map((item) => [itemKey(item), item]));
      for (const item of items) {
        const key = itemKey(item);
        if (!key) continue;
        const existing = existingItems.get(key) ?? {};
        existingItems.set(key, {
          ...existing,
          object_key: existing.object_key ?? item.media_object_key ?? item.item_id ?? key,
          media_object_key: existing.media_object_key ?? item.media_object_key ?? key,
          file_name: existing.file_name ?? item.file_name ?? key.split("/").pop(),
          preview_url: item.preview_url ?? existing.preview_url,
          has_label: item.has_label ?? existing.has_label ?? false,
          label_source: item.label_source ?? existing.label_source ?? source,
          annotation_count: item.annotation_count ?? item.saved_annotation_count ?? existing.annotation_count ?? 0,
          saved_annotation_count: item.saved_annotation_count ?? item.annotation_count ?? existing.saved_annotation_count ?? existing.annotation_count ?? 0,
          suggestion_count: item.suggestion_count ?? (item.annotations?.length ?? 0),
          last_modified: item.last_modified ?? existing.last_modified,
          has_low_confidence_predictions: item.has_low_confidence_predictions ?? existing.has_low_confidence_predictions ?? false,
          has_medium_confidence_predictions: item.has_medium_confidence_predictions ?? existing.has_medium_confidence_predictions ?? false,
          priority_score: item.priority_score ?? existing.priority_score ?? 0,
          priority_tier: item.priority_tier ?? existing.priority_tier ?? "low",
          priority_reason: item.priority_reason ?? existing.priority_reason ?? "",
          review_status: item.review_status ?? existing.review_status,
        });
      }
      return {
        ...(current ?? {}),
        classes: result?.classes?.length ? result.classes : current?.classes ?? classOptions,
        items: Array.from(existingItems.values()),
      };
    });
    const firstSuggestedItemId = itemKey(items[0]);
    if (firstSuggestedItemId) setActiveItemId(firstSuggestedItemId);
    return firstSuggestedItemId;
  };

  const addPromptTermsToClasses = (terms, { announce = true } = {}) => {
    const normalizedTerms = Array.from(new Set((terms ?? []).map((term) => String(term || "").trim().toLowerCase()).filter(Boolean)));
    if (!normalizedTerms.length) {
      if (announce) setMessage("Type at least one prompt or class name first.");
      return [];
    }

    const existingClasses = workspace?.classes?.length ? workspace.classes : classOptions;
    const addedTerms = normalizedTerms.filter((term) => !existingClasses.includes(term));
    if (addedTerms.length) {
      setWorkspace((current) => ({
        ...(current ?? {}),
        classes: [...existingClasses, ...addedTerms],
      }));
    }
    setSelectedClass(normalizedTerms[normalizedTerms.length - 1]);
    if (announce) {
      setMessage(
        addedTerms.length
          ? `Added ${addedTerms.join(", ")} to the class list.`
          : "Those prompts are already available in the class list.",
      );
    }
    return normalizedTerms;
  };

  const getPointerPoint = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / Math.max(rect.width, 1)),
      y: clamp01((event.clientY - rect.top) / Math.max(rect.height, 1)),
    };
  };

  const runSamAssist = async ({ point = null, box = null, replaceBoxId = "" } = {}) => {
    if (!activeItem || !activeKey) {
      setMessage("Choose an image before using SAM.");
      return null;
    }
    setLoadingFlag("sam", true);
    setAwaitingSamPoint(false);
    setError("");
    try {
      const result = await segmentAnnotationWithSam(sessionId, {
        item_id: activeKey,
        media_object_key: activeKey,
        file_name: activeItem.file_name,
        class_name: box?.class_name ?? selectedAnnotation?.class_name ?? selectedClass,
        point,
        box,
      });
      setSamPreview({
        ...result,
        replaceBoxId,
        annotation: normalizeBox({ ...(result.annotation ?? {}), source: "sam" }, 0, "sam"),
      });
      setAdvancedToolsOpen(true);
      setMessage(result?.message ?? "SAM refinement is ready to review.");
      return result;
    } catch (samError) {
      setError(samError?.message || "Unable to refine with SAM.");
      return null;
    } finally {
      setLoadingFlag("sam", false);
    }
  };

  const handleCanvasPointerDown = (event) => {
    if (!activeItem || loading.save || loading.auto || loading.assist || loading.sam || loading.trainAssist || loading.propagate) return;
    event.preventDefault();
    if (awaitingSamPoint) {
      const point = getPointerPoint(event);
      void runSamAssist({ point });
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = getPointerPoint(event);
    setDrawStart(point);
    setDraftBox(normalizeBox({ class_name: selectedClass, x_center: point.x, y_center: point.y, width: 0.001, height: 0.001 }, 0, "draft"));
    setSelectedBoxId("");
    setSamPreview(null);
  };

  const handleCanvasPointerMove = (event) => {
    if (!drawStart) return;
    event.preventDefault();
    setDraftBox(buildBoxFromPoints(drawStart, getPointerPoint(event), selectedClass));
  };

  const handleCanvasPointerUp = (event) => {
    if (!drawStart || !activeKey) return;
    event.preventDefault();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const nextBox = buildBoxFromPoints(drawStart, getPointerPoint(event), selectedClass);
    setDrawStart(null);
    setDraftBox(null);
    if (!nextBox) return;
    const boxToAdd = { ...nextBox, id: makeBoxId("manual"), source: "manual" };
    setAnnotationsByItem((current) => ({
      ...current,
      [activeKey]: [...(current[activeKey] ?? []), boxToAdd],
    }));
    markItemDirty(activeKey, true);
    setSelectedBoxId(boxToAdd.id);
    setSaveResult(null);
  };

  const updateSelectedAnnotationBox = (field, value) => {
    if (!activeKey || !selectedAnnotation) return;
    setAnnotationsByItem((current) => ({
      ...current,
      [activeKey]: (current[activeKey] ?? []).map((box, index) =>
        box.id === selectedAnnotation.id ? normalizeBox({ ...box, [field]: value }, index, box.source ?? "manual") : box,
      ),
    }));
    markItemDirty(activeKey, true);
    setSaveResult(null);
  };

  const deleteAnnotationBox = (boxId) => {
    if (!activeKey) return;
    setAnnotationsByItem((current) => ({
      ...current,
      [activeKey]: (current[activeKey] ?? []).filter((box) => box.id !== boxId),
    }));
    markItemDirty(activeKey, true);
    setSelectedBoxId((current) => (current === boxId ? "" : current));
    setSaveResult(null);
  };

  const deleteSuggestion = (boxId) => {
    if (!activeKey) return;
    setSuggestionsByItem((current) => ({
      ...current,
      [activeKey]: (current[activeKey] ?? []).filter((box) => box.id !== boxId),
    }));
    setSaveResult(null);
  };

  const acceptSuggestion = (suggestion) => {
    if (!activeKey) return;
    const acceptedBox = normalizeBox({ ...suggestion, id: makeBoxId("manual"), source: "manual" }, 0, "manual");
    setAnnotationsByItem((current) => ({
      ...current,
      [activeKey]: [...(current[activeKey] ?? []), acceptedBox],
    }));
    setSuggestionsByItem((current) => ({
      ...current,
      [activeKey]: (current[activeKey] ?? []).filter((box) => box.id !== suggestion.id),
    }));
    markItemDirty(activeKey, true);
    setSelectedBoxId(acceptedBox.id);
    setSaveResult(null);
    if (lastSuggestionContext === "test") {
      trackApprovedItems([activeKey]);
    }
  };

  const approveAllSuggestions = () => {
    const suggestionEntries = Object.entries(suggestionsByItem).filter(([, boxes]) => (boxes ?? []).length);
    if (!suggestionEntries.length) {
      setMessage("No pending suggestions to approve.");
      return;
    }

    const nextAnnotations = { ...annotationsByItem };
    const dirtyMap = {};
    let firstApprovedItemId = activeKey;
    let firstApprovedBoxId = "";

    for (const [key, boxes] of suggestionEntries) {
      const approvedBoxes = (boxes ?? []).map((box, index) =>
        normalizeBox({ ...box, id: makeBoxId("manual"), source: "manual" }, index, "manual"),
      );
      nextAnnotations[key] = [...(nextAnnotations[key] ?? []), ...approvedBoxes];
      dirtyMap[key] = true;
      if (!firstApprovedBoxId && approvedBoxes[0]?.id) {
        firstApprovedItemId = key;
        firstApprovedBoxId = approvedBoxes[0].id;
      }
    }

    setAnnotationsByItem(nextAnnotations);
    setSuggestionsByItem({});
    setDirtyItems((current) => ({ ...current, ...dirtyMap }));
    setSelectedBoxId(firstApprovedBoxId);
    if (firstApprovedItemId) {
      setActiveItemId(firstApprovedItemId);
    }
    setSaveResult(null);
    if (lastSuggestionContext === "test") {
      trackApprovedItems(suggestionEntries.map(([key]) => key));
      setMessage("Suggestions approved. Please save approved labels before proceeding.");
      return;
    }
    setMessage("Suggestions approved. Continue editing and save the accepted labels when you're ready.");
  };

  const continueEditingSuggestions = () => {
    setMessage(
      lastSuggestionContext === "test"
        ? "Review these suggestions carefully, edit any boxes that need changes, and approve only the ones that look correct."
        : "Continue editing these suggestions before saving the accepted labels.",
    );
  };

  const clearPendingSuggestions = () => {
    if (!pendingSuggestionCount) {
      setMessage("No pending suggestions to clear.");
      return;
    }
    setSuggestionsByItem({});
    setShowAllSuggestions(false);
    setAutoLabelPreview(null);
    setSaveResult(null);
    if (lastSuggestionContext === "test" && !hasApprovedSuggestions) {
      resetValidationFlow();
    }
    setLastSuggestionContext(hasApprovedSuggestions ? lastSuggestionContext : "");
    setMessage(
      lastSuggestionContext === "test" && !hasApprovedSuggestions
        ? "Suggestions cleared. Continue labeling sample images manually, then test auto-labeling again when you're ready."
        : "Suggestions cleared. Continue editing manually and save labels when you're ready.",
    );
  };

  const handleSamButton = async () => {
    if (selectedAnnotation) {
      await runSamAssist({
        box: annotationPayload(selectedAnnotation),
        replaceBoxId: selectedAnnotation.id,
      });
      return;
    }
    setAwaitingSamPoint((current) => {
      const next = !current;
      if (next) {
        setSamPreview(null);
        setMessage("Click on the image to segment the object with SAM.");
      } else {
        setMessage("SAM click mode cancelled.");
      }
      return next;
    });
  };

  const discardSamPreview = () => {
    setSamPreview(null);
    setAwaitingSamPoint(false);
    setMessage("SAM preview discarded.");
  };

  const acceptSamPreview = () => {
    if (!activeKey || !samPreview?.annotation) return;
    const nextBox = normalizeBox(
      {
        ...samPreview.annotation,
        id: samPreview.replaceBoxId || makeBoxId("manual"),
        class_name: samPreview.annotation.class_name || selectedClass,
        source: "manual",
      },
      0,
      "manual",
    );
    setAnnotationsByItem((current) => {
      const existing = current[activeKey] ?? [];
      if (samPreview.replaceBoxId) {
        return {
          ...current,
          [activeKey]: existing.map((box) => (box.id === samPreview.replaceBoxId ? nextBox : box)),
        };
      }
      return {
        ...current,
        [activeKey]: [...existing, nextBox],
      };
    });
    markItemDirty(activeKey, true);
    setSelectedBoxId(nextBox.id);
    setSamPreview(null);
    setSaveResult(null);
    setMessage("SAM preview accepted and converted into a bounding box.");
  };

  const handleFindObjects = async (modeOverride = "grounding") => {
    const workspacePayload = await ensureWorkspaceLoaded();
    const selectedItemId = activeKey || itemKey(workspacePayload?.items?.[0]);
    setLoadingFlag("auto", true);
    setAwaitingSamPoint(false);
    setSamPreview(null);
    setError("");
    try {
      const result = await autoLabelDataset(sessionId, {
        mode: modeOverride,
        prompts: parsePromptTerms(autoLabelPrompt),
        item_ids: selectedItemId ? [selectedItemId] : [],
        limit: selectedItemId ? 1 : 12,
        confidence: 0.25,
      });
      mergeSuggestionPayload(result, "suggestion");
      setAutoLabelPreview(result);
      setAssistSummary(null);
      setLastSuggestionContext(Number(result?.suggested_label_count ?? 0) > 0 ? "advanced" : "");
      setMessage(result?.message ?? "Suggestions are ready to review.");
    } catch (autoError) {
      setError(autoError?.message || "Unable to auto-label dataset.");
    } finally {
      setLoadingFlag("auto", false);
    }
  };

  const handleFindObjectsFromPrompt = async () => {
    const terms = addPromptTermsToClasses(parsePromptTerms(autoLabelPrompt), { announce: false });
    if (!terms.length) {
      setMessage("Type at least one prompt or class name first.");
      return;
    }
    await handleFindObjects("grounding");
  };

  const handleBatchFindObjects = async () => {
    const workspacePayload = await ensureWorkspaceLoaded();
    const terms = addPromptTermsToClasses(parsePromptTerms(autoLabelPrompt), { announce: false });
    if (!terms.length) {
      setMessage("Enter at least one class or prompt before running batch Find Objects.");
      return;
    }

    const items = Array.isArray(workspacePayload?.items) ? workspacePayload.items : workspaceItems;
    const orderedItems = (() => {
      const currentIndex = items.findIndex((item) => itemKey(item) === activeKey);
      if (currentIndex <= 0) return items;
      return [...items.slice(currentIndex), ...items.slice(0, currentIndex)];
    })();
    const unlabeledItems = orderedItems.filter((item) => Number(item?.saved_annotation_count ?? item?.annotation_count ?? 0) <= 0);
    if (batchOnlyUnlabeled && !unlabeledItems.length) {
      setMessage("No unlabeled images available for batch labeling.");
      return;
    }

    const candidateItems = orderedItems.filter((item) => {
      const key = itemKey(item);
      if (!key) return false;
      const isUnlabeled = Number(item?.saved_annotation_count ?? item?.annotation_count ?? 0) <= 0;
      if (batchOnlyUnlabeled) return isUnlabeled;
      if (key === activeKey && !isUnlabeled) return false;
      return true;
    });
    const selectedItems = batchFindCount === "all"
      ? candidateItems
      : candidateItems.slice(0, Number.parseInt(batchFindCount, 10));
    const targetItemIds = selectedItems.map((item) => itemKey(item)).filter(Boolean);

    if (!targetItemIds.length) {
      setMessage(batchOnlyUnlabeled ? "No unlabeled images available for batch labeling." : "No images available for batch labeling.");
      return;
    }

    setLoadingFlag("auto", true);
    setAwaitingSamPoint(false);
    setSamPreview(null);
    setError("");
    setMessage(`Running Find Objects on ${formatCount(targetItemIds.length, "0")} images...`);
    try {
      const result = await autoLabelDataset(sessionId, {
        mode: "grounding",
        prompts: terms,
        item_ids: targetItemIds,
        limit: batchFindCount === "all" ? targetItemIds.length : Number.parseInt(batchFindCount, 10),
        confidence: 0.25,
      });
      mergeSuggestionPayload(result, "suggestion");
      setAutoLabelPreview(result);
      setAssistSummary(null);
      setLastSuggestionContext(Number(result?.suggested_label_count ?? 0) > 0 ? "advanced" : "");
      if (Number(result?.suggested_label_count ?? 0) > 0) {
        setMessage(
          `Suggestions generated for ${formatCount(Number(result?.returned_item_count ?? result?.items?.length ?? targetItemIds.length), "0")} images. Review and save approved labels.`,
        );
      } else {
        setMessage(result?.message ?? "No suggestions were generated.");
      }
    } catch (autoError) {
      setError(autoError?.message || "Unable to auto-label dataset.");
    } finally {
      setLoadingFlag("auto", false);
    }
  };

  const trainAssistModelForWorkflow = async () => {
    await ensureWorkspaceLoaded();
    setError("");
    setAssistModelStatus({
      phase: "preparing_dataset",
      source: "trained_model",
      message: "Preparing a YOLO dataset from the labels you have already saved.",
      warning: "",
    });
    setLoadingFlag("trainAssist", true);
    try {
      await new Promise((resolve) => {
        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(() => resolve());
          return;
        }
        setTimeout(resolve, 0);
      });
      setAssistModelStatus({
        phase: "training_assist_model",
        source: "trained_model",
        message: "Training a small local assist model from saved labels.",
        warning: "",
      });
      const result = await trainAssistModel(sessionId);
      setAssistModelStatus({
        phase: "assist_model_ready",
        source: "trained_model",
        message: result?.message ?? "Assist model ready. Test auto-labeling on a few unseen images.",
        warning: result?.warning ?? "",
        summary: result,
      });
      return result;
    } catch (trainError) {
      setAssistModelStatus({
        phase: "error",
        source: "trained_model",
        message: trainError?.message || "Unable to train the assist model.",
        warning: "",
      });
      setError(trainError?.message || "Unable to train the assist model.");
      return null;
    } finally {
      setLoadingFlag("trainAssist", false);
    }
  };

  const runAssistPropagation = async ({
    keepAssistMode = true,
    silentMessage = false,
    limit = 48,
    workflowContext = "remaining",
    sourceLabel = "Assist model",
    runningMessage = "Running the assist model on the remaining unlabeled images.",
  } = {}) => {
    await ensureWorkspaceLoaded();
    setLoadingFlag("propagate", true);
    setAwaitingSamPoint(false);
    setSamPreview(null);
    setError("");
    setAssistModelStatus((current) => ({
      ...(current ?? {}),
      phase: "running_predictions",
      source: "trained_model",
      message: runningMessage,
    }));
    try {
      const result = await assistPropagateLabels(sessionId, {
        prompts: parsePromptTerms(autoLabelPrompt),
        limit,
        confidence: 0.25,
      });
      setAssistMode(keepAssistMode);
      mergeSuggestionPayload(result, "assist-model");
      setAutoLabelPreview({ ...result, mode_used: "assist-model", source_label: sourceLabel });
      setAssistSummary({
        focusMessage: result?.focus_message ?? "Review the propagated suggestions before saving them.",
        prioritySummary: result?.priority_summary ?? null,
        returnedItemCount: result?.returned_item_count ?? result?.items?.length ?? 0,
        processedItemCount: result?.processed_item_count ?? 0,
        source: "trained_model",
      });
      setAssistModelStatus((current) => ({
        ...(current ?? {}),
        phase: "suggestions_ready",
        source: "trained_model",
        message: result?.message ?? "Suggestions are ready to review.",
      }));
      const hasSuggestions = Number(result?.suggested_label_count ?? 0) > 0;
      setLastSuggestionContext(hasSuggestions ? workflowContext : "");
      if (workflowContext === "test") {
        setHasValidatedSuggestions(hasSuggestions);
      }
      if (!silentMessage) {
        if (workflowContext === "test" && hasSuggestions) {
          setMessage("Review these suggestions carefully before applying to the dataset.");
        } else {
          setMessage(result?.message ?? "Suggestions are ready to review.");
        }
      }
      return result;
    } catch (assistError) {
      setAssistModelStatus((current) => ({
        ...(current ?? {}),
        phase: "error",
        source: "trained_model",
        message: assistError?.message || "Unable to label the remaining images with the assist model.",
      }));
      setError(assistError?.message || "Unable to label the remaining images with the assist model.");
      return null;
    } finally {
      setLoadingFlag("propagate", false);
    }
  };

  const handleTestAutoLabeling = async () => {
    resetValidationFlow();
    const trainingResult = await trainAssistModelForWorkflow();
    if (!trainingResult) return;
    await runAssistPropagation({
      keepAssistMode: true,
      limit: TEST_AUTO_LABEL_LIMIT,
      workflowContext: "test",
      sourceLabel: "Validation test",
      runningMessage: "Testing the assist model on a few unseen images.",
    });
  };

  const handleLabelRemainingImages = async () => {
    await runAssistPropagation({
      keepAssistMode: true,
      limit: 48,
      workflowContext: "remaining",
      sourceLabel: "Assist model",
      runningMessage: "Running the assist model on the remaining unlabeled images.",
    });
  };

  const handleAssistModeToggle = () => {
    if (assistMode) {
      setAssistMode(false);
      setMessage(
        hasPendingSuggestions
          ? "Assist Mode is off. Current suggestions remain available while you continue labeling manually."
          : "Assist Mode is off. Label a few sample images manually.",
      );
      return;
    }
    setAssistMode(true);
    setMessage(
      hasSavedSampleLabels
        ? "Now test auto-labeling on a few unseen images."
        : "Label a few sample images manually.",
    );
  };

  const persistAnnotationsForItem = async (itemId) => {
    const targetItem =
      workspaceItems.find((item) => itemKey(item) === itemId) ??
      workspace?.items?.find((item) => itemKey(item) === itemId);
    if (!targetItem || !itemId) {
      throw new Error("Choose an image before saving labels.");
    }

    const targetAnnotations = annotationsByItem[itemId] ?? [];
    const result = await saveManualAnnotations(sessionId, {
      item_id: itemId,
      media_object_key: itemId,
      file_name: targetItem.file_name,
      class_names: classOptions,
      annotations: targetAnnotations.map(annotationPayload),
    });

    setSaveResult(result);
    const savedAnnotationCount = Number(result.annotation_count ?? targetAnnotations.length ?? 0);
    const hasEffectiveLabel = Boolean(result.has_label ?? (savedAnnotationCount > 0));
    setAnnotationsByItem((current) => ({
      ...current,
      [itemId]: (result.annotations ?? targetAnnotations).map((box, index) =>
        normalizeBox({ ...box, source: result.label_source ?? box?.source ?? "manual" }, index, result.label_source ?? "manual"),
      ),
    }));
    setSuggestionsByItem((current) => ({ ...current, [itemId]: [] }));
    setWorkspace((current) => current
      ? {
          ...current,
          items: (current.items ?? []).map((item) =>
            itemKey(item) === itemId
              ? {
                  ...item,
                  has_label: hasEffectiveLabel,
                  label_source: result.label_source ?? (hasEffectiveLabel ? "manual" : null),
                  annotation_count: savedAnnotationCount,
                  saved_annotation_count: savedAnnotationCount,
                  suggestion_count: 0,
                  has_low_confidence_predictions: false,
                  has_medium_confidence_predictions: false,
                  review_status: hasEffectiveLabel ? "completed" : "unlabeled",
                  priority_score: assistMode ? (hasEffectiveLabel ? 0 : item.priority_score) : item.priority_score,
                  priority_tier: assistMode ? (hasEffectiveLabel ? "low" : item.priority_tier) : item.priority_tier,
                  priority_reason: assistMode
                    ? (hasEffectiveLabel ? "Saved labels for this image." : "No saved labels for this image.")
                    : item.priority_reason,
                }
              : item,
          ),
        }
      : current);
    markItemDirty(itemId, false);
    if (activeKey === itemId) {
      setSamPreview(null);
    }

    return {
      item: targetItem,
      result,
      annotationCount: Number(result.annotation_count ?? targetAnnotations.length ?? 0),
    };
  };

  const handleSaveLabels = async () => {
    if (!activeItem || !activeKey) {
      setMessage("Choose an image before saving labels.");
      return;
    }
    if (hasCurrentItemSuggestions && typeof window !== "undefined") {
      const confirmed = window.confirm("You have unapproved suggestions. Saving will discard them.");
      if (!confirmed) {
        setMessage("Continue reviewing suggestions or approve them before saving.");
        return;
      }
    }
    setLoadingFlag("save", true);
    setAwaitingSamPoint(false);
    setError("");
    try {
      const waitingForApprovedSave = requiresApprovedSave;
      const remainingApprovedSaveKeys = pendingApprovedSaveKeys.filter((key) => key !== activeKey);
      const { item, annotationCount } = await persistAnnotationsForItem(activeKey);
      if (annotationCount > 0) {
        setHasSavedSampleLabels(true);
      }

      if (waitingForApprovedSave && remainingApprovedSaveKeys.length > 0) {
        setMessage("Saved current labels. Please save approved labels before proceeding.");
      } else if (waitingForApprovedSave) {
        setMessage("Approved labels saved. Apply auto-labeling to remaining images.");
      } else if (assistMode && annotationCount > 0) {
        setMessage("Now test auto-labeling on a few unseen images.");
      } else if (assistMode && annotationCount <= 0) {
        setMessage(`Saved ${annotationCount} annotation(s) for ${item.file_name}. Add at least one labeled object before testing auto-labeling.`);
      } else {
        setMessage(`Saved ${annotationCount} annotation(s) for ${item.file_name}.`);
      }
    } catch (saveError) {
      setError(saveError?.message || "Unable to save labels.");
    } finally {
      setLoadingFlag("save", false);
    }
  };

  const handleSaveAllApprovedLabels = async () => {
    if (!pendingApprovedSaveKeys.length) {
      setMessage("Approved labels are already saved.");
      return;
    }

    setLoadingFlag("save", true);
    setAwaitingSamPoint(false);
    setError("");
    try {
      for (const itemId of pendingApprovedSaveKeys) {
        // Save approved suggestions across every touched image so the next stage
        // uses the same labels the reviewer just accepted.
        const { annotationCount } = await persistAnnotationsForItem(itemId);
        if (annotationCount > 0) {
          setHasSavedSampleLabels(true);
        }
      }
      setMessage("Approved labels saved. Apply auto-labeling to remaining images.");
    } catch (saveError) {
      setError(saveError?.message || "Unable to save approved labels.");
    } finally {
      setLoadingFlag("save", false);
    }
  };

  const goToRelativeItem = (direction) => {
    if (!displayItems.length) return;
    const nextIndex = activeItemIndex + direction;
    if (nextIndex < 0 || nextIndex >= displayItems.length) return;
    setActiveItemId(itemKey(displayItems[nextIndex]));
    setSelectedBoxId("");
    setDraftBox(null);
    setDrawStart(null);
    setAwaitingSamPoint(false);
    setSamPreview(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Link className="inline-flex items-center justify-center rounded-lg border border-brand-blue px-4 py-2.5 text-sm font-semibold text-brand-blue transition hover:bg-brand-blue-tint" href={backHref}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Labels
            </Link>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Step 3</div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Annotation Editor</h1>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Use case</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{activeUseCase.title}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Session</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">#{sessionId || "Unknown"}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Dataset</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{workspace?.dataset_name ?? "Loading..."}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Save status</div>
              <div className="mt-1 flex items-center gap-2">
                <Badge tone={statusToneForSaveState(saveState)}>{saveState}</Badge>
                <span className="truncate text-sm font-semibold text-slate-900">{activeItem?.file_name ?? "No image selected"}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1920px] gap-3 px-4 py-6 xl:grid-cols-[260px_minmax(0,1fr)_340px]">
        <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Images</div>
              <p className="mt-1 text-sm text-slate-500">{formatCount(workspaceItems.length, "0")} loaded</p>
            </div>
            <Badge tone={assistMode ? "warning" : "normal"}>{assistMode ? "Assist workflow" : formatCount(activeItemIndex + 1, "0")}</Badge>
          </div>
          <div className="mt-4 flex gap-2">
            <Button disabled={activeItemIndex <= 0} onClick={() => goToRelativeItem(-1)} type="button" variant="outline">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button disabled={!displayItems.length || activeItemIndex >= displayItems.length - 1} onClick={() => goToRelativeItem(1)} type="button" variant="outline">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-4 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {displayItems.length ? displayItems.map((item) => {
              const key = itemKey(item);
              const active = key === activeKey;
              const suggestionCount = suggestionsByItem[key]?.length ?? 0;
              const liveSuggestions = suggestionsByItem[key] ?? [];
              const reviewStatus = liveSuggestions.length
                ? "needs_review"
                : (annotationsByItem[key]?.length ?? 0) || Number(item.saved_annotation_count ?? item.annotation_count ?? 0) > 0 || item.has_label
                  ? "completed"
                  : item.review_status ?? "unlabeled";
              const review = reviewStatusConfig(reviewStatus);
              const priority = priorityConfig(item.priority_tier ?? "low");
              const lowConfidenceSuggestions = liveSuggestions.filter((box) => normalizeQuality(box.quality, box.confidence) === "low").length;
              return (
                <button
                  key={key}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition ${active ? "border-brandRed bg-brandRed/[0.05]" : "border-slate-200 bg-slate-50 hover:border-brandBlue/30 hover:bg-white"}`}
                  onClick={() => {
                    setActiveItemId(key);
                    setSelectedBoxId("");
                    setDraftBox(null);
                    setDrawStart(null);
                    setAwaitingSamPoint(false);
                    setSamPreview(null);
                  }}
                  type="button"
                >
                  <div className="truncate text-sm font-semibold text-slate-900">{item.file_name}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone={review.tone}>{review.label}</Badge>
                    {dirtyItems[key] ? <Badge tone="warning">Unsaved</Badge> : null}
                    {assistMode ? <Badge tone={priority.tone}>{priority.label}</Badge> : null}
                    {suggestionCount ? <Badge tone={lowConfidenceSuggestions ? "alert" : "warning"}>{suggestionCount} suggestions</Badge> : null}
                  </div>
                  <div className="mt-2 text-xs leading-5 text-slate-500">
                    {(item.saved_annotation_count ?? item.annotation_count ?? annotationsByItem[key]?.length ?? 0)} saved · {formatTimestamp(item.last_modified)}
                  </div>
                  {assistMode && item.priority_reason ? <p className="mt-1 text-xs leading-5 text-slate-500">{item.priority_reason}</p> : null}
                  {assistMode && item.has_low_confidence_predictions ? (
                    <p className="mt-1 text-xs font-semibold text-brandRed">Low-confidence detections need attention.</p>
                  ) : null}
                  {assistMode && !item.has_low_confidence_predictions && item.has_medium_confidence_predictions ? (
                    <p className="mt-1 text-xs font-semibold text-amber-600">Medium-confidence detections need confirmation.</p>
                  ) : null}
                  {assistMode && reviewStatus === "unlabeled" && !suggestionCount ? (
                    <p className="mt-1 text-xs font-semibold text-slate-600">No suggestions yet. Manual pass recommended.</p>
                  ) : null}
                  {item.label_source ? (
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      {item.label_source}
                    </div>
                  ) : null}
                </button>
              );
            }) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
                {loading.workspace ? "Loading images..." : "No images are available in this workspace yet."}
              </div>
            )}
          </div>
        </aside>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-panel">
          {error ? (
            <div className="mb-4 rounded-2xl border border-brandRed/20 bg-brandRed/[0.04] px-4 py-3 text-sm text-brandRed">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="mb-4 rounded-2xl border border-brandBlue/15 bg-brandBlue/[0.04] px-4 py-3 text-sm text-slate-700">
              {message}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Current image</div>
              <p className="mt-1 text-sm text-slate-500">{activeItem?.file_name ?? "Select an image from the left panel."}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone={activeReview.tone}>{activeReview.label}</Badge>
                {assistMode ? <Badge tone={activePriority.tone}>{activePriority.label}</Badge> : null}
                {activeItem?.label_source ? <Badge tone="normal">{activeItem.label_source}</Badge> : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone="normal">{formatCount(savedImageCount, "0")} labeled</Badge>
                <Badge tone="normal">{formatCount(validationImageCount, "0")} validation</Badge>
                <Badge tone={assistPhase.tone}>{assistPhase.label === "Idle" ? "Assist idle" : assistPhase.label}</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="normal">{currentAnnotations.length} boxes</Badge>
              <Badge tone={currentSuggestions.length ? "warning" : "normal"}>{currentSuggestions.length} suggestions</Badge>
              {lowConfidenceCount ? <Badge tone="alert">{lowConfidenceCount} low</Badge> : null}
              {mediumConfidenceCount ? <Badge tone="warning">{mediumConfidenceCount} medium</Badge> : null}
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Saved annotations</div>
              <div className="mt-1 font-semibold text-slate-900">{formatCount(activeItem?.saved_annotation_count ?? activeItem?.annotation_count ?? currentAnnotations.length, "0")}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Priority reason</div>
              <div className="mt-1 font-semibold text-slate-900">{activeItem?.priority_reason ?? "Continue labeling current image."}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Last modified</div>
              <div className="mt-1 font-semibold text-slate-900">{formatTimestamp(activeItem?.last_modified)}</div>
            </div>
          </div>
          {awaitingSamPoint ? (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-slate-700">
              Click on the image to segment the object with SAM.
            </div>
          ) : null}
          {samPreview ? (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">SAM preview ready</div>
                  <p className="mt-1">Review the mask overlay, then accept it to convert the segmentation into a bounding box.</p>
                </div>
                <Badge tone="normal">{Math.round((samPreview.mask_score ?? 0) * 100)}% score</Badge>
              </div>
            </div>
          ) : null}
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Class colors</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {classOptions.map((className) => {
                const color = getClassColor(className);
                return (
                  <span
                    key={`legend-${className}`}
                    className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold text-slate-700"
                    style={{ borderColor: color, backgroundColor: hexToRgba(color, 0.12) }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                    {className}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-950 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
              <div>
                <div className="font-semibold text-white">Canvas zoom</div>
                <p className="mt-1 text-xs leading-5 text-slate-400">Zoom scales the image and annotation overlay together.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={zoomLevel <= 0.75} onClick={() => updateZoomLevel(zoomLevel - 0.25)} type="button" variant="outline">
                  <ZoomOut className="mr-2 h-4 w-4" />
                  -
                </Button>
                <Button disabled={zoomLevel >= 2.5} onClick={() => updateZoomLevel(zoomLevel + 0.25)} type="button" variant="outline">
                  <ZoomIn className="mr-2 h-4 w-4" />
                  +
                </Button>
                <Button disabled={zoomLevel === 1} onClick={() => setZoomLevel(1)} type="button" variant="outline">
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Reset
                </Button>
              </div>
            </div>
            {activeItem?.preview_url ? (
              <div className="flex min-h-[74vh] items-center justify-center overflow-auto">
                <div className="origin-center transition-transform duration-150" style={{ transform: `scale(${zoomLevel})` }}>
                  <div className="relative w-fit max-w-full overflow-hidden rounded-2xl border border-slate-700 bg-black">
                    <img
                      alt={activeItem.file_name}
                      className="block max-h-[76vh] max-w-full select-none"
                      draggable={false}
                      src={activeItem.preview_url}
                    />
                    {samPreview?.mask_data_url ? (
                      <img
                        alt="SAM mask preview"
                        className="pointer-events-none absolute inset-0 h-full w-full"
                        draggable={false}
                        src={samPreview.mask_data_url}
                      />
                    ) : null}
                    <div
                      className="absolute inset-0 cursor-crosshair touch-none"
                      onPointerDown={handleCanvasPointerDown}
                      onPointerLeave={() => {
                        setDrawStart(null);
                        setDraftBox(null);
                      }}
                      onPointerMove={handleCanvasPointerMove}
                      onPointerUp={handleCanvasPointerUp}
                    >
                      {currentSuggestions.map((box) => {
                        const classColor = getClassColor(box.class_name);
                        return (
                          <div
                            key={box.id}
                            className="pointer-events-none absolute border-2 border-dashed"
                            style={{
                              ...annotationStyle(box),
                              borderColor: classColor,
                              backgroundColor: hexToRgba(classColor, 0.14),
                            }}
                          >
                            <span
                              className="absolute left-0 top-0 max-w-full truncate px-2 py-0.5 text-[11px] font-semibold"
                              style={{
                                backgroundColor: classColor,
                                color: getReadableTextColor(classColor),
                              }}
                            >
                              {box.class_name}{box.confidence ? ` ${Math.round(box.confidence * 100)}%` : ""}
                            </span>
                          </div>
                        );
                      })}
                      {samPreview?.annotation ? (
                        <div
                          className="pointer-events-none absolute border-2 border-dashed border-emerald-300 bg-emerald-300/10"
                          style={annotationStyle(samPreview.annotation)}
                        >
                          <span className="absolute left-0 top-0 max-w-full truncate bg-emerald-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                            {samPreview.annotation.class_name} SAM
                          </span>
                        </div>
                      ) : null}
                      {currentAnnotations.map((box) => {
                        const classColor = getClassColor(box.class_name);
                        const isSelected = selectedBoxId === box.id;
                        return (
                          <button
                            key={box.id}
                            className="absolute border-2 text-left"
                            style={{
                              ...annotationStyle(box),
                              borderColor: classColor,
                              backgroundColor: hexToRgba(classColor, 0.14),
                              boxShadow: isSelected ? `0 0 0 2px #ffffff, 0 0 0 4px ${hexToRgba(classColor, 0.9)}` : "none",
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedBoxId(box.id);
                            }}
                            onPointerDown={(event) => event.stopPropagation()}
                            type="button"
                          >
                            <span
                              className="absolute left-0 top-0 max-w-full truncate px-2 py-0.5 text-[11px] font-semibold"
                              style={{
                                backgroundColor: classColor,
                                color: getReadableTextColor(classColor),
                              }}
                            >
                              {box.class_name}
                            </span>
                          </button>
                        );
                      })}
                      {draftBox ? (
                        <div
                          className="pointer-events-none absolute border-2"
                          style={{
                            ...annotationStyle(draftBox),
                            borderColor: getClassColor(selectedClass),
                            backgroundColor: hexToRgba(getClassColor(selectedClass), 0.14),
                          }}
                        >
                          <span
                            className="absolute left-0 top-0 px-2 py-0.5 text-[11px] font-semibold"
                            style={{
                              backgroundColor: getClassColor(selectedClass),
                              color: getReadableTextColor(getClassColor(selectedClass)),
                            }}
                          >
                            {selectedClass}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[70vh] items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900 text-center text-sm leading-6 text-slate-400">
                {loading.workspace ? "Loading annotation workspace..." : "No image selected."}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">Suggestions</div>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {currentSuggestions.length
                    ? "Review these suggestions carefully before applying to the dataset."
                    : "No pending suggestions for this image."}
                </p>
              </div>
              <Badge tone={currentSuggestions.length ? "warning" : "normal"}>{formatCount(currentSuggestions.length, "0")}</Badge>
            </div>
            {currentSuggestions.length ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-slate-500">
                <span>Showing {formatCount(visibleSuggestions.length, "0")} of {formatCount(currentSuggestions.length, "0")} suggestions</span>
                {hasMoreSuggestions ? (
                  <Button onClick={() => setShowAllSuggestions((current) => !current)} type="button" variant="outline">
                    {showAllSuggestions ? "Show fewer suggestions" : `Show all suggestions (${formatCount(currentSuggestions.length, "0")})`}
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div className="mt-4 space-y-2">
              {currentSuggestions.length ? visibleSuggestions.map((box) => {
                const quality = normalizeQuality(box.quality, box.confidence);
                const palette = suggestionPalette(quality);
                const classColor = getClassColor(box.class_name);
                return (
                  <div
                    key={box.id}
                    className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm"
                    style={{ borderColor: classColor, backgroundColor: hexToRgba(classColor, 0.08) }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{
                            backgroundColor: classColor,
                            color: getReadableTextColor(classColor),
                          }}
                        >
                          <span className="truncate">{box.class_name}</span>
                        </span>
                        {box.confidence ? <span className="text-xs font-semibold text-slate-500">{Math.round(box.confidence * 100)}%</span> : null}
                      </div>
                      <div className="mt-1">
                        <Badge tone={palette.badgeTone}>{quality}</Badge>
                      </div>
                    </div>
                    <button className="rounded-full p-1 text-brandBlue hover:bg-brandBlue/[0.08]" onClick={() => acceptSuggestion(box)} type="button" title="Accept suggestion">
                      <Check className="h-4 w-4" />
                    </button>
                    <button className="rounded-full p-1 text-brandRed hover:bg-brandRed/[0.08]" onClick={() => deleteSuggestion(box.id)} type="button" title="Delete suggestion">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              }) : (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-500">
                  Suggestions will appear here after you test auto-labeling or use an advanced tool.
                </div>
              )}
            </div>
            {hasPendingSuggestions ? (
              <div className="mt-4 grid gap-3">
                <Button disabled={loading.save || loading.auto || loading.assist || loading.trainAssist || loading.propagate || loading.sam} onClick={approveAllSuggestions} type="button">
                  Approve Suggestions
                </Button>
                <Button disabled={loading.save || loading.auto || loading.assist || loading.trainAssist || loading.propagate || loading.sam} onClick={continueEditingSuggestions} type="button" variant="outline">
                  Continue Editing
                </Button>
                <Button disabled={loading.save || loading.auto || loading.assist || loading.trainAssist || loading.propagate || loading.sam} onClick={clearPendingSuggestions} type="button" variant="outline">
                  Clear Suggestions
                </Button>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-panel">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Guided labeling workflow</div>
                <p className="mt-1 text-sm leading-6 text-slate-600">{workflowHelperText}</p>
              </div>
              <Badge tone={workflowStage.tone}>{workflowStage.label}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="normal">{formatCount(savedImageCount, "0")} sample images saved</Badge>
              <Badge tone="normal">{formatCount(unlabeledImageCount, "0")} unlabeled remaining</Badge>
              <Badge tone={assistMode ? "warning" : "normal"}>{assistMode ? "Assist Mode On" : "Assist Mode Off"}</Badge>
            </div>
            {requiresApprovedSave ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-700">
                Please save approved labels before proceeding.
              </div>
            ) : null}
            {hasCurrentItemSuggestions ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-700">
                You have unapproved suggestions. Saving will discard them.
              </div>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Annotations</div>
              <Badge tone={currentAnnotations.length ? "normal" : "warning"}>{formatCount(currentAnnotations.length, "0")}</Badge>
            </div>
            {currentAnnotations.length ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-slate-500">
                <span>Showing {formatCount(visibleAnnotations.length, "0")} of {formatCount(currentAnnotations.length, "0")} annotations</span>
                {hasMoreAnnotations ? (
                  <Button onClick={() => setShowAllAnnotations((current) => !current)} type="button" variant="outline">
                    {showAllAnnotations ? "Show fewer annotations" : `Show all annotations (${formatCount(currentAnnotations.length, "0")})`}
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div className="mt-3 space-y-2">
              {currentAnnotations.length ? visibleAnnotations.map((box) => (
                <div key={box.id} className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${selectedBoxId === box.id ? "border-brandRed bg-white" : "border-slate-200 bg-white"}`}>
                  <button className="min-w-0 flex-1 truncate text-left font-semibold text-slate-700" onClick={() => setSelectedBoxId(box.id)} type="button">
                    {box.class_name} · {Math.round(box.width * 100)}% x {Math.round(box.height * 100)}%
                  </button>
                  <button className="rounded-full p-1 text-brandRed hover:bg-brandRed/[0.08]" onClick={() => deleteAnnotationBox(box.id)} type="button" title="Delete box">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )) : (
                <p className="text-sm leading-6 text-slate-500">No saved boxes for this image yet.</p>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">Workflow actions</div>
                <p className="mt-1 text-sm leading-6 text-slate-500">Save current labels, validate assist suggestions, and continue only after review.</p>
              </div>
              <Badge tone={workflowStage.tone}>{workflowStage.label}</Badge>
            </div>
            <div className="mt-4 grid gap-3">
              <Button
                disabled={!workspaceItems.length || loading.auto || loading.assist || loading.save || loading.trainAssist || loading.propagate || loading.sam}
                onClick={handleAssistModeToggle}
                type="button"
                variant={assistMode ? "default" : "outline"}
              >
                <Wand2 className="mr-2 h-4 w-4" />
                {assistMode ? "Assist Mode On" : "Assist Mode"}
              </Button>
              <Button
                disabled={!activeItem || loading.save || loading.auto || loading.assist || loading.trainAssist || loading.propagate || loading.sam}
                onClick={handleSaveLabels}
                type="button"
                variant={!assistMode || !hasSavedSampleLabels || requiresApprovedSave ? "default" : "outline"}
              >
                <Check className="mr-2 h-4 w-4" />
                {loading.save ? "Saving..." : "Save Labels"}
              </Button>
              {assistMode && requiresApprovedSave ? (
                <Button
                  disabled={!pendingApprovedSaveKeys.length || loading.save || loading.auto || loading.trainAssist || loading.propagate || loading.sam}
                  onClick={handleSaveAllApprovedLabels}
                  type="button"
                  variant="outline"
                >
                  <Check className="mr-2 h-4 w-4" />
                  {loading.save ? "Saving..." : "Save All Approved Labels"}
                </Button>
              ) : null}
              {assistMode && hasSavedSampleLabels && !hasValidatedSuggestions && !hasApprovedSuggestions && (!hasPendingSuggestions || loading.trainAssist || loading.propagate) ? (
                <Button
                  disabled={hasPendingSuggestions || loading.trainAssist || loading.propagate || loading.save || loading.auto || loading.sam}
                  onClick={handleTestAutoLabeling}
                  type="button"
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  {loading.trainAssist || loading.propagate ? "Testing..." : "Test Auto-Labeling on Few Images"}
                </Button>
              ) : null}
              {assistMode && hasApprovedSuggestions && unlabeledImageCount > 0 ? (
                <Button
                  disabled={!hasSavedApprovedSuggestions || hasPendingSuggestions || loading.propagate || loading.trainAssist || loading.save || loading.auto || loading.sam}
                  onClick={handleLabelRemainingImages}
                  type="button"
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  {loading.propagate ? "Predicting..." : "Label Remaining Images"}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-4">
            <div className="text-sm font-semibold text-slate-900">Manual annotation tools</div>
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Class before drawing</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {classOptions.map((className) => {
                  const classColor = getClassColor(className);
                  const isSelected = selectedClass === className;
                  return (
                    <button
                      key={className}
                      className="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                      style={{
                        borderColor: classColor,
                        backgroundColor: isSelected ? classColor : hexToRgba(classColor, 0.1),
                        color: isSelected ? getReadableTextColor(classColor) : classColor,
                      }}
                      onClick={() => setSelectedClass(className)}
                      type="button"
                    >
                      {className}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <label className="mt-4 block text-sm font-semibold text-slate-700">
            Prompt objects
            <input
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal outline-none transition focus:border-brandBlue"
              placeholder="fire, smoke"
              value={autoLabelPrompt}
              onChange={(event) => setAutoLabelPrompt(event.target.value)}
            />
            <span className="mt-2 block text-xs font-normal leading-5 text-slate-500">
              Add new class names here, then use Find Objects to run prompt-based suggestions without opening Advanced Tools.
            </span>
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Button disabled={loading.auto || loading.assist || loading.save || loading.trainAssist || loading.propagate || loading.sam} onClick={() => addPromptTermsToClasses(parsePromptTerms(autoLabelPrompt))} type="button" variant="outline">
              Add Prompt as Class
            </Button>
            <Button disabled={!activeItem || loading.auto || loading.assist || loading.save || loading.trainAssist || loading.propagate || loading.sam} onClick={handleFindObjectsFromPrompt} type="button">
              <Wand2 className="mr-2 h-4 w-4" />
              {loading.auto ? "Finding..." : "Find Objects"}
            </Button>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-sm font-semibold text-slate-900">Batch Find Objects</div>
            <p className="mt-1 text-sm leading-6 text-slate-500">Run prompt-based suggestions on a small batch without opening each image one by one.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Images to process
                <select
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-700 outline-none transition focus:border-brandBlue"
                  value={batchFindCount}
                  onChange={(event) => setBatchFindCount(event.target.value)}
                >
                  {BATCH_FIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                <input
                  checked={batchOnlyUnlabeled}
                  className="h-4 w-4 rounded border-slate-300 text-brandBlue focus:ring-brandBlue"
                  onChange={(event) => setBatchOnlyUnlabeled(event.target.checked)}
                  type="checkbox"
                />
                Only unlabeled images
              </label>
            </div>
            <div className="mt-4">
              <Button
                disabled={!workspaceItems.length || loading.auto || loading.assist || loading.save || loading.trainAssist || loading.propagate || loading.sam}
                onClick={handleBatchFindObjects}
                type="button"
                variant="outline"
              >
                <Wand2 className="mr-2 h-4 w-4" />
                {loading.auto ? "Finding..." : "Find Objects on Batch"}
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {promptSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                className="rounded-full border border-brandBlue/15 bg-brandBlue/[0.04] px-3 py-1.5 text-xs font-semibold text-brandBlue hover:bg-brandBlue/[0.08]"
                onClick={() => {
                  const currentTerms = parsePromptTerms(autoLabelPrompt);
                  if (currentTerms.includes(suggestion)) return;
                  setAutoLabelPrompt(currentTerms.length ? `${currentTerms.join(", ")}, ${suggestion}` : suggestion);
                }}
                type="button"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <button
              className="flex w-full items-center justify-between gap-3 text-left"
              onClick={() => setAdvancedToolsOpen((current) => !current)}
              type="button"
            >
              <div>
                <div className="text-sm font-semibold text-slate-900">Advanced Tools</div>
                <p className="mt-1 text-sm leading-6 text-slate-500">Technical tools for segmentation refinement. These tools never auto-save labels.</p>
              </div>
              <Badge tone="normal">{advancedToolsOpen ? "Hide" : "Show"}</Badge>
            </button>
            {advancedToolsOpen ? (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3">
                  <Button
                    disabled={!activeItem || loading.save || loading.auto || loading.assist || loading.sam || loading.trainAssist || loading.propagate}
                    onClick={handleSamButton}
                    type="button"
                    variant="outline"
                  >
                    <Wand2 className="mr-2 h-4 w-4" />
                    {loading.sam ? "Segmenting..." : selectedAnnotation ? "Refine with SAM" : awaitingSamPoint ? "Cancel SAM Click" : "Segment Object"}
                  </Button>
                  {samPreview ? (
                    <>
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-slate-700">
                        <div className="font-semibold text-slate-900">SAM refinement</div>
                        <p className="mt-1">{samPreview.message}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge tone="normal">{samPreview.input_type === "box" ? "Box refine" : "Click prompt"}</Badge>
                          <Badge tone="normal">{samPreview.annotation?.class_name ?? selectedClass}</Badge>
                        </div>
                      </div>
                      <Button disabled={loading.sam || loading.save || loading.auto || loading.assist || loading.trainAssist || loading.propagate} onClick={acceptSamPreview} type="button" variant="outline">
                        Accept SAM Preview
                      </Button>
                      <Button disabled={loading.sam || loading.trainAssist || loading.propagate} onClick={discardSamPreview} type="button" variant="outline">
                        Discard SAM Preview
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Advanced coordinates</div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {selectedAnnotation
                ? "Edit normalized 0–1 coordinates for the selected annotation. Changes update the box overlay immediately."
                : "Select a box to edit coordinates."}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-5">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Class
                <select
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-700 outline-none transition focus:border-brandBlue disabled:bg-slate-100"
                  disabled={!selectedAnnotation}
                  value={selectedAnnotation?.class_name ?? selectedClass}
                  onChange={(event) => updateSelectedAnnotationBox("class_name", event.target.value)}
                >
                  {classOptions.map((className) => (
                    <option key={className} value={className}>{className}</option>
                  ))}
                </select>
              </label>
              {[
                ["x_center", "X center"],
                ["y_center", "Y center"],
                ["width", "Width"],
                ["height", "Height"],
              ].map(([field, label]) => (
                <label key={field} className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {label}
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700 outline-none transition focus:border-brandBlue disabled:bg-slate-100"
                    disabled={!selectedAnnotation}
                    max="1"
                    min={field === "width" || field === "height" ? "0.001" : "0"}
                    step="0.001"
                    type="number"
                    value={selectedAnnotation ? selectedAnnotation[field] : ""}
                    onChange={(event) => updateSelectedAnnotationBox(field, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <button
              className="flex w-full items-center justify-between gap-3 text-left"
              onClick={() => setInsightsOpen((current) => !current)}
              type="button"
            >
              <div>
                <div className="text-sm font-semibold text-slate-900">Insights</div>
                <p className="mt-1 text-sm leading-6 text-slate-500">Latest assist and suggestion details stay here so the main labeling flow remains uncluttered.</p>
              </div>
              <span className="text-sm font-semibold text-slate-500">{insightsOpen ? "▲" : "▼"}</span>
            </button>
            {insightsOpen ? (
              <div className="mt-4 space-y-4">
                {autoLabelPreview ? (
                  <div className="rounded-2xl border border-brandBlue/15 bg-brandBlue/[0.04] p-3 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">Latest suggestion run</div>
                    <p className="mt-1">{autoLabelPreview.message}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone="normal">
                        {autoLabelPreview.source_label ?? (autoLabelPreview.mode_used === "grounding" ? "Prompt-based" : "YOLO")}
                      </Badge>
                      {autoLabelPreview.fallback_used ? <Badge tone="warning">Fallback used</Badge> : null}
                    </div>
                    <p className="mt-2">Suggested items: {formatCount(autoLabelPreview.suggested_label_count, "0")}</p>
                    {autoLabelPreview.low_confidence_item_count ? (
                      <p className="mt-1 text-brandRed">Low-confidence items: {formatCount(autoLabelPreview.low_confidence_item_count, "0")}</p>
                    ) : null}
                  </div>
                ) : null}
                {assistModelStatus ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-slate-900">Assist workflow status</div>
                      <Badge tone={assistPhase.tone}>{assistPhase.label}</Badge>
                    </div>
                    <p className="mt-1">{assistModelStatus.message}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {assistModelStatus?.summary?.labeled_images ? (
                        <Badge tone="normal">{formatCount(assistModelStatus.summary.labeled_images, "0")} labeled images</Badge>
                      ) : null}
                      {assistModelStatus?.summary?.train_images !== undefined ? (
                        <Badge tone="normal">{formatCount(assistModelStatus.summary.train_images, "0")} train</Badge>
                      ) : null}
                      {assistModelStatus?.summary?.val_images !== undefined ? (
                        <Badge tone="normal">{formatCount(assistModelStatus.summary.val_images, "0")} val</Badge>
                      ) : null}
                      {assistModelStatus?.summary?.base_model ? (
                        <Badge tone="normal">{assistModelStatus.summary.base_model}</Badge>
                      ) : null}
                    </div>
                    {assistModelStatus.warning ? (
                      <p className="mt-2 text-amber-700">{assistModelStatus.warning}</p>
                    ) : null}
                  </div>
                ) : null}
                {assistMode && assistSummary ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">Assist review summary</div>
                    <p className="mt-1">{assistSummary.focusMessage}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone="alert">High priority {formatCount(assistSummary?.prioritySummary?.high, "0")}</Badge>
                      <Badge tone="warning">Needs review {formatCount(assistSummary?.prioritySummary?.needs_review, "0")}</Badge>
                      <Badge tone="normal">Unlabeled {formatCount(assistSummary?.prioritySummary?.unlabeled, "0")}</Badge>
                      <Badge tone="compliant">Completed {formatCount(assistSummary?.prioritySummary?.completed, "0")}</Badge>
                    </div>
                  </div>
                ) : null}
                {!autoLabelPreview && !assistModelStatus && !(assistMode && assistSummary) ? (
                  <p className="text-sm leading-6 text-slate-500">No assist insights yet. They will appear here after you test auto-labeling or review propagated suggestions.</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <Button disabled={activeItemIndex <= 0} onClick={() => goToRelativeItem(-1)} type="button" variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Prev
            </Button>
            <Button disabled={!displayItems.length || activeItemIndex >= displayItems.length - 1} onClick={() => goToRelativeItem(1)} type="button" variant="outline">
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </aside>
      </main>
    </div>
  );
}
