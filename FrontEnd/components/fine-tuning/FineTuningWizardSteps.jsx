"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Database,
  HelpCircle,
  Rocket,
  Tag,
  Trash2,
  UploadCloud,
  Wand2,
} from "lucide-react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { API_BASE_URL } from "../visionLabConfig";
import AdvancedSettings from "./AdvancedSettings";
import UseCaseExtensionSection from "./UseCaseExtensionSection";

function StepShell({ eyebrow, title, helper, children, aside }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-panel">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{eyebrow}</div>
            <h3 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{title}</h3>
            {helper ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{helper}</p> : null}
          </div>
        </div>
        {children}
      </section>
      {aside ? <aside className="space-y-4">{aside}</aside> : null}
    </div>
  );
}

function SmallCard({ title, value, helper, tone = "normal" }) {
  const toneClass = tone === "accent" ? "border-brandBlue/20 bg-brandBlue/[0.04]" : tone === "warn" ? "border-brandRed/20 bg-brandRed/[0.04]" : "border-slate-200 bg-slate-50";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</div>
      <div className="mt-2 text-lg font-semibold text-slate-900">{value}</div>
      {helper ? <p className="mt-1 text-sm leading-6 text-slate-500">{helper}</p> : null}
    </div>
  );
}

function ChoiceCard({ active, title, helper, icon: Icon, badge, disabled = false, onClick }) {
  return (
    <button
      className={`rounded-2xl border p-4 text-left transition ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
          : active
            ? "border-brandRed bg-brandRed/5 shadow-sm"
            : "border-slate-200 bg-white hover:border-brandBlue/30 hover:bg-slate-50"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {Icon ? (
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${active ? "bg-brandRed text-white" : "bg-brandBlue/[0.08] text-brandBlue"}`}>
              <Icon className="h-4 w-4" />
            </span>
          ) : null}
          <div>
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            {helper ? <p className="mt-1 text-sm leading-6 text-slate-500">{helper}</p> : null}
          </div>
        </div>
        {badge ? <Badge tone={active ? "active" : "normal"}>{badge}</Badge> : null}
      </div>
    </button>
  );
}

function HelpBox({ title, children }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <button className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen((current) => !current)} type="button">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <HelpCircle className="h-4 w-4 text-brandBlue" />
          {title}
        </span>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{open ? "Hide" : "Open"}</span>
      </button>
      {open ? <div className="mt-3 text-sm leading-6 text-slate-600">{children}</div> : null}
    </div>
  );
}

function formatCount(value, fallback = "Not checked") {
  if (value === undefined || value === null) return fallback;
  return Number(value).toLocaleString();
}

function humanizeLabelStatus(status) {
  const normalized = String(status || "unknown").toLowerCase();
  if (normalized === "ready") return "Ready";
  if (normalized === "partial") return "Partial";
  if (normalized === "missing") return "Missing";
  return "Not confirmed";
}

function getDatasetLabelSummary(dataset, overrideStatus) {
  const status = String(overrideStatus ?? dataset?.label_status ?? "unknown").toLowerCase();
  if (dataset?.isInvalid) return { label: "Invalid prefix", tone: "warning", status };
  if (dataset?.label_display && !overrideStatus) return { label: dataset.label_display, tone: dataset.label_tone ?? (status === "ready" ? "compliant" : "warning"), status };
  if (status === "ready") return { label: "Labels ready", tone: "compliant", status };
  if (status === "partial") return { label: "Partial labels", tone: "warning", status };
  if (status === "missing") return { label: "Needs labels", tone: "warning", status };
  return { label: "Labels unknown", tone: "normal", status };
}

function getMatchingDatasetDetail(selectedDataset, selectedDatasetDetail) {
  if (!selectedDataset || !selectedDatasetDetail) return null;
  const detailDataset = selectedDatasetDetail.dataset ?? selectedDatasetDetail;
  const detailId = detailDataset.dataset_id ?? detailDataset.id ?? selectedDatasetDetail.dataset_id;
  if (detailId === undefined || detailId === null) return null;
  return String(detailId) === String(selectedDataset.id) ? selectedDatasetDetail : null;
}

function readinessTone(status) {
  if (status === "Ready") return "compliant";
  if (status === "Has warnings") return "warning";
  if (status === "Not checked") return "normal";
  if (status === "Needs labels" || status === "Invalid dataset") return "alert";
  return "alert";
}

function detailValue(value, fallback = "Not available") {
  if (value === undefined || value === null || value === "") return fallback;
  return value;
}

function titleize(value) {
  return String(value || "Not available")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanizeWorkflowIssue(issue) {
  const value = typeof issue === "string" ? issue : issue?.message ?? issue?.detail ?? issue?.code ?? "";
  const normalized = String(value).replace(/[_-]+/g, " ").trim();
  const lower = normalized.toLowerCase();
  if (!normalized) return "Review the selected dataset before training.";
  if (lower === "missing labels") return "No labels were detected. Add labels before training.";
  if (lower.includes("missing labels")) return "No labels were detected. Add labels before training.";
  if (lower.includes("no label")) return "No labels were detected for this dataset.";
  if (lower.includes("low file count")) return "Dataset is small; more examples may improve results.";
  if (lower.includes("unknown annotation format")) return "Annotation format could not be confirmed yet.";
  if (lower.includes("invalid minio prefix")) return "The selected MinIO prefix could not be validated.";
  if (lower.includes("unsupported")) return "Some files may not be supported for this tuning workflow.";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function workflowFromMode(labelingMode, labelReadiness) {
  if (labelingMode === "import-external" || labelingMode === "already-labeled") return "upload-existing";
  if (labelingMode === "auto-label") return "auto-label";
  if (labelingMode === "label-later") return "label-later";
  if (labelingMode === "prepare-labeling") return "annotate-manually";
  if (labelReadiness === "yes") return "upload-existing";
  if (labelReadiness === "no") return "auto-label";
  return "auto-label";
}

function buildLabelWorkflowState({ selectedDataset, selectedDatasetDetail, labelState, datasetReadyPayload }) {
  const dataset = selectedDatasetDetail?.dataset ?? {};
  const auditSummary = dataset.latest_audit?.summary ?? selectedDatasetDetail?.latest_audit?.summary ?? {};
  const raw = selectedDataset?.raw ?? {};
  const labelStatus = String(
    datasetReadyPayload?.label_status ??
      labelState?.current_label_status ??
      dataset.label_status ??
      selectedDataset?.label_status ??
      "unknown",
  ).toLowerCase();
  const itemCount = firstNonEmptyNumber(datasetReadyPayload?.item_count, labelState?.item_count, auditSummary.item_count, auditSummary.file_count, selectedDataset?.file_count, raw.file_count);
  const labelCount = firstNonEmptyNumber(datasetReadyPayload?.label_count, labelState?.label_count, auditSummary.label_count, auditSummary.label_file_count, raw.label_count);
  const rawWarnings = datasetReadyPayload?.warnings ?? labelState?.warnings ?? auditSummary.warnings;
  const rawBlockingIssues = datasetReadyPayload?.blocking_issues ?? labelState?.blocking_issues ?? auditSummary.blocking_issues;
  const warnings = normalizeMessageList(rawWarnings);
  const blockingIssues = normalizeMessageList(rawBlockingIssues);
  const backendStatus = datasetReadyPayload?.status ?? labelState?.status;
  const rawIssueText = JSON.stringify(rawBlockingIssues ?? "").toLowerCase();
  const labelCountUnknown = labelCount === null || labelCount === undefined;
  const labelsMissing = labelCount === 0 || labelStatus === "missing" || rawIssueText.includes("missing_labels") || rawIssueText.includes("no_label");

  let trainingStatus = "blocked";
  if (labelsMissing) trainingStatus = "blocked";
  else if (backendStatus === "ready_for_training") trainingStatus = "ready";
  else if (backendStatus === "ready_with_warnings") trainingStatus = "warning";
  else if (backendStatus === "blocked") trainingStatus = "blocked";
  else if (warnings.length || labelCountUnknown || labelStatus === "partial" || labelStatus === "unknown") trainingStatus = "warning";
  else if (labelStatus === "ready") trainingStatus = "ready";

  const actionMessage =
    trainingStatus === "ready"
      ? "Labels are present. Prepare the dataset handoff when you are ready."
      : trainingStatus === "warning"
        ? "Review label coverage or continue with warnings if this is acceptable."
        : "Choose a labeling path below. Training stays blocked until labels are available.";

  return {
    datasetName: selectedDataset?.name ?? labelState?.dataset_name ?? "Choose data first",
    itemCount,
    labelCount,
    labelStatus,
    taskType: datasetReadyPayload?.task_type ?? labelState?.task_type ?? dataset.task_type ?? "object_detection",
    source: datasetReadyPayload?.prepared_dataset_uri ?? [dataset.minio_bucket ?? raw.minio_bucket, dataset.minio_prefix ?? raw.minio_prefix].filter(Boolean).join("/"),
    warnings,
    blockingIssues: labelsMissing && !blockingIssues.length ? [humanizeWorkflowIssue("missing_labels")] : blockingIssues,
    trainingStatus,
    statusTitle:
      trainingStatus === "ready"
        ? "Ready for training"
        : trainingStatus === "warning"
          ? "Ready with warnings"
          : "Training blocked",
    statusHelper:
      trainingStatus === "ready"
        ? "Labels are present and the dataset can be prepared for training setup."
        : trainingStatus === "warning"
          ? "The dataset can move forward, but review the warnings before training."
          : "Training is blocked until annotations are added.",
    actionMessage,
  };
}

function firstNonEmptyNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function normalizeMessageList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(humanizeWorkflowIssue).filter(Boolean);
  return [humanizeWorkflowIssue(value)].filter(Boolean);
}

function AnnotationPathCard({ active, title, eyebrow, helper, icon: Icon, badge, primary = false, onClick }) {
  return (
    <button
      className={`rounded-3xl border p-5 text-left transition ${
        active
          ? primary
            ? "border-brandRed bg-brandRed/[0.06] shadow-sm"
            : "border-brandBlue bg-brandBlue/[0.04] shadow-sm"
          : "border-slate-200 bg-white hover:border-brandBlue/30 hover:bg-slate-50"
      }`}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${primary ? "bg-brandRed text-white" : "bg-brandBlue/[0.08] text-brandBlue"}`}>
          <Icon className="h-5 w-5" />
        </span>
        {badge ? <Badge tone={primary ? "active" : active ? "normal" : "warning"}>{badge}</Badge> : null}
      </div>
      <div className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</div>
      <div className="mt-2 text-lg font-semibold tracking-tight text-slate-900">{title}</div>
      <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p>
    </button>
  );
}

function fileExtensionLabel(fileName) {
  const suffix = String(fileName || "").split(".").pop();
  return suffix && suffix !== fileName ? `.${suffix.toLowerCase()}` : "Label";
}

function parsePromptTerms(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function makeBoxId(prefix = "box") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

function buildHandoffSummary(payload) {
  if (!payload) return null;
  const status = payload.status ?? "blocked";
  if (status === "ready_for_training") {
    return {
      tone: "accent",
      badgeTone: "compliant",
      title: "Handoff prepared",
      message: "Dataset can proceed to training setup.",
      action: "Next: continue to training setup when Step 4 is connected.",
    };
  }
  if (status === "ready_with_warnings") {
    return {
      tone: "warn",
      badgeTone: "warning",
      title: "Handoff prepared with warnings",
      message: "Review dataset warnings before training.",
      action: "Next: fix or accept warnings before moving into training setup.",
    };
  }
  return {
    tone: "warn",
    badgeTone: "alert",
    title: "Handoff blocked",
    message: "Dataset cannot enter training until labels are added or corrected.",
    action: "Next: choose a labeling path, then run validation again.",
  };
}

export function GetStartedStep({
  activeUseCase,
  datasetHealth,
  step1Data,
  stepOneDatasetState,
  stepLoading,
  stepError,
  isCheckingData,
  isStartingSetup,
  isStartingNewSetup,
  trainingJob,
  onAuditDataset,
  onNext,
  onStartNewSetup,
}) {
  const summaryCards = step1Data?.summary_cards ?? {};
  const dataCard = summaryCards.data_readiness;
  const datasetState = stepOneDatasetState ?? {
    classRows: [],
    balance: { title: "Class distribution unavailable", message: "Class distribution not available yet.", tone: "normal" },
    itemCount: dataCard?.file_count ?? null,
    labelCount: null,
    labelStatus: dataCard?.label_status ?? "unknown",
    hasSelectedDataset: Boolean(step1Data?.selected_dataset_id),
    labelsMissing: Boolean(step1Data?.selected_dataset_id) && dataCard?.label_status === "missing",
    hasWarnings: false,
    readinessStatus: step1Data?.selected_dataset_id ? "Has warnings" : "Not checked",
    recommendation: step1Data?.recommended_next_action ?? trainingJob.next_up,
    resumeMessage: step1Data?.resume_message ?? "",
    datasetName: step1Data?.selected_dataset_id ? dataCard?.dataset?.name ?? "Selected dataset" : "No dataset selected yet",
  };
  const hasSelectedDataset = Boolean(step1Data?.selected_dataset_id ?? datasetState.hasSelectedDataset);
  const examplesValue = datasetState.itemCount === null || datasetState.itemCount === undefined ? "Not checked" : `${formatCount(datasetState.itemCount)} examples`;
  const readinessStatus = datasetState.readinessStatus ?? (hasSelectedDataset ? (datasetState.labelsMissing ? "Needs labels" : "Has warnings") : "Not checked");
  const labelsFoundSummary =
    datasetState.itemCount !== null &&
    datasetState.itemCount !== undefined &&
    datasetState.labelCount !== null &&
    datasetState.labelCount !== undefined
      ? `Labels found: ${formatCount(datasetState.labelCount)} of ${formatCount(datasetState.itemCount)} images`
      : `Current label status: ${humanizeLabelStatus(datasetState.labelStatus)}`;
  const safePathSteps = [
    "Choose data",
    "Confirm labels",
    "Train safely",
    "Compare results",
    "Go live only after approval",
  ];
  const actionBusy = Boolean(stepLoading || isCheckingData || isStartingSetup || isStartingNewSetup);

  return (
    <StepShell
      eyebrow="Step 1"
      helper="Follow the safe path first. This step explains the workflow and checks whether the current dataset is ready to move into setup."
      title={step1Data?.title ?? `Tune ${activeUseCase.title}`}
    >
      {stepLoading ? (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Loading fine-tuning setup...</div>
      ) : null}
      {stepError ? (
        <div className="mb-4 rounded-2xl border border-brandRed/20 bg-brandRed/[0.04] p-4 text-sm text-brandRed">{stepError}</div>
      ) : null}
      {!stepError && step1Data?.model_available === false && step1Data?.model_warning ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-700">{step1Data.model_warning}</div>
      ) : null}

      <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <div className="text-lg font-semibold text-slate-900">Safe fine-tuning path</div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Nothing is deployed automatically. Each stage requires review before moving forward.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {safePathSteps.map((step, index) => (
            <div key={step} className="rounded-2xl border border-white bg-white p-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brandBlue/[0.08] text-sm font-semibold text-brandBlue">
                {index + 1}
              </div>
              <div className="mt-3 text-sm font-semibold text-slate-900">{step}</div>
            </div>
          ))}
        </div>
      </div>

      {activeUseCase.id === "region-alerts" ? (
        <div className="mt-5 rounded-3xl border border-brandBlue/15 bg-brandBlue/[0.04] p-5">
          <div className="text-lg font-semibold text-slate-900">What this fine-tuning improves</div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Region Alerts fine-tuning improves the person detector. The restricted zone, confidence threshold, alert delay, and alert rules are configured separately in the Integration tab.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Can improve</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">person detection accuracy</div>
            </div>
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Configured separately</div>
              <div className="mt-2 space-y-2 text-sm text-slate-700">
                <div>ROI / restricted zone</div>
                <div>alert delay</div>
                <div>confidence threshold</div>
                <div>intrusion rule</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {activeUseCase.id === "class-wise-object-counting" ? (
        <div className="mt-5 rounded-3xl border border-brandBlue/15 bg-brandBlue/[0.04] p-5">
          <div className="text-lg font-semibold text-slate-900">What this fine-tuning improves</div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Fine-tuning improves the object detector used for counting. Object counts are derived from detections and are not trained directly.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Can improve</div>
              <div className="mt-2 space-y-2 text-sm text-slate-700">
                <div>object detection accuracy</div>
                <div>missed or false detections</div>
                <div>better counting reliability</div>
              </div>
            </div>
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Configured separately</div>
              <div className="mt-2 space-y-2 text-sm text-slate-700">
                <div>counting logic</div>
                <div>aggregation rules</div>
                <div>region-based counting</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {activeUseCase.id === "object-tracking" ? (
        <div className="mt-5 rounded-3xl border border-brandBlue/15 bg-brandBlue/[0.04] p-5">
          <div className="text-lg font-semibold text-slate-900">What this fine-tuning improves</div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Fine-tuning improves the object detector used by Object Tracking. Tracking IDs, re-identification behavior, and trajectory logic are handled separately during processing.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Can improve</div>
              <div className="mt-2 space-y-2 text-sm text-slate-700">
                <div>person and vehicle detection accuracy</div>
                <div>missed or false object detections</div>
              </div>
            </div>
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Configured separately</div>
              <div className="mt-2 space-y-2 text-sm text-slate-700">
                <div>tracking IDs</div>
                <div>trajectory/path logic</div>
                <div>re-identification behavior</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {activeUseCase.id === "speed-estimation" ? (
        <div className="mt-5 rounded-3xl border border-brandBlue/15 bg-brandBlue/[0.04] p-5">
          <div className="text-lg font-semibold text-slate-900">What this fine-tuning improves</div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Fine-tuning improves the object detector used by Speed Estimation. Speed calculation, calibration, and thresholds are configured separately during processing.
          </p>
        </div>
      ) : null}
      {activeUseCase.id === "crack-detection" ? (
        <div className="mt-5 rounded-3xl border border-brandBlue/15 bg-brandBlue/[0.04] p-5">
          <div className="text-lg font-semibold text-slate-900">What this fine-tuning improves</div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Fine-tuning improves the crack detector used for construction and infrastructure inspection. Use bounding-box labels around visible cracks, and include both cracked and non-cracked surfaces so the model learns what should not trigger detections.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Current model</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">Crack detector</div>
              <div className="mt-2 text-sm text-slate-700">Task: object detection</div>
            </div>
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Dataset needed</div>
              <div className="mt-2 space-y-2 text-sm text-slate-700">
                <div>images of cracked surfaces</div>
                <div>images of non-cracked surfaces</div>
                <div>YOLO bounding-box labels for crack regions</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {activeUseCase.id === "unsafe-behavior-detection" ? (
        <div className="mt-5 rounded-3xl border border-brandBlue/15 bg-brandBlue/[0.04] p-5">
          <div className="text-lg font-semibold text-slate-900">What this fine-tuning improves</div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Fine-tuning in this flow prepares object-detection labels for unsafe workplace events. Smoking can use the installed smoking detector for suggestions when available, while phone usage currently remains a COCO person-plus-phone rule that should be reviewed manually during labeling.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Current smoking model</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">Unsafe smoking detector</div>
              <div className="mt-2 text-sm text-slate-700">Task: object detection</div>
              <div className="mt-2 text-sm text-slate-700">Phone usage uses COCO person + phone association during inference.</div>
            </div>
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Dataset needed</div>
              <div className="mt-2 space-y-2 text-sm text-slate-700">
                <div>workplace images or extracted frames</div>
                <div>YOLO bounding-box labels for smoking events</div>
                <div>YOLO bounding-box labels for phone_usage events</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`mt-5 rounded-3xl border p-5 ${!hasSelectedDataset ? "border-slate-200 bg-slate-50" : readinessStatus === "Needs labels" || readinessStatus === "Invalid dataset" ? "border-brandRed/20 bg-brandRed/[0.04]" : "border-brandBlue/15 bg-brandBlue/[0.04]"}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={readinessTone(readinessStatus)}>{readinessStatus}</Badge>
            </div>
            <div className="mt-4 text-lg font-semibold text-slate-900">Dataset status</div>
            {hasSelectedDataset ? (
              <>
                {datasetState.resumeMessage ? (
                  <div className="mt-3 rounded-2xl border border-white bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700">
                    {datasetState.resumeMessage}
                  </div>
                ) : null}
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                  Dataset check: <span className="font-semibold text-slate-900">{readinessStatus}</span>. Preparing <span className="font-semibold text-slate-900">{datasetState.datasetName}</span> with {examplesValue.toLowerCase()}.
                </p>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{labelsFoundSummary}</p>
                {datasetState.labelsMissing ? (
                  <div className="mt-4 rounded-2xl border border-brandRed/20 bg-white/80 p-4 text-sm leading-6 text-slate-700">
                    <div className="font-semibold text-brandRed">Labels are missing.</div>
                    <p>Please continue to the Labels step before training.</p>
                  </div>
                ) : null}
                {!datasetState.labelsMissing && datasetState.hasWarnings ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-white/80 p-4 text-sm leading-6 text-slate-700">
                    <div className="font-semibold text-slate-900">Warnings found.</div>
                    <p>Review the latest dataset check details before training.</p>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mt-3 rounded-2xl border border-white bg-white p-4 text-sm leading-6 text-slate-600">
                <div className="font-semibold text-slate-900">No dataset selected yet</div>
                <p className="mt-1">Review the safe fine-tuning path, then choose or register data in Step 2.</p>
              </div>
            )}
            <div className="mt-4 rounded-2xl border border-white bg-white/75 p-4">
              <div className="text-sm font-semibold text-slate-900">Recommended next action</div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{datasetState.recommendation}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            {hasSelectedDataset ? (
              <Button disabled={actionBusy || !step1Data?.actions?.can_run_data_check} onClick={onAuditDataset} type="button" variant="outline">
                {isCheckingData ? "Checking..." : "Run data check"}
              </Button>
            ) : null}
            {hasSelectedDataset ? (
              <Button disabled={actionBusy} onClick={onStartNewSetup} type="button" variant="outline">
                {isStartingNewSetup ? "Resetting..." : "Start new setup"}
              </Button>
            ) : null}
            <Button disabled={actionBusy || !step1Data} onClick={onNext} type="button">
              {isStartingSetup ? (hasSelectedDataset ? "Continuing..." : "Opening...") : hasSelectedDataset ? "Continue" : "Choose data"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </StepShell>
  );
}

export function DataStep({
  datasets,
  selectedDataset,
  selectedDatasetId,
  selectedDatasetDetail,
  datasetSource,
  supportedFormats,
  datasetHealth,
  loading,
  error,
  actionLoading,
  registerForm,
  onDatasetSourceChange,
  onDatasetSelect,
  onDatasetRegister,
  onDatasetDeleteRequest,
  onRefreshDatasets,
  onRegisterFormChange,
}) {
  const [pendingDeleteDataset, setPendingDeleteDataset] = useState(null);
  const sourceOptions = [
    { value: "existing", label: "Use MinIO dataset", helper: "Current working path: register a MinIO bucket and prefix, then select it for this tuning run.", icon: Database },
  ];
  const selectedDetail = getMatchingDatasetDetail(selectedDataset, selectedDatasetDetail);
  const selectedLabelStatus = selectedDetail?.label_readiness ?? selectedDetail?.dataset?.label_status ?? selectedDataset?.label_status;
  const selectedLabelSummary = getDatasetLabelSummary(selectedDataset, selectedLabelStatus);
  const selectedDetailDataset = selectedDetail?.dataset ?? {};
  const isClassWiseObjectCountingUseCase = [
    selectedDetailDataset.usecase_slug,
    selectedDataset?.usecase_slug,
    selectedDataset?.raw?.usecase_slug,
    registerForm?.minio_prefix,
    registerForm?.name,
  ].some((value) => String(value || "").toLowerCase().includes("counting"));
  const isObjectTrackingUseCase = [
    selectedDetailDataset.usecase_slug,
    selectedDataset?.usecase_slug,
    selectedDataset?.raw?.usecase_slug,
  ].some((value) => value === "object-tracking");
  const latestAudit = selectedDetailDataset.latest_audit ?? {};
  const auditSummary = latestAudit.summary ?? {};
  const labelFileCount = detailValue(auditSummary.label_file_count ?? selectedDataset?.raw?.label_file_count, "Not checked");
  const totalObjects = detailValue(auditSummary.total_objects ?? selectedDataset?.file_count, "Not checked");
  const labelCoverage = auditSummary.label_coverage !== undefined && auditSummary.label_coverage !== null ? `${Math.round(Number(auditSummary.label_coverage) * 100)}%` : "Not checked";
  const selectedReadinessValue = !selectedDataset
    ? "Not checked"
    : selectedDataset.isInvalid
      ? "Invalid dataset"
      : selectedLabelSummary.status === "missing"
        ? "Needs labels"
        : selectedLabelSummary.status === "partial"
          ? "Has warnings"
          : "Ready";
  const selectedReadinessHelper = !selectedDataset
    ? "Choose a dataset to run checks."
    : selectedDataset.isInvalid
      ? selectedDataset.invalidReason
      : labelCoverage !== "Not checked"
        ? `Label coverage: ${labelCoverage}`
        : selectedDetail?.dataset?.readiness_status ?? selectedDataset?.raw?.readiness_status ?? selectedDataset?.raw?.audit_status ?? datasetHealth.readiness;
  const selectedRecommendation = !selectedDataset
    ? "Recommended: choose data and run a data check."
    : selectedDataset.isInvalid
      ? "Recommended: fix the MinIO prefix or choose another dataset."
      : selectedLabelSummary.status === "missing"
        ? "Recommended: start labeling before training."
        : selectedLabelSummary.status === "partial"
          ? "Recommended: add more labels before training."
          : "Recommended: refresh the dataset after any label changes.";
  const issueMessages = [
    ...(Array.isArray(latestAudit.issues) ? latestAudit.issues : []),
    ...(selectedDataset?.isInvalid ? [{ message: selectedDataset.invalidReason }] : []),
  ]
    .map((issue) => issue?.message ?? issue?.detail ?? issue?.code ?? String(issue))
    .filter(Boolean);

  return (
    <StepShell
      eyebrow="Step 2"
      helper="Choose the dataset for this tuning run. The working path today is MinIO-backed registration."
      title="Your data"
      aside={
        <>
          <SmallCard
            helper={selectedDataset ? `${selectedDataset.item_count} · ${selectedLabelSummary.label}` : "No dataset selected"}
            title="Selected data"
            tone="accent"
            value={selectedDataset?.name ?? "Choose data"}
          />
          <SmallCard helper={selectedReadinessHelper} title="Dataset check" value={selectedReadinessValue} />
          <SmallCard helper={selectedRecommendation} title="Next action" value={selectedDataset ? `${labelFileCount} labeled files` : "Choose data"} />
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Accepted examples</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {supportedFormats.slice(0, 4).map((format) => (
                <span key={format} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                  {format}
                </span>
              ))}
            </div>
          </div>
        </>
      }
    >
      {loading ? <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Loading saved datasets...</div> : null}
      {error ? <div className="mb-4 rounded-2xl border border-brandRed/20 bg-brandRed/[0.04] p-4 text-sm text-brandRed">{error}</div> : null}

      <div className="mb-4 rounded-2xl border border-brandBlue/15 bg-brandBlue/[0.04] p-4 text-sm leading-6 text-slate-600">
        <span className="font-semibold text-slate-900">Current data source:</span> MinIO bucket/prefix registration.
      </div>

      <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-slate-700">
        <span className="font-semibold text-slate-900">Step 3 currently supports image datasets only.</span> Video or mixed datasets can still be registered here, but the dedicated annotation editor only works on image items today.
      </div>
      {isClassWiseObjectCountingUseCase ? (
        <div className="mb-4 rounded-2xl border border-brandBlue/15 bg-brandBlue/[0.04] p-4 text-sm leading-6 text-slate-700">
          Class-wise Object Counting fine-tuning uses labeled images or extracted video frames. Pure video datasets can be processed in Integration, but Step 3 annotation requires image frames.
        </div>
      ) : null}
      {isObjectTrackingUseCase ? (
        <div className="mb-4 rounded-2xl border border-brandBlue/15 bg-brandBlue/[0.04] p-4 text-sm leading-6 text-slate-700">
          Object Tracking fine-tuning uses labeled images or extracted video frames. Pure video datasets can be processed in Integration, but Step 3 annotation requires image frames.
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        {sourceOptions.map((option) => (
          <ChoiceCard
            key={option.value}
            active={datasetSource === option.value}
            badge={option.badge}
            disabled={option.disabled}
            helper={option.helper}
            icon={option.icon}
            title={option.label}
            onClick={() => onDatasetSourceChange(option.value)}
          />
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Saved data</div>
          <div className="mt-3 space-y-3">
            {datasets.length ? datasets.map((dataset) => {
              const labelSummary = getDatasetLabelSummary(dataset);
              return (
                <div
                  key={dataset.id}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedDatasetId === dataset.id
                      ? "border-brandRed bg-white shadow-sm"
                      : dataset.isInvalid
                        ? "border-brandRed/20 bg-brandRed/[0.03] opacity-80 hover:border-brandRed/40"
                        : "border-slate-200 bg-white hover:border-brandBlue/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button className="min-w-0 flex-1 text-left" onClick={() => onDatasetSelect(dataset.id)} type="button">
                      <div className="font-semibold text-slate-900">{dataset.name}</div>
                      <p className="mt-1 text-sm text-slate-500">{dataset.item_count} · {dataset.format}</p>
                      {dataset.isInvalid ? <p className="mt-1 text-xs font-semibold text-brandRed">{dataset.invalidReason}</p> : null}
                    </button>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge tone={labelSummary.tone}>{labelSummary.label}</Badge>
                      <button
                        className="rounded-full border border-brandRed/20 px-3 py-1 text-xs font-semibold text-brandRed transition hover:bg-brandRed/[0.06]"
                        onClick={() => setPendingDeleteDataset(dataset)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-500">
                No saved datasets are registered for this use case yet. Register a MinIO prefix to begin.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Register MinIO dataset</div>
            <Button disabled={actionLoading} onClick={onRefreshDatasets} type="button" variant="outline">
              Refresh Dataset
            </Button>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">Point the fine-tuning flow at the bucket and prefix that already contain your images or clips.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              Dataset name
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal outline-none transition focus:border-brandBlue"
                value={registerForm.name}
                onChange={(event) => onRegisterFormChange("name", event.target.value)}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Source type
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-500"
                readOnly
                value={registerForm.source_type}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              MinIO bucket
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal outline-none transition focus:border-brandBlue"
                value={registerForm.minio_bucket}
                onChange={(event) => onRegisterFormChange("minio_bucket", event.target.value)}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              MinIO prefix
              <input
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal outline-none transition focus:border-brandBlue"
                value={registerForm.minio_prefix}
                onChange={(event) => onRegisterFormChange("minio_prefix", event.target.value)}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Media type
              <select
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal outline-none transition focus:border-brandBlue"
                value={registerForm.media_type}
                onChange={(event) => onRegisterFormChange("media_type", event.target.value)}
              >
                <option value="mixed">Mixed</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <div className="flex items-end">
              <Button className="w-full" disabled={actionLoading} onClick={onDatasetRegister} type="button">
                {actionLoading ? "Registering..." : "Register dataset"}
              </Button>
            </div>
          </div>

          {selectedDataset ? (
            <div
              className={`mt-4 rounded-2xl border p-4 text-sm leading-6 text-slate-600 ${
                selectedDataset.isInvalid ? "border-brandRed/20 bg-brandRed/[0.04]" : "border-brandBlue/15 bg-brandBlue/[0.04]"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-slate-900">{selectedDataset.name}</div>
                <Badge tone={selectedLabelSummary.tone}>{selectedLabelSummary.label}</Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white bg-white/80 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Source</div>
                  <div className="mt-2 text-slate-700">
                    <div><span className="font-semibold">Type:</span> {titleize(selectedDataset.source)}</div>
                    <div><span className="font-semibold">Bucket:</span> {detailValue(selectedDetailDataset.minio_bucket ?? selectedDataset.raw?.minio_bucket)}</div>
                    <div className="break-all"><span className="font-semibold">Prefix:</span> {detailValue(selectedDetailDataset.minio_prefix ?? selectedDataset.raw?.minio_prefix)}</div>
                  </div>
                </div>
                <div className="rounded-2xl border border-white bg-white/80 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Files & labels</div>
                  <div className="mt-2 text-slate-700">
                    <div><span className="font-semibold">Examples:</span> {selectedDataset.file_count}</div>
                    <div><span className="font-semibold">Total files scanned:</span> {totalObjects}</div>
                    <div><span className="font-semibold">Label files:</span> {labelFileCount}</div>
                    <div><span className="font-semibold">Coverage:</span> {labelCoverage}</div>
                  </div>
                </div>
                <div className="rounded-2xl border border-white bg-white/80 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Readiness</div>
                  <div className="mt-2 text-slate-700">
                    <div><span className="font-semibold">Label status:</span> {humanizeLabelStatus(selectedLabelSummary.status)}</div>
                    <div><span className="font-semibold">Readiness:</span> {detailValue(selectedReadinessHelper)}</div>
                    <div><span className="font-semibold">Score:</span> {selectedReadinessValue}</div>
                  </div>
                </div>
                <div className="rounded-2xl border border-white bg-white/80 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Training handoff</div>
                  <div className="mt-2 text-slate-700">
                    <div><span className="font-semibold">Task type:</span> Confirmed during handoff</div>
                    <div><span className="font-semibold">Annotation format:</span> Confirmed during handoff</div>
                    <div><span className="font-semibold">Dataset version:</span> Created when handoff is prepared</div>
                  </div>
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-white bg-white/80 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Warnings / blockers</div>
                {issueMessages.length ? (
                  <div className="mt-2 space-y-2">
                    {issueMessages.slice(0, 4).map((message) => (
                      <div key={message} className="rounded-xl bg-brandRed/[0.05] px-3 py-2 text-sm text-slate-700">
                        {message}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No dataset blockers are currently reported.</p>
                )}
              </div>
            </div>
          ) : null}

          <div className="mt-5 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">What happens next</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {datasetHealth.top_actions.map((action) => (
              <div key={action} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                {action}
              </div>
            ))}
          </div>
          <HelpBox title="What good examples look like">
            Use the same camera angles, lighting, and difficult scenes that happen in real use. If the live scene is crowded, dark, blurry, or reflective, include those examples too.
          </HelpBox>
        </div>
      </div>
      {pendingDeleteDataset ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-brandRed/20 bg-white p-6 shadow-panel">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-brandRed">Remove dataset</div>
            <h4 className="mt-3 text-xl font-semibold text-slate-950">Remove {pendingDeleteDataset.name}?</h4>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              This only removes the dataset registration from this fine-tuning flow. It does not delete any MinIO files or objects.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button disabled={actionLoading} onClick={() => setPendingDeleteDataset(null)} type="button" variant="outline">
                Cancel
              </Button>
              <Button
                disabled={actionLoading}
                onClick={() => {
                  onDatasetDeleteRequest?.(pendingDeleteDataset);
                  setPendingDeleteDataset(null);
                }}
                type="button"
              >
                {actionLoading ? "Removing..." : "Remove dataset"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </StepShell>
  );
}

export function LabelsStep({
  selectedDataset,
  selectedDatasetDetail,
  labelState,
  datasetReadyPayload,
  annotationEditorHref,
  loading,
  error,
}) {
  const workflowState = buildLabelWorkflowState({ selectedDataset, selectedDatasetDetail, labelState, datasetReadyPayload });
  const handoffSummary = buildHandoffSummary(datasetReadyPayload);
  const statusTone = workflowState.trainingStatus === "ready" ? "accent" : workflowState.trainingStatus === "warning" ? "warn" : "warn";
  const statusBadgeTone = workflowState.trainingStatus === "ready" ? "compliant" : workflowState.trainingStatus === "warning" ? "warning" : "alert";

  const renderEditorButton = (variant = "default") => {
    const className =
      variant === "outline"
        ? "inline-flex items-center justify-center rounded-lg border border-brand-blue px-4 py-2.5 text-sm font-semibold text-brand-blue transition hover:bg-brand-blue-tint"
        : "inline-flex items-center justify-center rounded-lg bg-brand-red px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-red-light";

    return annotationEditorHref ? (
      <Link className={className} href={annotationEditorHref}>
        Start Labeling
      </Link>
    ) : (
      <Button disabled type="button" variant={variant}>
        Start Labeling
      </Button>
    );
  };

  return (
    <StepShell
      eyebrow="Step 3"
      helper="Label a few sample images manually. Then test auto-labeling before applying it to the full dataset."
      title="Labels"
      aside={
        <>
          <SmallCard helper={`${formatCount(workflowState.itemCount, "No")} examples selected`} title="Dataset" value={workflowState.datasetName} />
          <SmallCard helper={workflowState.statusHelper} title="System status" tone={statusTone} value={workflowState.statusTitle} />
          <SmallCard
            helper={workflowState.taskType ? workflowState.taskType.replace(/_/g, " ") : "Task type will be confirmed during handoff."}
            title="Labels found"
            tone={workflowState.labelCount ? "accent" : "warn"}
            value={workflowState.labelCount === null ? "Not checked" : formatCount(workflowState.labelCount, "0")}
          />
        </>
      }
    >
      {loading ? <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Loading label status...</div> : null}
      {error ? <div className="mb-4 rounded-2xl border border-brandRed/20 bg-brandRed/[0.04] p-4 text-sm text-brandRed">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_0.95fr]">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Dataset being labeled</div>
              <p className="mt-1 text-sm leading-6 text-slate-500">Confirm the selected dataset before choosing a labeling path.</p>
            </div>
            <Badge tone={statusBadgeTone}>{workflowState.statusTitle}</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Dataset</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{workflowState.datasetName}</div>
            </div>
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Current labels</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{humanizeLabelStatus(workflowState.labelStatus)}</div>
            </div>
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Examples</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{formatCount(workflowState.itemCount, "Not checked")}</div>
            </div>
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Label files</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{formatCount(workflowState.labelCount, "Not checked")}</div>
            </div>
          </div>
          {workflowState.source ? <p className="mt-3 break-all text-xs leading-5 text-slate-500">Source: {workflowState.source}</p> : null}
        </div>

        <div className={`rounded-3xl border p-5 ${workflowState.trainingStatus === "ready" ? "border-brandBlue/20 bg-brandBlue/[0.04]" : "border-brandRed/20 bg-brandRed/[0.04]"}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">{workflowState.statusTitle}</div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{workflowState.statusHelper}</p>
            </div>
            <Badge tone={statusBadgeTone}>{workflowState.trainingStatus === "ready" ? "Ready" : workflowState.trainingStatus === "warning" ? "Review" : "Blocked"}</Badge>
          </div>
          {workflowState.blockingIssues.length ? (
            <div className="mt-4 space-y-2">
              {workflowState.blockingIssues.map((issue) => (
                <div key={issue} className="rounded-2xl border border-brandRed/15 bg-white/80 px-3 py-2 text-sm text-slate-700">
                  {issue}
                </div>
              ))}
            </div>
          ) : workflowState.warnings.length ? (
            <div className="mt-4 space-y-2">
              {workflowState.warnings.map((warning) => (
                <div key={warning} className="rounded-2xl border border-brandRed/10 bg-white/80 px-3 py-2 text-sm text-slate-700">
                  {warning}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-slate-600">No blocking label issues are currently reported.</p>
          )}
        </div>
      </div>

      <div className={`mt-5 rounded-2xl border p-4 text-sm leading-6 ${workflowState.trainingStatus === "ready" ? "border-brandBlue/15 bg-brandBlue/[0.04] text-slate-600" : "border-brandRed/20 bg-brandRed/[0.04] text-slate-700"}`}>
        <div className="font-semibold text-slate-900">Workflow recommendation</div>
        <p>Label a few sample images manually. Then test auto-labeling before applying it to the full dataset.</p>
      </div>

      <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-5">
        <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
          <div>
            <div className="text-lg font-semibold text-slate-900">Guided labeling flow</div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Start in the dedicated annotation editor, label a few sample images manually, then test auto-labeling before you apply it to the rest of the dataset.
            </p>
            <div className="mt-4 rounded-2xl border border-brandBlue/15 bg-brandBlue/[0.04] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Start with manual labels</div>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    All predictions stay as suggestions until you review them and save the accepted labels.
                  </p>
                </div>
                <Badge tone={annotationEditorHref ? "normal" : "warning"}>{annotationEditorHref ? "Ready" : "Session required"}</Badge>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {renderEditorButton()}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">What happens next</div>
            <div className="mt-3 space-y-3">
              {[
                "Label a few sample images manually.",
                "Test auto-labeling on a few unseen images.",
                "Review, approve, save, then label the remaining images.",
              ].map((step, index) => (
                <div key={step} className="flex items-center gap-3 rounded-2xl border border-white bg-white/80 p-3 text-sm text-slate-600">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brandBlue/[0.08] text-xs font-semibold text-brandBlue">{index + 1}</span>
                  {step}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Start Step 3</div>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Label a few sample images manually. Then test auto-labeling before applying it to the full dataset.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {renderEditorButton("outline")}
          </div>
        </div>
        {workflowState.trainingStatus === "blocked" ? (
          <p className="mt-3 text-sm leading-6 text-brandRed">Training is blocked until labels are added. The footer action can still prepare a handoff response, but backend validation will mark it blocked.</p>
        ) : null}
      </div>

      {datasetReadyPayload && handoffSummary ? (
        <div className={`mt-5 rounded-2xl border p-4 text-sm leading-6 text-slate-600 ${handoffSummary.tone === "accent" ? "border-brandBlue/20 bg-brandBlue/[0.04]" : "border-brandRed/20 bg-brandRed/[0.04]"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-900">{handoffSummary.title}</div>
              <p className="mt-1">{handoffSummary.message}</p>
            </div>
            <Badge tone={handoffSummary.badgeTone}>{datasetReadyPayload.status}</Badge>
          </div>
          <div className="mt-3 rounded-2xl border border-white bg-white/75 p-3">
            <div className="font-semibold text-slate-900">Recommended next action</div>
            <p>{handoffSummary.action}</p>
          </div>
          <p className="mt-3 break-all">Dataset URI: {datasetReadyPayload.prepared_dataset_uri}</p>
          {datasetReadyPayload.prepared_dataset_manifest_uri ? <p className="break-all">Manifest: {datasetReadyPayload.prepared_dataset_manifest_uri}</p> : null}
          {datasetReadyPayload.blocking_issues?.length ? (
            <div className="mt-2 text-brandRed">Blocked because: {datasetReadyPayload.blocking_issues.map(humanizeWorkflowIssue).join(", ")}</div>
          ) : null}
        </div>
      ) : null}
    </StepShell>
  );
}

export function LabelsStepLegacy({
  labelReadiness,
  labelingMode,
  selectedDataset,
  selectedDatasetDetail,
  supportedFormats,
  labelState,
  datasetReadyPayload,
  loading,
  error,
  actionLoading,
  onLabelReadinessChange,
  onLabelingModeChange,
  onAuditDataset,
  onLabelImport,
  onLoadAnnotationWorkspace,
  onSaveManualAnnotations,
  onAutoLabelDataset,
  onAssistLabelDataset,
}) {
  const [activeWorkflow, setActiveWorkflow] = useState(() => workflowFromMode(labelingMode, labelReadiness));
  const [autoLabelPrompt, setAutoLabelPrompt] = useState("");
  const [autoLabelPreview, setAutoLabelPreview] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importFileName, setImportFileName] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [importStatusMessage, setImportStatusMessage] = useState("");
  const [manualWorkspaceOpen, setManualWorkspaceOpen] = useState(false);
  const [manualWorkspace, setManualWorkspace] = useState(null);
  const [activeItemId, setActiveItemId] = useState("");
  const [annotationsByItem, setAnnotationsByItem] = useState({});
  const [suggestionsByItem, setSuggestionsByItem] = useState({});
  const [selectedBoxId, setSelectedBoxId] = useState("");
  const [drawStart, setDrawStart] = useState(null);
  const [draftBox, setDraftBox] = useState(null);
  const [manualSelectedClass, setManualSelectedClass] = useState("person");
  const [manualSaveResult, setManualSaveResult] = useState(null);
  const [manualAnnotationNote, setManualAnnotationNote] = useState("");
  const [manualNoteSaved, setManualNoteSaved] = useState(false);
  const [labelLaterConfirmed, setLabelLaterConfirmed] = useState(false);
  const [workflowMessage, setWorkflowMessage] = useState("");
  const workflowState = buildLabelWorkflowState({ selectedDataset, selectedDatasetDetail, labelState, datasetReadyPayload });
  const acceptedFormats = datasetReadyPayload?.accepted_formats?.length ? datasetReadyPayload.accepted_formats : supportedFormats;
  const handoffSummary = buildHandoffSummary(datasetReadyPayload);
  const statusTone = workflowState.trainingStatus === "ready" ? "accent" : workflowState.trainingStatus === "warning" ? "warn" : "warn";
  const statusBadgeTone = workflowState.trainingStatus === "ready" ? "compliant" : workflowState.trainingStatus === "warning" ? "warning" : "alert";
  const workflowCards = [
    {
      id: "upload-existing",
      mode: "import-external",
      title: "Upload Existing Labels",
      eyebrow: "Import labels",
      helper: "Import YOLO, COCO, CVAT, or Label Studio exports when annotations already exist.",
      icon: UploadCloud,
      badge: "YOLO / COCO",
    },
    {
      id: "annotate-manually",
      mode: "prepare-labeling",
      title: "Annotate Manually",
      eyebrow: "Draw boxes",
      helper: "Open a manual labeling workspace for small datasets, QA review, or correcting suggestions.",
      icon: Tag,
      badge: "Editor",
    },
    {
      id: "auto-label",
      mode: "auto-label",
      title: "Auto-Label Dataset",
      eyebrow: "AI assist",
      helper: "Describe the objects to find, generate suggested boxes, then review before training.",
      icon: Rocket,
      badge: "Recommended",
      primary: true,
    },
    {
      id: "label-later",
      mode: "label-later",
      title: "Label Later",
      eyebrow: "Defer safely",
      helper: "Store this dataset now. Training remains blocked until labels are added.",
      icon: Database,
      badge: "Blocked",
    },
  ];
  const promptSuggestions = ["helmet", "vest", "fire", "smoke", "person"];
  const manualClassOptions = manualWorkspace?.classes?.length ? manualWorkspace.classes : ["person", "helmet", "vest", "fire", "smoke"];
  const manualSelectedItem = manualWorkspace?.items?.find((item) => itemKey(item) === activeItemId) ?? manualWorkspace?.items?.[0] ?? null;
  const activeKey = itemKey(manualSelectedItem) || activeItemId;
  const currentAnnotations = activeKey ? annotationsByItem[activeKey] ?? [] : [];
  const currentSuggestions = activeKey ? suggestionsByItem[activeKey] ?? [] : [];
  const selectedAnnotation = currentAnnotations.find((box) => box.id === selectedBoxId) ?? null;

  useEffect(() => {
    setActiveWorkflow(workflowFromMode(labelingMode, labelReadiness));
  }, [labelingMode, labelReadiness]);

  const handleWorkflowSelect = (workflow) => {
    setActiveWorkflow(workflow.id);
    setWorkflowMessage("");
    if (workflow.id === "annotate-manually") {
      setManualWorkspaceOpen(true);
      setWorkflowMessage("Manual annotation workspace selected. Open the editor to load dataset images and save YOLO labels.");
    }
    onLabelingModeChange(workflow.mode);
  };

  const showPlaceholder = (message) => {
    setWorkflowMessage(message);
  };

  const addPromptSuggestion = (suggestion) => {
    setAutoLabelPrompt((current) => {
      const terms = parsePromptTerms(current);
      return terms.includes(suggestion) ? current : [...terms, suggestion].join(", ");
    });
  };

  const applyWorkspace = (workspace, preferredItemId = "") => {
    const items = Array.isArray(workspace?.items) ? workspace.items : [];
    const nextActiveItemId = preferredItemId || itemKey(items[0]) || "";
    setManualWorkspace(workspace);
    setAnnotationsByItem(normalizeWorkspaceItems(items));
    setSuggestionsByItem({});
    setActiveItemId(nextActiveItemId);
    setSelectedBoxId("");
    setDrawStart(null);
    setDraftBox(null);
    setManualSelectedClass(workspace?.classes?.[0] ?? "person");
    return nextActiveItemId;
  };

  const loadWorkspace = async (message = "Loading manual annotation workspace from the selected dataset.") => {
    setManualWorkspaceOpen(true);
    setManualSaveResult(null);
    if (!onLoadAnnotationWorkspace) {
      showPlaceholder("Manual annotation workspace is unavailable.");
      return null;
    }
    showPlaceholder(message);
    const workspace = await onLoadAnnotationWorkspace();
    if (!workspace) {
      showPlaceholder("Could not load annotation workspace. Review the backend message above.");
      return null;
    }
    applyWorkspace(workspace, activeItemId);
    showPlaceholder(
      workspace.items?.length
        ? "Annotation workspace loaded. Draw boxes on one image at a time, then save that image's labels."
        : "Workspace loaded, but no supported images were found in the selected dataset.",
    );
    return workspace;
  };

  const ensureWorkspaceLoaded = async () => {
    if (manualWorkspace?.items?.length) return manualWorkspace;
    return loadWorkspace("Loading annotation workspace so suggestions can be reviewed on images.");
  };

  const mergeSuggestionPayload = (result, source = "suggestion") => {
    const items = Array.isArray(result?.items) ? result.items : [];
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
    setManualWorkspace((current) => {
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
          preview_url: existing.preview_url ?? item.preview_url,
          has_label: Boolean(existing.has_label),
          label_source: existing.label_source ?? source,
        });
      }
      return {
        ...(current ?? {}),
        classes: result?.classes?.length ? result.classes : current?.classes ?? manualClassOptions,
        items: Array.from(existingItems.values()),
      };
    });
    setManualWorkspaceOpen(true);
    setSelectedBoxId("");
    setDrawStart(null);
    setDraftBox(null);
    const firstSuggestedItemId = itemKey(items[0]);
    if (firstSuggestedItemId) setActiveItemId(firstSuggestedItemId);
    return firstSuggestedItemId;
  };

  const handleFindObjects = async () => {
    const terms = parsePromptTerms(autoLabelPrompt);
    if (!onAutoLabelDataset) return;
    const workspace = await ensureWorkspaceLoaded();
    if (!workspace?.items?.length && !activeItemId) return;
    const selectedItemId = activeItemId || itemKey(workspace?.items?.[0]);
    showPlaceholder(terms.length ? "Finding suggested boxes for the selected image." : "Finding suggested boxes with the model's default classes.");
    const result = await onAutoLabelDataset({
      prompts: terms,
      item_ids: selectedItemId ? [selectedItemId] : [],
      limit: selectedItemId ? 1 : 12,
      confidence: 0.25,
    });
    if (!result) {
      setAutoLabelPreview({
        terms,
        datasetName: workflowState.datasetName,
        message: "Auto-labeling did not complete. Review the backend message above.",
      });
      return;
    }
    const firstSuggestedItemId = mergeSuggestionPayload(result, "suggestion");
    setAutoLabelPreview({
      terms,
      datasetName: workflowState.datasetName,
      result,
      message: `${formatCount(result.suggested_label_count, "0")} image(s) received suggested boxes. Review, accept, edit, then save.`,
    });
    showPlaceholder(
      firstSuggestedItemId
        ? "Suggestions are ready in the editor. Accept or delete boxes, then save them as ground truth."
        : "No suggestion target was returned. Review the backend response.",
    );
  };

  const handleAssistLabeling = async () => {
    const terms = parsePromptTerms(autoLabelPrompt);
    if (!onAssistLabelDataset) return;
    await ensureWorkspaceLoaded();
    showPlaceholder("Using saved labels as seeds to suggest boxes for remaining unlabeled images.");
    const result = await onAssistLabelDataset({ prompts: terms, limit: 24, confidence: 0.25 });
    if (!result) {
      setAutoLabelPreview({
        terms,
        datasetName: workflowState.datasetName,
        message: "Label Assist did not complete. Save a few manual labels first, then try again.",
      });
      return;
    }
    mergeSuggestionPayload(result, "assist");
    setAutoLabelPreview({
      terms,
      datasetName: workflowState.datasetName,
      result,
      message: `${formatCount(result.suggested_label_count, "0")} unlabeled image(s) received assist suggestions. Review and save each image you accept.`,
    });
    showPlaceholder("Label Assist suggestions are loaded into the editor. They are not saved until you click Save labels.");
  };

  const handleImportFileChange = (event) => {
    const file = event.target.files?.[0];
    setImportFile(file ?? null);
    setImportFileName(file?.name ?? "");
    setImportResult(null);
    setWorkflowMessage(
      file
        ? "Label export selected. Upload and validate it against the selected dataset."
        : "",
    );
    setImportStatusMessage("");
  };

  const handleImportSubmit = async () => {
    if (!onLabelImport) return;
    setImportStatusMessage("");
    const result = await onLabelImport(importFile);
    if (!result) {
      setImportResult(null);
      setImportStatusMessage("Import failed. Review the message above and try again.");
      return;
    }
    setImportResult(result);
    setImportStatusMessage(
      result.label_status === "ready"
        ? "Labels uploaded and validated successfully."
        : "Labels uploaded and validated with partial coverage.",
    );
    setWorkflowMessage("Backend confirmed the import. Step 3 status has been refreshed from the dataset state.");
  };

  const openManualWorkspace = async () => {
    await loadWorkspace();
  };

  const getPointerPoint = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / Math.max(rect.width, 1)),
      y: clamp01((event.clientY - rect.top) / Math.max(rect.height, 1)),
    };
  };

  const handleCanvasPointerDown = (event) => {
    if (!manualSelectedItem || actionLoading) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = getPointerPoint(event);
    setDrawStart(point);
    setDraftBox(normalizeBox({ class_name: manualSelectedClass, x_center: point.x, y_center: point.y, width: 0.001, height: 0.001 }, 0, "draft"));
    setSelectedBoxId("");
  };

  const handleCanvasPointerMove = (event) => {
    if (!drawStart) return;
    event.preventDefault();
    const nextBox = buildBoxFromPoints(drawStart, getPointerPoint(event), manualSelectedClass);
    setDraftBox(nextBox);
  };

  const handleCanvasPointerUp = (event) => {
    if (!drawStart || !activeKey) return;
    event.preventDefault();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const nextBox = buildBoxFromPoints(drawStart, getPointerPoint(event), manualSelectedClass);
    setDrawStart(null);
    setDraftBox(null);
    if (!nextBox) return;
    const boxToAdd = { ...nextBox, id: makeBoxId("manual"), source: "manual" };
    setAnnotationsByItem((current) => ({
      ...current,
      [activeKey]: [...(current[activeKey] ?? []), boxToAdd],
    }));
    setSelectedBoxId(boxToAdd.id);
    setManualSaveResult(null);
  };

  const updateSelectedAnnotationBox = (field, value) => {
    if (!activeKey || !selectedAnnotation) return;
    setAnnotationsByItem((current) => ({
      ...current,
      [activeKey]: (current[activeKey] ?? []).map((box, index) =>
        box.id === selectedAnnotation.id ? normalizeBox({ ...box, [field]: value }, index, box.source ?? "manual") : box,
      ),
    }));
    setManualSaveResult(null);
  };

  const deleteAnnotationBox = (boxId) => {
    if (!activeKey) return;
    setAnnotationsByItem((current) => ({
      ...current,
      [activeKey]: (current[activeKey] ?? []).filter((box) => box.id !== boxId),
    }));
    setSelectedBoxId((current) => (current === boxId ? "" : current));
    setManualSaveResult(null);
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
    setSelectedBoxId(acceptedBox.id);
    setManualSaveResult(null);
  };

  const acceptAllSuggestions = () => {
    if (!activeKey || !currentSuggestions.length) return;
    const acceptedBoxes = currentSuggestions.map((box, index) => normalizeBox({ ...box, id: makeBoxId("manual"), source: "manual" }, index, "manual"));
    setAnnotationsByItem((current) => ({
      ...current,
      [activeKey]: [...(current[activeKey] ?? []), ...acceptedBoxes],
    }));
    setSuggestionsByItem((current) => ({ ...current, [activeKey]: [] }));
    setSelectedBoxId(acceptedBoxes[0]?.id ?? "");
    setManualSaveResult(null);
  };

  const deleteSuggestion = (boxId) => {
    if (!activeKey) return;
    setSuggestionsByItem((current) => ({
      ...current,
      [activeKey]: (current[activeKey] ?? []).filter((box) => box.id !== boxId),
    }));
  };

  const saveManualAnnotation = async () => {
    if (!manualSelectedItem || !onSaveManualAnnotations) {
      showPlaceholder("Choose an image before saving a manual annotation.");
      return;
    }
    const result = await onSaveManualAnnotations({
      item_id: activeKey,
      media_object_key: activeKey,
      file_name: manualSelectedItem.file_name,
      class_names: manualClassOptions,
      annotations: currentAnnotations.map(annotationPayload),
    });
    setManualSaveResult(result);
    if (result) {
      setAnnotationsByItem((current) => ({
        ...current,
        [activeKey]: (result.annotations ?? currentAnnotations).map((box, index) => normalizeBox({ ...box, source: "manual" }, index, "manual")),
      }));
      setSuggestionsByItem((current) => ({ ...current, [activeKey]: [] }));
      setManualWorkspace((current) => current
        ? {
            ...current,
            items: (current.items ?? []).map((item) =>
              itemKey(item) === activeKey ? { ...item, has_label: true, label_source: "manual" } : item,
            ),
          }
        : current);
    }
    showPlaceholder(
      result
        ? `Saved ${result.annotation_count ?? 0} annotation(s) for ${manualSelectedItem.file_name}.`
        : "Manual annotation save failed. Review the backend message above.",
    );
  };

  const saveManualNote = () => {
    setManualNoteSaved(Boolean(manualAnnotationNote.trim()));
    showPlaceholder(
      manualAnnotationNote.trim()
        ? "Manual annotation note saved locally for this session. No labels were written to the backend."
        : "Add a short note before saving the local annotation plan.",
    );
  };

  const confirmLabelLater = () => {
    setLabelLaterConfirmed(true);
    void onLabelReadinessChange("no");
  };

  const annotationEditor = (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Annotation editor</div>
          <p className="mt-1 text-sm leading-6 text-slate-500">Boxes are stored per image. Suggestions become labels only after you accept and save.</p>
        </div>
        <Badge tone={manualWorkspaceOpen ? "normal" : "warning"}>{manualWorkspaceOpen ? "Opened" : "Load workspace"}</Badge>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button disabled={actionLoading} onClick={openManualWorkspace} type="button">
          {manualWorkspace ? "Reload editor" : "Open Annotation Editor"}
        </Button>
        <Button disabled={actionLoading || !manualSelectedItem} onClick={saveManualAnnotation} type="button" variant="outline">
          Save labels
        </Button>
        {currentSuggestions.length ? (
          <Button disabled={actionLoading} onClick={acceptAllSuggestions} type="button" variant="outline">
            <Check className="mr-2 h-4 w-4" />
            Accept all
          </Button>
        ) : null}
      </div>

      {manualWorkspace?.items?.length ? (
        <label className="mt-4 block text-sm font-semibold text-slate-700">
          Image
          <select
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal outline-none transition focus:border-brandBlue"
            value={activeKey}
            onChange={(event) => {
              setActiveItemId(event.target.value);
              setSelectedBoxId("");
              setDrawStart(null);
              setDraftBox(null);
              setManualSaveResult(null);
            }}
          >
            {manualWorkspace.items.map((item) => {
              const key = itemKey(item);
              return (
                <option key={key} value={key}>
                  {item.file_name}{item.has_label ? " (labeled)" : ""}{suggestionsByItem[key]?.length ? " (suggestions)" : ""}
                </option>
              );
            })}
          </select>
        </label>
      ) : null}

      <div className="mt-4">
        <div className="text-sm font-semibold text-slate-700">Class before drawing</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {manualClassOptions.map((className) => (
            <button
              key={className}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                manualSelectedClass === className
                  ? "border-brandRed bg-brandRed text-white"
                  : "border-brandBlue/20 bg-white text-brandBlue hover:bg-brandBlue/[0.06]"
              }`}
              onClick={() => setManualSelectedClass(className)}
              type="button"
            >
              {className}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white bg-white p-3">
        {manualSelectedItem?.preview_url ? (
          <div className="flex justify-center rounded-xl bg-slate-950 p-3">
            <div className="relative w-fit max-w-full overflow-hidden rounded-xl border border-slate-700">
              <img
                alt={manualSelectedItem.file_name}
                className="block max-h-[420px] max-w-full select-none"
                draggable={false}
                src={manualSelectedItem.preview_url}
              />
              <div
                className="absolute inset-0 touch-none cursor-crosshair"
                onPointerDown={handleCanvasPointerDown}
                onPointerLeave={() => {
                  setDrawStart(null);
                  setDraftBox(null);
                }}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
              >
                {currentSuggestions.map((box) => (
                  <div
                    key={box.id}
                    className="pointer-events-none absolute border-2 border-dashed border-brandBlue bg-brandBlue/10"
                    style={annotationStyle(box)}
                  >
                    <span className="absolute left-0 top-0 max-w-full truncate bg-brandBlue px-2 py-0.5 text-[11px] font-semibold text-white">
                      {box.class_name}{box.confidence ? ` ${Math.round(box.confidence * 100)}%` : ""}
                    </span>
                  </div>
                ))}
                {currentAnnotations.map((box) => (
                  <button
                    key={box.id}
                    className={`absolute border-2 bg-brandRed/10 text-left ${selectedBoxId === box.id ? "border-white ring-2 ring-brandRed" : "border-brandRed"}`}
                    style={annotationStyle(box)}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedBoxId(box.id);
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    type="button"
                  >
                    <span className="absolute left-0 top-0 max-w-full truncate bg-brandRed px-2 py-0.5 text-[11px] font-semibold text-white">{box.class_name}</span>
                  </button>
                ))}
                {draftBox ? (
                  <div className="pointer-events-none absolute border-2 border-white bg-white/10" style={annotationStyle(draftBox)}>
                    <span className="absolute left-0 top-0 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-900">{manualSelectedClass}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-52 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center text-sm leading-6 text-slate-500">
            {manualWorkspaceOpen
              ? "No preview image is available for the selected dataset item."
              : "Open the editor to load images, then drag on an image to draw a box."}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Saved boxes</div>
            <Badge tone={currentAnnotations.length ? "normal" : "warning"}>{formatCount(currentAnnotations.length, "0")}</Badge>
          </div>
          <div className="mt-3 space-y-2">
            {currentAnnotations.length ? currentAnnotations.map((box) => (
              <div key={box.id} className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${selectedBoxId === box.id ? "border-brandRed bg-brandRed/[0.04]" : "border-slate-200 bg-slate-50"}`}>
                <button className="min-w-0 flex-1 truncate text-left font-semibold text-slate-700" onClick={() => setSelectedBoxId(box.id)} type="button">
                  {box.class_name} · {Math.round(box.width * 100)}% x {Math.round(box.height * 100)}%
                </button>
                <button className="rounded-full p-1 text-brandRed hover:bg-brandRed/[0.08]" onClick={() => deleteAnnotationBox(box.id)} type="button" title="Delete box">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )) : (
              <p className="text-sm leading-6 text-slate-500">No boxes saved for this image yet. Drag on the image to draw one.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Suggestions</div>
            <Badge tone={currentSuggestions.length ? "normal" : "warning"}>{formatCount(currentSuggestions.length, "0")}</Badge>
          </div>
          <div className="mt-3 space-y-2">
            {currentSuggestions.length ? currentSuggestions.map((box) => (
              <div key={box.id} className="flex items-center justify-between gap-2 rounded-xl border border-brandBlue/15 bg-brandBlue/[0.04] px-3 py-2 text-sm">
                <div className="min-w-0 flex-1 truncate font-semibold text-slate-700">
                  {box.class_name}{box.confidence ? ` · ${Math.round(box.confidence * 100)}%` : ""}
                </div>
                <button className="rounded-full p-1 text-brandBlue hover:bg-brandBlue/[0.08]" onClick={() => acceptSuggestion(box)} type="button" title="Accept suggestion">
                  <Check className="h-4 w-4" />
                </button>
                <button className="rounded-full p-1 text-brandRed hover:bg-brandRed/[0.08]" onClick={() => deleteSuggestion(box.id)} type="button" title="Delete suggestion">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )) : (
              <p className="text-sm leading-6 text-slate-500">No pending suggestions for this image.</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Advanced coordinates</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-5">
          <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Class
            <select
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-700 outline-none transition focus:border-brandBlue disabled:bg-slate-50"
              disabled={!selectedAnnotation}
              value={selectedAnnotation?.class_name ?? manualSelectedClass}
              onChange={(event) => updateSelectedAnnotationBox("class_name", event.target.value)}
            >
              {manualClassOptions.map((className) => (
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
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700 outline-none transition focus:border-brandBlue disabled:bg-slate-50"
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

      <div className="mt-3 grid gap-2 text-sm">
        <div className="rounded-xl bg-white px-3 py-2 text-slate-600">Image: {manualSelectedItem?.file_name ?? "Open workspace first"}</div>
        <div className="rounded-xl bg-white px-3 py-2 text-slate-600">Status: {manualSaveResult ? "latest labels saved" : manualWorkspace ? "ready to edit labels" : "workspace not loaded"}</div>
      </div>
      {manualSaveResult ? (
        <p className="mt-3 break-all text-sm leading-6 text-slate-500">Saved to {manualSaveResult.label_object_key}.</p>
      ) : null}
    </div>
  );

  return (
    <StepShell
      eyebrow="Step 3"
      helper="Choose how this dataset should get annotations before it moves into training setup."
      title="Labels"
      aside={
        <>
          <SmallCard helper={`${formatCount(workflowState.itemCount, "No")} examples selected`} title="Dataset" value={workflowState.datasetName} />
          <SmallCard
            helper={workflowState.statusHelper}
            title="System status"
            tone={statusTone}
            value={workflowState.statusTitle}
          />
          <SmallCard
            helper={workflowState.taskType ? workflowState.taskType.replace(/_/g, " ") : "Task type will be confirmed during handoff."}
            title="Labels found"
            tone={workflowState.labelCount ? "accent" : "warn"}
            value={workflowState.labelCount === null ? "Not checked" : formatCount(workflowState.labelCount, "0")}
          />
        </>
      }
    >
      {loading ? <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Loading label status...</div> : null}
      {error ? <div className="mb-4 rounded-2xl border border-brandRed/20 bg-brandRed/[0.04] p-4 text-sm text-brandRed">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_0.95fr]">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Dataset being labeled</div>
              <p className="mt-1 text-sm leading-6 text-slate-500">Confirm the selected dataset before choosing a labeling path.</p>
            </div>
            <Badge tone={statusBadgeTone}>{workflowState.statusTitle}</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Dataset</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{workflowState.datasetName}</div>
            </div>
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Current labels</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{humanizeLabelStatus(workflowState.labelStatus)}</div>
            </div>
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Examples</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{formatCount(workflowState.itemCount, "Not checked")}</div>
            </div>
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Label files</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{formatCount(workflowState.labelCount, "Not checked")}</div>
            </div>
          </div>
          {workflowState.source ? (
            <p className="mt-3 break-all text-xs leading-5 text-slate-500">Source: {workflowState.source}</p>
          ) : null}
        </div>

        <div className={`rounded-3xl border p-5 ${workflowState.trainingStatus === "ready" ? "border-brandBlue/20 bg-brandBlue/[0.04]" : "border-brandRed/20 bg-brandRed/[0.04]"}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">{workflowState.statusTitle}</div>
              <p className="mt-1 text-sm leading-6 text-slate-600">{workflowState.statusHelper}</p>
            </div>
            <Badge tone={statusBadgeTone}>{workflowState.trainingStatus === "ready" ? "Ready" : workflowState.trainingStatus === "warning" ? "Review" : "Blocked"}</Badge>
          </div>
          {workflowState.blockingIssues.length ? (
            <div className="mt-4 space-y-2">
              {workflowState.blockingIssues.map((issue) => (
                <div key={issue} className="rounded-2xl border border-brandRed/15 bg-white/80 px-3 py-2 text-sm text-slate-700">
                  {issue}
                </div>
              ))}
            </div>
          ) : workflowState.warnings.length ? (
            <div className="mt-4 space-y-2">
              {workflowState.warnings.map((warning) => (
                <div key={warning} className="rounded-2xl border border-brandRed/10 bg-white/80 px-3 py-2 text-sm text-slate-700">
                  {warning}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-slate-600">No blocking label issues are currently reported.</p>
          )}
        </div>
      </div>

      <div className={`mt-5 rounded-2xl border p-4 text-sm leading-6 ${workflowState.trainingStatus === "ready" ? "border-brandBlue/15 bg-brandBlue/[0.04] text-slate-600" : "border-brandRed/20 bg-brandRed/[0.04] text-slate-700"}`}>
        <div className="font-semibold text-slate-900">Workflow recommendation</div>
        <p>{workflowState.actionMessage}</p>
      </div>

      <div className="mt-6">
        <div className="mb-3">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Choose your labeling path</div>
          <p className="mt-1 text-sm leading-6 text-slate-500">Pick the next concrete action for this dataset. Final validation still decides whether training can proceed.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {workflowCards.map((workflow) => (
            <AnnotationPathCard
              key={workflow.id}
              active={activeWorkflow === workflow.id}
              badge={workflow.badge}
              eyebrow={workflow.eyebrow}
              helper={workflow.helper}
              icon={workflow.icon}
              primary={workflow.primary}
              title={workflow.title}
              onClick={() => handleWorkflowSelect(workflow)}
            />
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-5">
        {activeWorkflow === "upload-existing" ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
            <div>
              <div className="text-lg font-semibold text-slate-900">Import labels from another tool</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Use this when your annotations already exist outside Sutherland Hub. Imported labels will be validated against the selected dataset before training setup.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["YOLO", "COCO", "CVAT export", "Label Studio export"].map((format) => (
                  <span key={format} className="rounded-full border border-brandBlue/15 bg-brandBlue/[0.04] px-3 py-1.5 text-xs font-semibold text-brandBlue">
                    {format}
                  </span>
                ))}
              </div>
              <label className="mt-4 block cursor-pointer rounded-2xl border border-dashed border-brandBlue/30 bg-brandBlue/[0.03] p-5 text-center transition hover:bg-brandBlue/[0.06]">
                <UploadCloud className="mx-auto h-6 w-6 text-brandBlue" />
                <div className="mt-2 text-sm font-semibold text-slate-900">{importFileName || "Choose or drop YOLO label zip"}</div>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {importFileName
                    ? `${fileExtensionLabel(importFileName)} export selected. It will be validated against dataset media filenames.`
                    : "This phase supports .zip files containing YOLO .txt labels."}
                </p>
                <input className="sr-only" type="file" accept=".zip" onChange={handleImportFileChange} />
              </label>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button disabled={actionLoading} onClick={() => showPlaceholder(importFileName ? `${importFileName} is selected and ready to upload for validation.` : "Choose a YOLO label zip first.")} type="button" variant="outline">
                  Choose label export
                </Button>
                <Button disabled={actionLoading || !importFile} onClick={handleImportSubmit} type="button">
                  {actionLoading ? "Uploading..." : "Upload and validate labels"}
                </Button>
                <Button disabled={actionLoading} onClick={() => onLabelReadinessChange("yes")} type="button">
                  Use existing labels in dataset
                </Button>
                <Button disabled={actionLoading} onClick={() => onLabelReadinessChange("partial")} type="button" variant="ghost">
                  Mark partial review
                </Button>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">YOLO label filenames must match image/video filename stems in the selected dataset prefix.</p>
              {importStatusMessage ? (
                <div className={`mt-3 rounded-2xl border p-3 text-sm leading-6 ${importResult ? "border-brandBlue/15 bg-brandBlue/[0.04] text-slate-700" : "border-brandRed/20 bg-brandRed/[0.04] text-brandRed"}`}>
                  {importStatusMessage}
                </div>
              ) : null}
              {importResult ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Matched</div>
                    <div className="mt-1 font-semibold text-slate-900">{formatCount(importResult.matched_label_count, "0")}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Unmatched</div>
                    <div className="mt-1 font-semibold text-slate-900">{formatCount(importResult.unmatched_label_count, "0")}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Coverage</div>
                    <div className="mt-1 font-semibold text-slate-900">{Math.round((importResult.coverage ?? 0) * 100)}%</div>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">Accepted import types</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">Use exported annotation files that match the selected dataset images or clips.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {acceptedFormats.slice(0, 5).map((format) => (
                  <span key={format} className="rounded-full border border-white bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                    {format}
                  </span>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-white bg-white p-3 text-sm leading-6 text-slate-600">
                Next: import labels, run validation, then prepare the dataset handoff if validation passes.
              </div>
            </div>
          </div>
        ) : null}

        {activeWorkflow === "annotate-manually" ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
            <div>
              <div className="text-lg font-semibold text-slate-900">Annotate manually</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Draw boxes or tags yourself when the dataset is small, when labels need careful QA, or when auto-label suggestions need correction.
              </p>
              <div className="mt-4 rounded-2xl border border-brandBlue/15 bg-brandBlue/[0.04] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Manual annotation workspace</div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{workflowState.datasetName} stays selected while labels are saved back to MinIO.</p>
                  </div>
                  <Badge tone={manualWorkspaceOpen ? "normal" : "warning"}>{manualWorkspaceOpen ? "Workspace active" : "Preview"}</Badge>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {["Small datasets", "QA review", "Correct AI suggestions"].map((item) => (
                  <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                    {item}
                  </div>
                ))}
              </div>
              <label className="mt-4 block text-sm font-semibold text-slate-700">
                Local annotation note
                <textarea
                  className="mt-2 min-h-[84px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal outline-none transition focus:border-brandBlue"
                  placeholder="Example: review forklift bay helmets first, then correct vest boxes."
                  value={manualAnnotationNote}
                  onChange={(event) => {
                    setManualAnnotationNote(event.target.value);
                    setManualNoteSaved(false);
                  }}
                />
              </label>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button disabled={actionLoading} onClick={saveManualNote} type="button" variant="outline">
                  Save local note
                </Button>
                <Button disabled={actionLoading} onClick={() => onLabelReadinessChange("partial")} type="button" variant="outline">
                  Mark as partial
                </Button>
              </div>
              {manualNoteSaved ? (
                <p className="mt-3 text-sm leading-6 text-slate-500">Local note saved for this browser session. It does not create backend labels.</p>
              ) : null}
            </div>
            {annotationEditor}
          </div>
        ) : null}

        {activeWorkflow === "auto-label" ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
            <div>
              <div className="text-lg font-semibold text-slate-900">Use AI to label objects automatically</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Start with object names, let AI suggest annotations, then review those suggestions before training. Use this when you need labels quickly but still want human review.
              </p>
              <label className="mt-4 block text-sm font-semibold text-slate-700">
                What objects are you looking for?
                <input
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal outline-none transition focus:border-brandBlue"
                  placeholder="helmet, fire, smoke, person"
                  value={autoLabelPrompt}
                  onChange={(event) => setAutoLabelPrompt(event.target.value)}
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {promptSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    className="rounded-full border border-brandBlue/15 bg-brandBlue/[0.04] px-3 py-1.5 text-xs font-semibold text-brandBlue hover:bg-brandBlue/[0.08]"
                    onClick={() => addPromptSuggestion(suggestion)}
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  disabled={actionLoading}
                  onClick={handleFindObjects}
                  type="button"
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  {actionLoading ? "Finding..." : "Find Objects"}
                </Button>
                <Button disabled={actionLoading} onClick={handleAssistLabeling} type="button" variant="outline">
                  <Wand2 className="mr-2 h-4 w-4" />
                  {actionLoading ? "Assisting..." : "Assist Labeling"}
                </Button>
                <Button disabled={actionLoading} onClick={onAuditDataset} type="button" variant="outline">
                  {actionLoading ? "Working..." : "Run label check"}
                </Button>
              </div>
              {autoLabelPreview ? (
                <div className="mt-4 rounded-2xl border border-brandBlue/15 bg-brandBlue/[0.04] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Suggestion result</div>
                    <Badge tone="warning">Unsaved suggestions</Badge>
                  </div>
                  {autoLabelPreview.terms.length ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {autoLabelPreview.terms.map((term) => (
                        <span key={term} className="rounded-full bg-brandBlue/[0.08] px-3 py-1 text-xs font-semibold text-brandBlue">
                          {term}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No object terms entered yet.</p>
                  )}
                  <p className="mt-2 text-sm leading-6 text-slate-600">{autoLabelPreview.message}</p>
                  <div className="mt-3 grid gap-2 text-sm">
                    <div className="rounded-xl bg-white/75 px-3 py-2 text-slate-700">Dataset: {autoLabelPreview.datasetName}</div>
                    <div className="rounded-xl bg-white/75 px-3 py-2 text-slate-700">
                      {autoLabelPreview.result
                        ? `Suggested items: ${formatCount(autoLabelPreview.result.suggested_label_count, "0")}`
                        : "No suggestions have been generated yet."}
                    </div>
                    {autoLabelPreview.result?.model_source ? (
                      <div className="break-all rounded-xl bg-white/75 px-3 py-2 text-slate-700">Model: {autoLabelPreview.result.model_source}</div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="mt-3 space-y-3">
                {["Find candidate objects", "Review suggested labels", "Validate before training"].map((step, index) => (
                  <div key={step} className="flex items-center gap-3 rounded-2xl border border-white bg-white/80 p-3 text-sm text-slate-600">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brandBlue/[0.08] text-xs font-semibold text-brandBlue">{index + 1}</span>
                    {step}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Auto-label and Assist Labeling return editable suggestions. Click Save labels in the editor to write ground-truth YOLO files to MinIO.
              </p>
            </div>
            {annotationEditor}
          </div>
        ) : null}

        {activeWorkflow === "label-later" ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
            <div>
              <div className="text-lg font-semibold text-slate-900">Store this dataset and label later</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                The dataset can remain saved for this use case, but training will stay blocked until annotations are added.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button disabled={actionLoading} onClick={confirmLabelLater} type="button">
                  Store and label later
                </Button>
                <Button
                  disabled={actionLoading}
                  onClick={() => {
                    const workflow = workflowCards.find((item) => item.id === "auto-label");
                    if (workflow) handleWorkflowSelect(workflow);
                  }}
                  type="button"
                  variant="outline"
                >
                  Try auto-label instead
                </Button>
              </div>
            </div>
            <div className="rounded-2xl border border-brandRed/15 bg-brandRed/[0.04] p-4">
              <div className="text-sm font-semibold text-slate-900">What this means</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">Preparation can continue, but model training cannot begin while labels are missing.</p>
              {labelLaterConfirmed ? (
                <div className="mt-3 rounded-2xl border border-white bg-white/80 p-3 text-sm leading-6 text-slate-700">
                  Dataset saved for future labeling. Training remains blocked until labels are added.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {workflowMessage ? (
          <div className="mt-4 rounded-2xl border border-brandBlue/15 bg-brandBlue/[0.04] p-4 text-sm leading-6 text-slate-600">
            {workflowMessage}
          </div>
        ) : null}
      </div>

      <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Next actions</div>
            <p className="mt-1 text-sm leading-6 text-slate-500">{workflowState.actionMessage}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button disabled={actionLoading} onClick={onAuditDataset} type="button" variant="outline">
              {actionLoading ? "Working..." : "Run data check"}
            </Button>
            <Button
              disabled={actionLoading}
              onClick={() => {
                const workflow = workflowCards.find((item) => item.id === "auto-label");
                if (workflow) handleWorkflowSelect(workflow);
              }}
              type="button"
              variant="ghost"
            >
              Open auto-label path
            </Button>
          </div>
        </div>
        {workflowState.trainingStatus === "blocked" ? (
          <p className="mt-3 text-sm leading-6 text-brandRed">Training is blocked until labels are added. The footer action can still prepare a handoff response, but backend validation will mark it blocked.</p>
        ) : null}
      </div>

      {datasetReadyPayload && handoffSummary ? (
        <div className={`mt-5 rounded-2xl border p-4 text-sm leading-6 text-slate-600 ${handoffSummary.tone === "accent" ? "border-brandBlue/20 bg-brandBlue/[0.04]" : "border-brandRed/20 bg-brandRed/[0.04]"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-900">{handoffSummary.title}</div>
              <p className="mt-1">{handoffSummary.message}</p>
            </div>
            <Badge tone={handoffSummary.badgeTone}>{datasetReadyPayload.status}</Badge>
          </div>
          <div className="mt-3 rounded-2xl border border-white bg-white/75 p-3">
            <div className="font-semibold text-slate-900">Recommended next action</div>
            <p>{handoffSummary.action}</p>
          </div>
          <p className="mt-3 break-all">Dataset URI: {datasetReadyPayload.prepared_dataset_uri}</p>
          {datasetReadyPayload.prepared_dataset_manifest_uri ? <p className="break-all">Manifest: {datasetReadyPayload.prepared_dataset_manifest_uri}</p> : null}
          {datasetReadyPayload.blocking_issues?.length ? (
            <div className="mt-2 text-brandRed">Blocked because: {datasetReadyPayload.blocking_issues.map(humanizeWorkflowIssue).join(", ")}</div>
          ) : null}
        </div>
      ) : null}
    </StepShell>
  );
}

export function TrainingPlanStep({
  activeUseCase,
  config,
  currentModel,
  baseModels,
  selectedBaseModelId,
  selectedTrainingModeId,
  selectedStopConditionId,
  advancedOpen,
  sceneOpen,
  advancedSettings,
  extensionSettings,
  onBaseModelChange,
  onTrainingModeChange,
  onStopConditionChange,
  onToggleAdvanced,
  onToggleScene,
  onAdvancedSettingChange,
  onExtensionSettingChange,
  trainingModeOptions,
  stopConditionOptions,
}) {
  const selectedBaseModel = baseModels.find((model) => model.value === selectedBaseModelId) ?? baseModels[0];

  return (
    <StepShell
      eyebrow="Step 4"
      helper="Pick a starting point, choose how broad the run should be, and keep advanced controls hidden until needed."
      title="Choose your plan"
      aside={
        <>
          <SmallCard helper="This stays live until rollout." title="Live model" value={currentModel.version} />
          <SmallCard helper={selectedBaseModel?.helper} title="Starting model" tone="accent" value={selectedBaseModel?.label ?? "Recommended"} />
        </>
      }
    >
      <div>
        <div className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Pick a starting model</div>
        <div className="grid gap-3">
          {baseModels.map((model) => (
            <ChoiceCard
              key={model.value}
              active={selectedBaseModelId === model.value}
              badge={model.tradeoff}
              helper={model.helper}
              title={model.label}
              onClick={() => onBaseModelChange(model.value)}
            />
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Run depth</div>
          <div className="mt-3 grid gap-3">
            {trainingModeOptions.map((mode) => (
              <ChoiceCard
                key={mode.value}
                active={selectedTrainingModeId === mode.value}
                helper={mode.helper}
                title={mode.label}
                onClick={() => onTrainingModeChange(mode.value)}
              />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Stop rule</div>
          <div className="mt-3 grid gap-3">
            {stopConditionOptions.map((option) => (
              <ChoiceCard
                key={option.value}
                active={selectedStopConditionId === option.value}
                title={option.label}
                onClick={() => onStopConditionChange(option.value)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={onToggleAdvanced} type="button" variant="outline">
          {advancedOpen ? "Hide advanced" : "Advanced"}
        </Button>
        <Button onClick={onToggleScene} type="button" variant="outline">
          {sceneOpen ? "Hide scene details" : "Scene details"}
        </Button>
      </div>

      {advancedOpen ? <AdvancedSettings settings={advancedSettings} onChange={onAdvancedSettingChange} /> : null}
      {sceneOpen ? (
        <div className="mt-5">
          <UseCaseExtensionSection
            activeUseCase={activeUseCase}
            description={config.extensionDescription}
            settings={extensionSettings}
            title={config.extensionTitle}
            onChange={onExtensionSettingChange}
          />
        </div>
      ) : null}
    </StepShell>
  );
}

function getTrainingStatusMessage(status) {
  if (status === "running") return "Training is running. This may take a few minutes.";
  if (status === "completed") return "Training completed successfully.";
  if (status === "failed") return "Training failed. Check backend logs.";
  return "Training job is ready to start.";
}

export function WatchTrainingStep({ trainingJob, onTrainingJobSync }) {
  const [trainingRunning, setTrainingRunning] = useState(false);
  const [trainingError, setTrainingError] = useState("");
  const [jobDetails, setJobDetails] = useState(trainingJob);

  useEffect(() => {
    setJobDetails(trainingJob);
    setTrainingRunning(false);
    setTrainingError("");
  }, [trainingJob]);

  const displayStatus = trainingRunning ? "running" : jobDetails?.status || "queued";
  const displayMessage = trainingError || getTrainingStatusMessage(displayStatus);
  const displayOutputPath = jobDetails?.output_model_path || "";

  async function refreshJobDetails(jobId) {
    const response = await fetch(`${API_BASE_URL}/api/fine-tuning/${jobId}`);
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.detail || "Failed to refresh training job");
    }

    setJobDetails(data);
    onTrainingJobSync?.(data);
    return data;
  }

  async function handleRunTraining() {
    if (!jobDetails?.id || trainingRunning || displayStatus === "completed") return;

    try {
      setTrainingRunning(true);
      setTrainingError("");
      onTrainingJobSync?.({ id: jobDetails.id, status: "running" });

      const response = await fetch(`${API_BASE_URL}/api/fine-tuning/${jobDetails.id}/run`, {
        method: "POST",
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.detail || "Training failed");
      }

      try {
        await refreshJobDetails(jobDetails.id);
      } catch (refreshError) {
        console.error(refreshError);
        const fallbackJob = {
          ...jobDetails,
          status: data?.status || "completed",
        };
        setJobDetails(fallbackJob);
        onTrainingJobSync?.(fallbackJob);
      }
    } catch (error) {
      console.error(error);
      setTrainingError(error instanceof Error ? error.message : "Training failed");
      const failedJob = {
        ...jobDetails,
        status: "failed",
      };
      setJobDetails(failedJob);
      onTrainingJobSync?.(failedJob);
    } finally {
      setTrainingRunning(false);
    }
  }

  return (
    <StepShell
      eyebrow="Step 5"
      helper="Start the training run when you are ready. This step shows the real backend job state. Training artifacts are available in Step 6."
      title="Watch training"
      aside={
        <>
          <SmallCard
            helper={jobDetails?.id ? "Use this ID for backend checks." : "Create a training plan first."}
            title="Training job"
            tone="accent"
            value={jobDetails?.id ?? "Not created"}
          />
          <SmallCard helper={displayMessage} title="Status" value={displayStatus} />
          {displayOutputPath ? <SmallCard helper="Saved YOLO best.pt path." title="Output model" value={displayOutputPath} /> : null}
        </>
      }
    >
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold capitalize text-slate-900">{displayStatus}</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{displayMessage}</p>
          </div>
          <Button disabled={trainingRunning || !jobDetails?.id || displayStatus === "completed"} onClick={handleRunTraining} type="button">
            {trainingRunning ? "Training..." : "Start Training"}
          </Button>
        </div>

        {trainingError ? (
          <div className="mt-4 rounded-2xl border border-brandRed/20 bg-brandRed/[0.05] px-4 py-3 text-sm leading-6 text-brandRed">
            {trainingError}
          </div>
        ) : null}

        {!trainingError && displayStatus === "completed" ? (
          <div className="mt-4 rounded-2xl border border-brandBlue/15 bg-brandBlue/[0.04] px-4 py-3 text-sm leading-6 text-slate-700">
            Training completed successfully. Results are available in Step 6.
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Training job ID</div>
            <div className="mt-2 break-all text-sm font-semibold text-slate-900">{jobDetails?.id ?? "Not created"}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Status</div>
            <div className="mt-2 text-sm font-semibold capitalize text-slate-900">{displayStatus}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:col-span-2 xl:col-span-1">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Output model path</div>
            <div className="mt-2 break-all text-sm font-semibold text-slate-900">{displayOutputPath || "Available after training completes"}</div>
          </div>
        </div>
      </div>
    </StepShell>
  );
}

const GRAPH_ARTIFACT_NAMES = new Set([
  "results.png",
  "confusion_matrix.png",
  "f1_curve.png",
  "pr_curve.png",
  "p_curve.png",
  "r_curve.png",
]);

function isImageSampleArtifact(name) {
  const normalized = String(name || "").toLowerCase();
  return (
    normalized === "labels.jpg" ||
    normalized.startsWith("train_batch") ||
    normalized.startsWith("val_batch")
  );
}

function isGraphArtifact(name) {
  const normalized = String(name || "").toLowerCase();
  return GRAPH_ARTIFACT_NAMES.has(normalized);
}

function ArtifactSelector({ title, items, selectedName, onSelect, emptyMessage }) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? items : items.slice(0, 8);
  const hasMore = items.length > 8;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</div>
      {items.length === 0 ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {emptyMessage}
        </div>
      ) : (
        <>
          <div className="mt-3 space-y-2">
            {visibleItems.map((artifact) => {
              const isSelected = artifact.name === selectedName;
              return (
                <button
                  key={artifact.url}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                    isSelected
                      ? "border-brandRed bg-brandRed/[0.06] text-slate-900"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-brandBlue/30"
                  }`}
                  onClick={() => onSelect(artifact)}
                  type="button"
                >
                  {artifact.name}
                </button>
              );
            })}
          </div>
          {hasMore ? (
            <Button className="mt-3" onClick={() => setExpanded((current) => !current)} type="button" variant="outline">
              {expanded ? "Show fewer items" : "Show more items"}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

export function CompareResultsStep({ activeUseCase, currentModel, trainingJob, trainingJobId, selectedTrainingMode }) {
  const [jobDetails, setJobDetails] = useState(trainingJob);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobError, setJobError] = useState("");
  const [artifacts, setArtifacts] = useState([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [artifactsError, setArtifactsError] = useState("");
  const [selectedImageArtifact, setSelectedImageArtifact] = useState(null);
  const [selectedGraphArtifact, setSelectedGraphArtifact] = useState(null);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    setJobDetails(trainingJobId ? trainingJob : null);
    setJobError("");
    setArtifacts([]);
    setArtifactsError("");
    setSelectedImageArtifact(null);
    setSelectedGraphArtifact(null);
    setActionMessage("");
  }, [trainingJob, trainingJobId]);

  useEffect(() => {
    if (!trainingJobId) return;

    let isActive = true;

    async function loadComparisonData() {
      let jobLoaded = false;

      try {
        setJobLoading(true);
        setJobError("");

        const jobResponse = await fetch(`${API_BASE_URL}/api/fine-tuning/${trainingJobId}`);
        const jobData = await jobResponse.json().catch(() => null);
        if (!jobResponse.ok) {
          throw new Error(jobData?.detail || "Failed to load training job");
        }
        if (!isActive) return;

        setJobDetails(jobData);
        jobLoaded = true;

        if (jobData.status !== "completed") {
          setArtifacts([]);
          setArtifactsError("");
          setArtifactsLoading(false);
          return;
        }

        setArtifactsLoading(true);
        setArtifactsError("");

        const artifactsResponse = await fetch(`${API_BASE_URL}/api/fine-tuning/${trainingJobId}/artifacts`);
        const artifactsData = await artifactsResponse.json().catch(() => null);
        if (!artifactsResponse.ok) {
          throw new Error(artifactsData?.detail || "Failed to load training results");
        }
        if (!isActive) return;

        const loadedArtifacts = Array.isArray(artifactsData?.artifacts) ? artifactsData.artifacts : [];
        setArtifacts(loadedArtifacts);

        const imageArtifacts = loadedArtifacts.filter((artifact) => isImageSampleArtifact(artifact?.name));
        const graphArtifacts = loadedArtifacts.filter((artifact) => isGraphArtifact(artifact?.name));

        setSelectedImageArtifact(imageArtifacts[0] ?? null);
        setSelectedGraphArtifact(
          graphArtifacts.find((artifact) => String(artifact?.name || "").toLowerCase() === "results.png") ??
            graphArtifacts[0] ??
            null,
        );
      } catch (error) {
        console.error(error);
        if (!isActive) return;
        const message = error instanceof Error ? error.message : "Failed to load comparison details";
        if (!jobLoaded) {
          setJobError(message);
        } else {
          setArtifactsError(message);
        }
      } finally {
        if (!isActive) return;
        setJobLoading(false);
        setArtifactsLoading(false);
      }
    }

    loadComparisonData();

    return () => {
      isActive = false;
    };
  }, [trainingJobId, trainingJob?.status]);

  const comparisonStatus = trainingJobId ? jobDetails?.status || trainingJob?.status || "" : "";
  const currentModelPath =
    currentModel?.model_path ||
    (activeUseCase?.id === "crack-detection"
      ? "models/crack_detection/best.pt"
      : activeUseCase?.id === "unsafe-behavior-detection"
        ? "models/unsafe_behavior/smoking_best.pt"
      : "Production model (existing inference pipeline)");
  const currentModelStatus = "Active";
  const runDepthLabel = selectedTrainingMode?.label || "Not available";
  const comparisonMessage =
    !trainingJobId
      ? "No completed training found."
      : comparisonStatus === "failed"
        ? "Training failed. Please retry."
        : comparisonStatus === "running"
          ? "Training in progress..."
          : comparisonStatus === "completed"
            ? activeUseCase?.id === "speed-estimation"
                ? "Training completed successfully. Speed accuracy is not evaluated yet. This fine-tuning improves the vehicle detection layer; speed calculation is validated in Integration."
              : activeUseCase?.id === "object-tracking"
                ? "Training completed successfully. Tracking identity quality is not evaluated yet. This fine-tuning improves the detection layer; tracking behavior is validated in Integration."
                : activeUseCase?.id === "crack-detection"
                  ? "Training completed successfully. Crack-specific validation metrics are shown only when YOLO generates them. Review artifacts and test in Integration before promotion."
                : activeUseCase?.id === "unsafe-behavior-detection"
                  ? "Training completed successfully. Unsafe behavior validation metrics are shown only when YOLO generates them. Review artifacts and test in Integration before promotion."
                : activeUseCase?.id === "class-wise-object-counting"
                  ? "Training completed successfully. Counting accuracy is not evaluated yet. This fine-tuning improves the detection layer; counting results are validated in Integration/Dashboard."
              : "Training completed successfully. Model ready for evaluation and staging."
            : "Training is not complete yet.";
  const currentModelDescription =
    activeUseCase?.id === "speed-estimation"
      ? "This is the model currently used for speed estimation inference. It remains unchanged."
      : activeUseCase?.id === "object-tracking"
        ? "This is the model currently used for object tracking inference. It remains unchanged."
        : activeUseCase?.id === "crack-detection"
          ? "This is the model currently used for crack detection inference. It remains unchanged unless you explicitly promote a new version."
        : activeUseCase?.id === "unsafe-behavior-detection"
          ? "This is the smoking model currently used for unsafe behavior inference. Production phone usage currently uses COCO person + phone association."
        : activeUseCase?.id === "class-wise-object-counting"
          ? "This is the model currently used for class-wise counting inference. It remains unchanged."
      : "This is the model currently used for inference. It remains unchanged.";
  const imageArtifacts = artifacts.filter((artifact) => isImageSampleArtifact(artifact?.name));
  const graphArtifacts = artifacts.filter((artifact) => isGraphArtifact(artifact?.name));

  return (
    <StepShell
      eyebrow="Step 6"
      helper="Review training images, validation predictions, and training graphs before staging the model."
      title="Show results"
      aside={
        <>
          <SmallCard helper="This remains the active inference model." title="Current model" value={activeUseCase?.id === "crack-detection" ? (currentModel?.version ?? "Crack detector") : activeUseCase?.id === "unsafe-behavior-detection" ? (currentModel?.version ?? "Unsafe smoking detector") : (currentModel?.version ?? "Production")} />
          <SmallCard helper="Pulled from the training job created in Step 5." title="New model status" tone="accent" value={comparisonStatus || "Not started"} />
        </>
      }
    >
      {jobError ? (
        <div className="mb-5 rounded-2xl border border-brandRed/20 bg-brandRed/[0.05] px-4 py-3 text-sm leading-6 text-brandRed">
          {jobError}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-lg font-semibold text-slate-900">{activeUseCase?.id === "crack-detection" ? "Current Crack Detection Model" : activeUseCase?.id === "unsafe-behavior-detection" ? "Current Unsafe Behavior Model" : "Current Live Model"}</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{currentModelDescription}</p>
          <div className="mt-5 space-y-3">
            <SmallCard helper="Shown when a concrete live model path is available." title="Model path" value={currentModelPath} />
            <SmallCard helper="Production remains untouched in this step." title="Status" value={activeUseCase?.id === "crack-detection" ? "Existing detector" : activeUseCase?.id === "unsafe-behavior-detection" ? "Existing detector" : currentModelStatus} tone="accent" />
            {activeUseCase?.id === "unsafe-behavior-detection" ? (
              <SmallCard helper="Current production note" title="Phone usage note" value="Production phone usage currently uses COCO person + phone association." />
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-brandBlue/20 bg-brandBlue/[0.04] p-5">
          <div className="text-lg font-semibold text-slate-900">{activeUseCase?.id === "crack-detection" ? "New Fine-Tuned Crack Model" : activeUseCase?.id === "unsafe-behavior-detection" ? "New Fine-Tuned Unsafe Behavior Model" : "New Fine-Tuned Model"}</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">This model comes from the Step 5 training run and reflects the latest backend job state.</p>
          <div className="mt-5 space-y-3">
            <SmallCard helper="Backend training job identifier." title="Training job ID" value={jobDetails?.id ?? "No training job"} />
            <SmallCard helper={jobLoading ? "Refreshing latest backend state..." : "Returned from the Step 5 job endpoint."} title="Status" value={comparisonStatus || "Not started"} tone="accent" />
            <SmallCard helper="Saved after training completes." title="Output model path" value={jobDetails?.output_model_path || "Available after training completes"} />
            <SmallCard helper="Shown from the Step 4 selection while backend plan details stay internal." title="Run depth" value={runDepthLabel} />
            {activeUseCase?.id === "unsafe-behavior-detection" ? (
              <SmallCard helper="Training classes configured in this run" title="Classes" value="smoking, phone_usage" />
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Training Results</div>
        {artifactsLoading ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Loading training results...
          </div>
        ) : null}
        {artifactsError ? (
          <div className="mt-4 rounded-2xl border border-brandRed/20 bg-brandRed/[0.05] px-4 py-3 text-sm leading-6 text-brandRed">
            {artifactsError}
          </div>
        ) : null}

        {!artifactsLoading ? (
          <div className="mt-4 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <ArtifactSelector
              emptyMessage="No training or validation images found."
              items={imageArtifacts}
              selectedName={selectedImageArtifact?.name || ""}
              title="Image Samples"
              onSelect={setSelectedImageArtifact}
            />
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {selectedImageArtifact ? (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-slate-900">{selectedImageArtifact.name}</div>
                  <img
                    alt={selectedImageArtifact.name}
                    className="mx-auto w-full rounded-2xl border border-slate-200 bg-white object-contain"
                    src={selectedImageArtifact.url}
                  />
                </div>
              ) : (
                <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-600">
                  No training or validation images found.
                </div>
              )}
            </div>
          </div>
        ) : null}

        {!artifactsLoading ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <ArtifactSelector
              emptyMessage="No training graphs found."
              items={graphArtifacts}
              selectedName={selectedGraphArtifact?.name || ""}
              title="Training Graphs"
              onSelect={setSelectedGraphArtifact}
            />
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {selectedGraphArtifact ? (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-slate-900">{selectedGraphArtifact.name}</div>
                  <img
                    alt={selectedGraphArtifact.name}
                    className="mx-auto w-full rounded-2xl border border-slate-200 bg-white object-contain"
                    src={selectedGraphArtifact.url}
                  />
                  <p className="text-sm leading-6 text-slate-500">
                    Training curves showing loss, precision, recall, and mAP trends
                  </p>
                </div>
              ) : (
                <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-600">
                  No training graphs found.
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-brandBlue/15 bg-brandBlue/[0.04] px-4 py-3 text-sm leading-6 text-slate-700">
          {comparisonMessage}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Actions</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">Production will not be affected until deployment is explicitly triggered.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => setActionMessage("Kept the current model in place. Production remains unchanged.")}
              type="button"
              variant="outline"
            >
              Keep current model
            </Button>
            <Button
              disabled={!trainingJobId || comparisonStatus !== "completed"}
              onClick={() =>
                setActionMessage(
                  activeUseCase?.id === "object-tracking"
                    ? "Marked the new model as ready for staging review. Production is still unchanged."
                    : activeUseCase?.id === "class-wise-object-counting"
                      ? "Marked the new model as ready for staging review. Production is still unchanged."
                    : "Marked the new model as ready for staging review. Production is still unchanged.",
                )
              }
              type="button"
            >
              Use new model for staging
            </Button>
          </div>
        </div>

        {actionMessage ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
            {actionMessage}
          </div>
        ) : null}
      </div>
    </StepShell>
  );
}

export function RolloutStep({ activeUseCase, currentModel, trainingJob, trainingJobId, selectedTrainingMode }) {
  const [rolloutState, setRolloutState] = useState(null);
  const [rolloutLoading, setRolloutLoading] = useState(false);
  const [rolloutError, setRolloutError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const refreshRolloutState = async () => {
    if (!trainingJobId) {
      setRolloutState(null);
      return;
    }

    try {
      setRolloutLoading(true);
      setRolloutError("");

      const response = await fetch(`${API_BASE_URL}/api/fine-tuning/${trainingJobId}/rollout-state`);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.detail || "Failed to load rollout state");
      }

      setRolloutState(data);
    } catch (error) {
      console.error(error);
      setRolloutError(error instanceof Error ? error.message : "Failed to load rollout state");
    } finally {
      setRolloutLoading(false);
    }
  };

  useEffect(() => {
    if (!trainingJobId) {
      setRolloutState(null);
      return;
    }

    async function loadRolloutState() {
      try {
        setRolloutLoading(true);
        setRolloutError("");

        const response = await fetch(`${API_BASE_URL}/api/fine-tuning/${trainingJobId}/rollout-state`);
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(data?.detail || "Failed to load rollout state");
        }

        setRolloutState(data);
      } catch (error) {
        console.error(error);
        setRolloutError(error instanceof Error ? error.message : "Failed to load rollout state");
      } finally {
        setRolloutLoading(false);
      }
    }

    loadRolloutState();
  }, [trainingJobId]);

  const effectiveJobStatus = rolloutState?.training_job?.status ?? trainingJob?.status ?? "queued";
  const effectiveOutputPath =
    rolloutState?.training_job?.output_model_path ?? trainingJob?.output_model_path ?? "";
  const savedVersion = rolloutState?.saved_version ?? null;
  const stagingVersion = rolloutState?.staging_version ?? null;
  const activeModel = rolloutState?.active_model ?? null;

  const rolloutStatus =
    savedVersion?.status ??
    stagingVersion?.status ??
    (effectiveJobStatus === "completed" ? "ready_to_save" : effectiveJobStatus);

  const canRollout = Boolean(trainingJobId) && effectiveJobStatus === "completed" && Boolean(effectiveOutputPath);
  const activeModelPath = activeModel?.active_model_path || "Production model (existing inference pipeline)";
  const newVersionLabel = savedVersion?.version_name || "Not saved yet";
  const displayedModelVersionId = savedVersion?.id || stagingVersion?.id || "";

  const runRolloutAction = async (url, successMessage) => {
    try {
      setActionLoading(true);
      setRolloutError("");
      setActionMessage("");

      const response = await fetch(url, { method: "POST" });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.detail || "Rollout action failed");
      }

      setActionMessage(data?.message || successMessage);
      await refreshRolloutState();
      return data;
    } catch (error) {
      console.error(error);
      setRolloutError(error instanceof Error ? error.message : "Rollout action failed");
      return null;
    } finally {
      setActionLoading(false);
    }
  };

  const ensureSavedVersion = async () => {
    if (savedVersion?.id) return savedVersion.id;
    if (!trainingJobId) {
      setRolloutError("No completed training found.");
      return "";
    }

    const data = await runRolloutAction(
      `${API_BASE_URL}/api/fine-tuning/${trainingJobId}/save-version`,
      "Candidate version saved. Production remains unchanged.",
    );
    return data?.model_version_id || "";
  };

  const handleSaveVersion = async () => {
    if (!trainingJobId) {
      setRolloutError("No completed training found.");
      return;
    }
    await ensureSavedVersion();
  };

  const handleStageVersion = async () => {
    const modelVersionId = await ensureSavedVersion();
    if (!modelVersionId) return;

    await runRolloutAction(
      `${API_BASE_URL}/api/fine-tuning/model-versions/${modelVersionId}/stage`,
      activeUseCase?.id === "speed-estimation"
        ? "Model staged successfully. Go to Integration and choose 'Staged fine-tuned model' to test it on selected speed-estimation videos."
        : activeUseCase?.id === "object-tracking"
          ? "Model staged successfully. Go to Integration and choose 'Staged fine-tuned model' to test it on selected object-tracking videos."
          : activeUseCase?.id === "crack-detection"
            ? "Model staged successfully. Go to Integration and choose 'Staged fine-tuned model' to test it on selected crack images or videos. Production remains unchanged."
          : activeUseCase?.id === "unsafe-behavior-detection"
            ? "Model staged successfully. Go to Integration and choose 'Staged fine-tuned model' to test it on selected unsafe behavior images or videos. Production remains unchanged."
        : "Model staged for temporary testing. Production remains unchanged.",
    );
  };

  const handlePromoteVersion = async () => {
    const modelVersionId = await ensureSavedVersion();
    if (!modelVersionId) return;

    await runRolloutAction(
      `${API_BASE_URL}/api/fine-tuning/model-versions/${modelVersionId}/promote`,
      activeUseCase?.id === "speed-estimation"
        ? "Model promoted successfully. Integration will now use this Speed Estimation model by default."
        : activeUseCase?.id === "object-tracking"
          ? "Model promoted successfully. Integration will now use this Object Tracking model by default."
          : activeUseCase?.id === "crack-detection"
            ? "Model promoted successfully. Integration will now use this Crack Detection model by default."
          : activeUseCase?.id === "unsafe-behavior-detection"
            ? "Model promoted successfully. Integration will now use this Unsafe Behavior model by default."
        : "New model promoted as active model.",
    );
  };

  const handleKeepCurrent = async () => {
    if (!displayedModelVersionId) {
      setActionMessage("Current model remains active.");
      return;
    }

    await runRolloutAction(
      `${API_BASE_URL}/api/fine-tuning/model-versions/${displayedModelVersionId}/keep-current`,
      "Current model remains active.",
    );
  };

  return (
    <StepShell
      eyebrow="Step 7"
      helper={
        activeUseCase?.id === "speed-estimation"
          ? "Register the trained model, try it safely in staging for Speed Estimation, or promote it only after validation."
          : activeUseCase?.id === "object-tracking"
            ? "Register the trained model, try it safely in staging for Object Tracking, or promote it only after validation."
            : activeUseCase?.id === "crack-detection"
              ? "Register the trained crack model, test the staged version on crack images or videos in Integration, or promote it only after validation."
            : activeUseCase?.id === "unsafe-behavior-detection"
              ? "Register the trained unsafe-behavior model, test the staged version on unsafe behavior images or videos in Integration, or promote it only after validation."
            : activeUseCase?.id === "class-wise-object-counting"
              ? "Register the trained model, try it safely in staging for Class-wise Object Counting, or promote it only after validation."
          : "Register the trained model, try it safely in staging, or promote it only after validation."
      }
      title="Go live safely"
      aside={
        <>
          <SmallCard helper="Active production reference" title="Current live model" value={activeUseCase?.id === "crack-detection" ? (currentModel?.version || "Crack detector") : activeUseCase?.id === "unsafe-behavior-detection" ? (currentModel?.version || "Unsafe smoking detector") : currentModel.version} />
          <SmallCard
            helper={rolloutStatus === "promoted" ? "Now active for this use case" : "Latest saved rollout version"}
            title="New version"
            tone="accent"
            value={newVersionLabel}
          />
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Save the new version",
            helper: "Register this trained model as a candidate.",
          },
          {
            title: "Try it in staging",
            helper:
              activeUseCase?.id === "speed-estimation"
                ? "Temporarily test this model in Integration without replacing production."
                : activeUseCase?.id === "object-tracking"
                  ? "Temporarily test this model in Integration without replacing production."
                  : activeUseCase?.id === "crack-detection"
                    ? "Test staged model on crack images or videos in Integration without replacing production."
                  : activeUseCase?.id === "unsafe-behavior-detection"
                    ? "Test staged model on unsafe behavior images or videos in Integration without replacing production."
                  : activeUseCase?.id === "class-wise-object-counting"
                    ? "Temporarily test this model in Integration without replacing production."
                : "Temporarily test this model in Integration without replacing production.",
          },
          {
            title: "Promote after validation",
            helper: "Use this model as the active model only after validation.",
          },
        ].map((step, index) => (
          <div key={step.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brandBlue text-sm font-semibold text-white">{index + 1}</div>
            <div className="mt-3 text-sm font-semibold text-slate-900">{step.title}</div>
            <p className="mt-2 text-sm leading-6 text-slate-500">{step.helper}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-brandBlue/20 bg-brandBlue/[0.04] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-900">Fine-tuned rollout candidate</div>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {canRollout
                ? "Production remains unchanged unless you explicitly promote this version."
                : "Rollout actions stay blocked until training completes and produces a model artifact."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button disabled={!canRollout || actionLoading} onClick={handleSaveVersion} type="button" variant="outline">
              Save version
            </Button>
            <Button disabled={!canRollout || actionLoading} onClick={handleStageVersion} type="button" variant="outline">
              Try staging
            </Button>
            <Button disabled={!canRollout || actionLoading} onClick={handlePromoteVersion} type="button">
              Promote
              <Rocket className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Current production model</div>
          <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            <p><span className="font-semibold text-slate-900">Model:</span> {currentModel.name}</p>
            <p><span className="font-semibold text-slate-900">Status:</span> Active</p>
            <p><span className="font-semibold text-slate-900">Model path:</span> {activeModelPath}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">New fine-tuned model</div>
          <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            <p><span className="font-semibold text-slate-900">Training job ID:</span> {trainingJobId || trainingJob?.id || "Not available"}</p>
            <p><span className="font-semibold text-slate-900">Status:</span> {rolloutStatus}</p>
            <p><span className="font-semibold text-slate-900">Model path:</span> {effectiveOutputPath || "No trained model path yet"}</p>
            <p><span className="font-semibold text-slate-900">Run depth:</span> {selectedTrainingMode?.label ?? "Recommended"}</p>
          </div>
          <Button className="mt-4" disabled={actionLoading} onClick={handleKeepCurrent} type="button" variant="outline">
            Keep current model
          </Button>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Rollout state</div>
        {rolloutLoading ? (
          <p className="mt-3 text-sm leading-6 text-slate-600">Loading rollout state...</p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <SmallCard
              helper="Registered version for this training job"
              title="Saved version"
              value={savedVersion?.status ?? "Not saved"}
            />
            <SmallCard
              helper="Temporary validation path only"
              title="Staging"
              value={stagingVersion?.version_name ?? "Not staged"}
            />
            <SmallCard
              helper="Updated only after promote"
              title="Active model"
              value={activeModel?.active_model_version_id || currentModel.version}
            />
          </div>
        )}

        {rolloutError ? (
          <div className="mt-4 rounded-2xl border border-brandRed/20 bg-brandRed/[0.05] px-4 py-3 text-sm leading-6 text-brandRed">
            {rolloutError}
          </div>
        ) : null}

        {actionMessage ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
            {actionMessage}
          </div>
        ) : null}

        <p className="mt-4 text-sm leading-6 text-slate-500">
          Try staging never changes the active production model. Promote is the only action that updates the active model reference.
        </p>
      </div>
    </StepShell>
  );
}
