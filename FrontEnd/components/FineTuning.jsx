"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, PlayCircle } from "lucide-react";

import { API_BASE_URL, getIntegrationDefaults, sectionLabelToParam } from "./visionLabConfig";
import {
  DEFAULT_ADVANCED_SETTINGS,
  getFineTuningConfig,
  goalOptions,
  stopConditionOptions,
  trainingModeOptions,
} from "./fine-tuning/useCaseFineTuningConfig";
import { buildMockFineTuningState } from "./fine-tuning/mockFineTuningData";
import {
  deleteDataset,
  loadDataCheckStatus,
  loadDatasetDetail,
  loadDatasets,
  loadLabelState,
  importLabelExport,
  loadStepOne,
  prepareDatasetReadyPayload,
  registerDataset,
  runDataCheck,
  selectDataset,
  startNewSetup,
  startSetup,
  updateLabelStatus,
} from "./fine-tuning/fineTuningApi";
import FineTuningStepRail from "./fine-tuning/FineTuningStepRail";
import {
  CompareResultsStep,
  DataStep,
  GetStartedStep,
  LabelsStep,
  RolloutStep,
  TrainingPlanStep,
  WatchTrainingStep,
} from "./fine-tuning/FineTuningWizardSteps";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";


const MODEL_PAYLOAD_MAP = {
  "fire-fast": "yolo_nano",
  "fire-balanced": "current_model",
  "fire-watch": "yolo_medium",
  "unsafe-current": "current_model",
  "unsafe-fast": "yolo_nano",
  "unsafe-accurate": "yolo_medium",
  "crack-current": "current_model",
  "crack-fast": "yolo_nano",
  "crack-accurate": "yolo_medium",
  "ppe-fast": "yolo_nano",
  "ppe-balanced": "current_model",
  "ppe-accurate": "yolo_medium",
  "region-fast": "yolo_nano",
  "region-balanced": "current_model",
  "region-guard": "yolo_medium",
  "speed-fast": "yolo_nano",
  "speed-balanced": "current_model",
  "speed-accurate": "yolo_medium",
  "speed-precision": "yolo_medium",
  "tracking-fast": "yolo_nano",
  "track-fast": "yolo_nano",
  "object-tracking-fast": "yolo_nano",
  "tracking-balanced": "current_model",
  "track-balanced": "current_model",
  "object-tracking-balanced": "current_model",
  "tracking-identity-focus": "yolo_medium",
  "track-identity": "yolo_medium",
  "object-tracking-identity-focus": "yolo_medium",
  "counting-fast": "yolo_nano",
  "count-fast": "yolo_nano",
  "class-wise-counting-fast": "yolo_nano",
  "class-wise-object-counting-fast": "yolo_nano",
  "counting-balanced": "current_model",
  "count-balanced": "current_model",
  "class-wise-counting-balanced": "current_model",
  "class-wise-object-counting-balanced": "current_model",
  "counting-accurate": "yolo_medium",
  "count-accurate": "yolo_medium",
  "class-wise-counting-accurate": "yolo_medium",
  "class-wise-object-counting-accurate": "yolo_medium",
};

const RUN_DEPTH_PAYLOAD_MAP = {
  "quick-tune": {
    run_depth: "quick_check",
    epochs: 6,
    batch_size: 2,
    img_size: 640,
  },
  balanced: {
    run_depth: "recommended",
    epochs: 14,
    batch_size: 4,
    img_size: 768,
  },
  "deep-optimization": {
    run_depth: "deep_tune",
    epochs: 24,
    batch_size: 8,
    img_size: 896,
  },
};

function getInitialFormState(useCase) {
  const config = getFineTuningConfig(useCase);
  return {
    datasetSource: "existing",
    selectedDatasetId: "",
    labelReadiness: "unsure",
    labelingMode: "prepare-labeling",
    baseModelId: config.recommendedBaseModelId ?? config.baseModels[0]?.value ?? "",
    goalId: config.recommendedGoalId ?? goalOptions[0]?.value ?? "",
    trainingModeId: config.recommendedTrainingModeId ?? trainingModeOptions[1]?.value ?? trainingModeOptions[0]?.value ?? "",
    stopConditionId: stopConditionOptions[0]?.value ?? "auto-stop",
    advancedSettings: { ...DEFAULT_ADVANCED_SETTINGS, ...(config.advancedDefaults ?? {}) },
    extensionSettings: { ...(config.extensionDefaults ?? {}) },
    selectedCandidateId: "best-tradeoff",
  };
}

function getTrainingJobUiPatch(status, outputModelPath = "") {
  if (status === "running") {
    return {
      status: "running",
      current_stage: "Training in progress",
      progress_percent: 55,
      eta: "Running now",
      next_up: "Training is running. This may take a few minutes.",
      plain_english_status: "Training is running. This may take a few minutes.",
      output_model_path: outputModelPath,
    };
  }

  if (status === "completed") {
    return {
      status: "completed",
      current_stage: "Training completed",
      progress_percent: 100,
      eta: "Finished",
      next_up: "Training completed successfully. You can review this run before moving to comparison.",
      plain_english_status: "Training completed successfully.",
      output_model_path: outputModelPath,
    };
  }

  if (status === "failed") {
    return {
      status: "failed",
      current_stage: "Training failed",
      progress_percent: 0,
      eta: "Needs attention",
      next_up: "Training failed. Check backend logs before retrying.",
      plain_english_status: "Training failed. Check backend logs.",
      output_model_path: outputModelPath,
    };
  }

  return {
    status: "queued",
    current_stage: "Training job queued",
    progress_percent: 0,
    eta: "Waiting to start",
    next_up: "Training job is ready to start.",
    plain_english_status: "Training job is ready to start.",
    output_model_path: outputModelPath,
  };
}

function getInitialRegisterForm(useCase) {
  const defaults = getIntegrationDefaults(useCase.id);
  return {
    name: `${useCase.title} MinIO dataset`,
    source_type: "minio",
    minio_bucket: "vision-demo",
    minio_prefix: defaults.input_prefix ?? "input/",
    media_type: "mixed",
  };
}

function getErrorMessage(error, fallback) {
  return error?.message || fallback;
}

function labelStatusToReadiness(labelStatus) {
  if (labelStatus === "ready") return "yes";
  if (labelStatus === "missing") return "no";
  if (labelStatus === "partial") return "partial";
  return "unsure";
}

function readinessToLabelStatus(readiness) {
  if (readiness === "yes") return "ready";
  if (readiness === "no") return "missing";
  if (readiness === "partial") return "partial";
  return "unknown";
}

function labelStatusToMode(labelStatus) {
  if (labelStatus === "ready") return "already-labeled";
  if (labelStatus === "missing") return "label-later";
  if (labelStatus === "partial") return "prepare-labeling";
  return "prepare-labeling";
}

function formatDateLabel(value) {
  if (!value) return "Not updated";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function normalizeDatasetName(name) {
  const normalized = typeof name === "string" ? name.trim() : "";
  if (!normalized || normalized.toLowerCase() === "string") return "Unnamed dataset";
  return normalized;
}

function getLabelStatusDisplay(labelStatus, invalid = false) {
  if (invalid) return "No supported files";
  if (labelStatus === "ready") return "Labels ready";
  if (labelStatus === "partial") return "Partial labels";
  if (labelStatus === "missing") return "Needs labels";
  return "Labels unknown";
}

function getLabelStatusTone(labelStatus, invalid = false) {
  if (invalid) return "warning";
  return labelStatus === "ready" ? "compliant" : "warning";
}

function getDatasetApiId(dataset) {
  const id = dataset?.dataset_id ?? dataset?.id;
  return id === undefined || id === null ? "" : String(id);
}

function isDatasetInvalid(dataset) {
  const fileCount = Number(dataset?.file_count ?? 0);
  const prefixValidationFailed =
    dataset?.prefix_validation_failed === true ||
    dataset?.prefix_exists === false ||
    dataset?.validation?.prefix_exists === false ||
    dataset?.validation?.bucket_accessible === false;

  return fileCount === 0 || prefixValidationFailed;
}

function getDatasetFileCount(dataset) {
  return Number(dataset?.file_count ?? 0);
}

function compareDatasetValue(first, second) {
  const firstCount = getDatasetFileCount(first);
  const secondCount = getDatasetFileCount(second);
  if (firstCount !== secondCount) return secondCount - firstCount;

  const firstCreated = new Date(first?.created_at ?? 0).getTime() || 0;
  const secondCreated = new Date(second?.created_at ?? 0).getTime() || 0;
  return secondCreated - firstCreated;
}

function chooseDatasetForStep(datasets) {
  const list = Array.isArray(datasets) ? datasets : [];
  const autoSelectable = list.filter((dataset) => !isDatasetInvalid(dataset));
  const selectedDataset = autoSelectable.find((dataset) => dataset?.is_selected === true);
  if (selectedDataset) return selectedDataset;

  const bestDatasetWithFiles = autoSelectable
    .filter((dataset) => getDatasetFileCount(dataset) > 0)
    .sort(compareDatasetValue)[0];
  if (bestDatasetWithFiles) return bestDatasetWithFiles;

  return autoSelectable[0] ?? list[0] ?? null;
}

function sortDatasetsForStep(datasets) {
  return [...datasets].sort((first, second) => {
    const firstInvalid = isDatasetInvalid(first);
    const secondInvalid = isDatasetInvalid(second);
    if (firstInvalid !== secondInvalid) return firstInvalid ? 1 : -1;

    return compareDatasetValue(first, second);
  });
}

function mapDatasetFromApi(dataset) {
  const labelStatus = dataset.label_status ?? "unknown";
  const minioPath = [dataset.minio_bucket, dataset.minio_prefix].filter(Boolean).join("/");
  const fileCount = Number(dataset.file_count ?? 0);
  const mediaType = dataset.media_type ?? "unknown";
  const invalid = isDatasetInvalid(dataset);
  const labelDisplay = getLabelStatusDisplay(labelStatus, invalid);
  return {
    id: getDatasetApiId(dataset),
    name: normalizeDatasetName(dataset.name),
    source: dataset.source_type ?? "minio",
    format: mediaType,
    file_count: fileCount,
    media_type: mediaType,
    item_count: `${fileCount} supported ${fileCount === 1 ? "file" : "files"}`,
    labeled: labelStatus === "ready",
    label_status: labelStatus,
    label_display: labelDisplay,
    label_tone: getLabelStatusTone(labelStatus, invalid),
    annotation_mode: labelStatus,
    status: dataset.readiness_status ?? dataset.audit_status ?? "not_run",
    isInvalid: invalid,
    invalidReason: invalid ? "No supported files were found for this MinIO prefix." : "",
    updated_at: formatDateLabel(dataset.created_at),
    note: minioPath ? `MinIO: ${minioPath}` : "MinIO dataset reference",
    raw: dataset,
  };
}

function issueText(issue) {
  if (!issue) return "";
  return issue.message ?? issue.detail ?? issue.code ?? String(issue);
}

function recommendationText(recommendation) {
  if (!recommendation) return "";
  return recommendation.message ?? recommendation.detail ?? recommendation.code ?? String(recommendation);
}

function buildDatasetHealth(step1Data, dataCheckStatus, labelState, selectedDataset) {
  const dataReadiness = step1Data?.summary_cards?.data_readiness;
  const safety = step1Data?.summary_cards?.safety;
  const issues = dataCheckStatus?.issues ?? safety?.issues ?? [];
  const recommendations = dataCheckStatus?.recommendations ?? safety?.recommendations ?? [];
  const selectedRaw = selectedDataset?.raw;
  const selectedFileCount = Number(selectedDataset?.file_count ?? selectedRaw?.file_count ?? 0);
  const selectedIsInvalid = Boolean(selectedDataset?.isInvalid);
  const score = selectedDataset
    ? selectedRaw?.readiness_score ?? dataCheckStatus?.readiness_score ?? (selectedIsInvalid ? 0 : dataReadiness?.score ?? labelState?.readiness_score ?? 0)
    : dataCheckStatus?.readiness_score ?? dataReadiness?.score ?? labelState?.readiness_score ?? 0;
  const readiness = selectedIsInvalid
    ? "Selected dataset has no supported files. Check the MinIO bucket and prefix."
    : selectedDataset
      ? selectedRaw?.readiness_status ??
        selectedRaw?.audit_status ??
        dataCheckStatus?.summary?.readiness_status ??
        "Run a data check for the selected dataset."
      : dataCheckStatus?.summary?.readiness_status ??
        dataReadiness?.status ??
        step1Data?.recommended_next_action ??
        "Load Step 1 to check data readiness.";

  const topActions = recommendations.map(recommendationText).filter(Boolean);
  const checks = selectedDataset
    ? [
        {
          label: "Selected dataset",
          status: selectedIsInvalid ? "warning" : "compliant",
          detail: `${selectedDataset.name}: ${selectedFileCount} supported ${selectedFileCount === 1 ? "file" : "files"}.`,
        },
      ]
    : issues.map((issue) => ({
        label: issue.code ?? "Dataset check",
        status: issue.severity === "high" ? "warning" : "normal",
        detail: issueText(issue),
      }));

  return {
    score,
    readiness,
    split_summary: { train: "Pending", validation: "Pending", test: "Pending" },
    top_actions: topActions.length
      ? topActions.slice(0, 4)
      : selectedIsInvalid
        ? [
            "Fix the selected MinIO prefix or choose a dataset with supported image/video files.",
            "After correcting the prefix, register the dataset again and run a data check.",
          ]
      : [
          step1Data?.recommended_next_action ?? "Select a dataset and run a data check.",
          "Confirm whether labels are ready before training setup.",
        ],
    good_example_tips: [
      "Use footage that looks like your real cameras.",
      "Include difficult lighting, distance, and crowded scenes.",
      "Keep examples representative of the site where the model will run.",
    ],
    checks: checks.length
      ? checks
      : [
          {
            label: "Label status",
            status: labelState?.current_label_status === "ready" ? "compliant" : "warning",
            detail: labelState?.guidance_message ?? "Confirm label readiness before continuing.",
          },
        ],
    preprocessing_steps: [
      "Validate selected dataset",
      "Confirm label readiness",
      "Prepare the dataset handoff for training setup",
    ],
  };
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function titleCaseLabel(value) {
  return String(value || "Unknown")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeClassDistribution(distribution) {
  if (!distribution || typeof distribution !== "object") return [];

  const entries = Array.isArray(distribution)
    ? distribution.map((item) => [
        item?.class_name ?? item?.class ?? item?.label ?? item?.name,
        item?.count ?? item?.value ?? item?.items ?? item?.total,
      ])
    : Object.entries(distribution).map(([name, value]) => [
        name,
        typeof value === "object" && value !== null ? value.count ?? value.value ?? value.total : value,
      ]);

  const rows = entries
    .map(([name, count]) => ({
      name: titleCaseLabel(name),
      count: firstFiniteNumber(count) ?? 0,
    }))
    .filter((row) => row.name && row.count > 0);

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (!total) return [];

  return rows
    .map((row) => ({
      ...row,
      percentage: Math.round((row.count / total) * 100),
    }))
    .sort((first, second) => second.count - first.count);
}

function getClassBalanceMessage(classRows) {
  if (!classRows.length) {
    return {
      status: "unavailable",
      title: "Class distribution unavailable",
      message: "Class distribution not available yet.",
      tone: "normal",
    };
  }

  if (classRows.length === 1) {
    return {
      status: "single_class",
      title: "Single class dataset",
      message: "Balance check unavailable until multiple classes are present.",
      tone: "normal",
    };
  }

  const counts = classRows.map((row) => row.count);
  const smallest = Math.min(...counts);
  const largest = Math.max(...counts);
  const ratio = largest > 0 ? smallest / largest : 0;

  if (ratio >= 0.5) {
    return {
      status: "good",
      title: "Good balance",
      message: "Classes are reasonably balanced for an initial training setup.",
      tone: "accent",
    };
  }

  if (ratio >= 0.3) {
    return {
      status: "partial",
      title: "Partially balanced",
      message: "One class is smaller than the others. More examples may improve accuracy.",
      tone: "warn",
    };
  }

  return {
    status: "imbalanced",
    title: "Highly imbalanced dataset",
    message: "Better class balance may improve training accuracy.",
    tone: "warn",
  };
}

function buildStepOneDatasetState({ step1Data, dataCheckStatus, selectedDataset, datasetDetail, datasetReadyPayload }) {
  const dataCard = step1Data?.summary_cards?.data_readiness ?? {};
  const selectedDatasetId = step1Data?.selected_dataset_id ?? dataCard?.dataset?.id ?? selectedDataset?.id ?? "";
  const hasSelectedDataset = Boolean(selectedDatasetId);
  const auditSummary =
    dataCheckStatus?.summary ??
    datasetDetail?.dataset?.latest_audit?.summary ??
    step1Data?.data_check_summary ??
    {};
  const contract = datasetReadyPayload ?? {};
  const classDistribution =
    contract.class_distribution ??
    auditSummary.class_distribution ??
    auditSummary.class_counts ??
    auditSummary.label_distribution ??
    dataCard.class_distribution ??
    selectedDataset?.raw?.class_distribution ??
    {};
  const classRows = normalizeClassDistribution(classDistribution);
  const balance = getClassBalanceMessage(classRows);
  const itemCount = firstFiniteNumber(
    contract.item_count,
    auditSummary.item_count,
    auditSummary.file_count,
    auditSummary.supported_file_count,
    dataCard.file_count,
    selectedDataset?.file_count,
    selectedDataset?.raw?.file_count,
  );
  const labelCount = firstFiniteNumber(
    contract.label_count,
    auditSummary.label_count,
    auditSummary.label_file_count,
    dataCard.label_count,
    selectedDataset?.raw?.label_count,
  );
  const labelStatus = String(
    contract.label_status ??
      datasetDetail?.label_readiness ??
      datasetDetail?.dataset?.label_status ??
      selectedDataset?.label_status ??
      dataCard.label_status ??
      "unknown",
  ).toLowerCase();
  const labelsMissing = hasSelectedDataset && (labelStatus === "missing" || labelCount === 0);
  const warningCount =
    (Array.isArray(dataCheckStatus?.issues) ? dataCheckStatus.issues.length : 0) +
    (Array.isArray(dataCheckStatus?.warnings) ? dataCheckStatus.warnings.length : 0) +
    (Array.isArray(datasetDetail?.dataset?.latest_audit?.issues) ? datasetDetail.dataset.latest_audit.issues.length : 0);
  const hasWarnings =
    Boolean(selectedDataset?.isInvalid) === false &&
    (labelStatus === "partial" ||
      warningCount > 0 ||
      String(dataCheckStatus?.summary?.readiness_status ?? selectedDataset?.raw?.readiness_status ?? "").toLowerCase().includes("warning"));
  const readinessStatus = !hasSelectedDataset
    ? "Not checked"
    : selectedDataset?.isInvalid
      ? "Invalid dataset"
      : labelsMissing
        ? "Needs labels"
        : hasWarnings
          ? "Has warnings"
          : "Ready";

  let recommendation = "Dataset looks usable. Continue to the next step.";
  if (!hasSelectedDataset) {
    recommendation = step1Data?.recommended_next_action ?? "Choose or register a dataset, then run a data check.";
  } else if (selectedDataset?.isInvalid) {
    recommendation = "Recommended: choose a dataset with supported files or fix the MinIO prefix.";
  } else if (labelsMissing) {
    recommendation = "Recommended: add more labels before training.";
  } else if (readinessStatus === "Has warnings") {
    recommendation = "Recommended: review the warnings, then refresh the dataset before training.";
  }

  return {
    datasetName: hasSelectedDataset ? selectedDataset?.name ?? dataCard?.dataset?.name ?? "Selected dataset" : "No dataset selected yet",
    classRows,
    balance,
    itemCount,
    labelCount,
    labelStatus,
    hasSelectedDataset,
    hasWarnings,
    labelsMissing,
    readinessStatus,
    recommendation,
    resumeMessage: hasSelectedDataset ? step1Data?.resume_message ?? `Resuming previous setup: ${selectedDataset?.name ?? dataCard?.dataset?.name ?? "selected dataset"}` : "",
  };
}

function buildTrainingJob(mockTrainingJob, step1Data, dataCheckStatus) {
  if (dataCheckStatus?.status === "running") {
    return {
      ...mockTrainingJob,
      status: "running",
      current_stage: "Checking dataset",
      progress_percent: 18,
      next_up: "Waiting for the backend data check to finish.",
      plain_english_status: "The selected dataset is being checked for files, labels, and basic readiness.",
    };
  }

  if (dataCheckStatus && dataCheckStatus.status !== "not_started") {
    const complete = dataCheckStatus.status !== "failed";
    return {
      ...mockTrainingJob,
      status: complete ? "ready" : "blocked",
      current_stage: complete ? "Dataset check complete" : "Dataset check failed",
      progress_percent: complete ? 22 : 12,
      next_up: complete ? "Choose or confirm labels before preparing the training handoff." : "Fix the reported dataset issue and run the check again.",
      plain_english_status: complete ? "Dataset readiness has been checked by the backend." : "The data check returned an error that needs attention.",
    };
  }

  return {
    ...mockTrainingJob,
    current_stage: step1Data ? "Setup loaded" : mockTrainingJob.current_stage,
    next_up: step1Data?.recommended_next_action ?? mockTrainingJob.next_up,
  };
}

function buildCurrentPlanState({
  activeStepId,
  currentStep,
  selectedDataset,
  selectedDatasetDetail,
  labelState,
  datasetReadyPayload,
  dataCheckStatus,
  trainingJob,
}) {
  const selectedDetail = selectedDatasetDetail?.dataset ?? selectedDatasetDetail ?? {};
  const labelStatus = String(
    datasetReadyPayload?.label_status ??
      labelState?.current_label_status ??
      selectedDatasetDetail?.label_readiness ??
      selectedDetail?.label_status ??
      selectedDataset?.label_status ??
      "unknown",
  ).toLowerCase();
  const handoffStatus = String(datasetReadyPayload?.status ?? "").toLowerCase();
  let status = "blocked";
  if (selectedDataset) status = selectedDataset.isInvalid ? "blocked" : "normal";

  if (dataCheckStatus?.status === "running") {
    return {
      status: "running",
    };
  }

  if (dataCheckStatus && dataCheckStatus.status !== "not_started") {
    if (dataCheckStatus.status === "failed") {
      status = "blocked";
    } else {
      status = selectedDataset?.isInvalid ? "blocked" : "normal";
    }
  }

  if (currentStep >= 3 || activeStepId === "labels") {
    if (labelStatus === "missing" || !selectedDataset || selectedDataset?.isInvalid) {
      status = "blocked";
    } else if (labelStatus === "partial" || labelStatus === "unknown") {
      status = "warning";
    } else if (labelStatus === "ready") {
      status = "normal";
    }
  }

  if (handoffStatus === "ready_with_warnings") {
    status = "warning";
  } else if (handoffStatus === "ready_for_training") {
    status = "compliant";
  } else if (handoffStatus === "blocked") {
    status = "blocked";
  }

  if (["plan", "training", "compare", "rollout"].includes(activeStepId)) {
    status =
      trainingJob?.status === "complete"
        ? "compliant"
        : trainingJob?.status === "running"
          ? "running"
          : status;
  }

  return {
    status,
  };
}

const sleep = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
export default function FineTuning({ activeUseCase }) {
  const searchParams = useSearchParams();
  const [mockState, setMockState] = useState(() => buildMockFineTuningState(activeUseCase));
  const [formState, setFormState] = useState(() => getInitialFormState(activeUseCase));
  const [registerForm, setRegisterForm] = useState(() => getInitialRegisterForm(activeUseCase));
  const [activeStepId, setActiveStepId] = useState("start");
  const [currentStep, setCurrentStep] = useState(1);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(false);
  const [pageMessage, setPageMessage] = useState("");
  const [pageError, setPageError] = useState("");
  const [trainingPlanLoading, setTrainingPlanLoading] = useState(false);
  const [trainingJobId, setTrainingJobId] = useState("");

  const [sessionId, setSessionId] = useState(null);
  const [step1Data, setStep1Data] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [datasetDetail, setDatasetDetail] = useState(null);
  const [labelState, setLabelState] = useState(null);
  const [datasetReadyPayload, setDatasetReadyPayload] = useState(null);
  const [dataCheckStatus, setDataCheckStatus] = useState(null);
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});

  const config = getFineTuningConfig(activeUseCase);
  const isDeprecatedCountingUseCase = activeUseCase.id === "class-wise-object-counting";
  const requestedFineTuningStep = searchParams.get("ftStep");
  const mappedDatasets = useMemo(() => sortDatasetsForStep(datasets).map(mapDatasetFromApi), [datasets]);
  const selectedDataset = useMemo(
    () => mappedDatasets.find((dataset) => dataset.id === String(formState.selectedDatasetId)) ?? null,
    [formState.selectedDatasetId, mappedDatasets],
  );
  const selectedBaseModel =
    config.baseModels.find((model) => model.value === formState.baseModelId) ?? config.baseModels[0] ?? null;
  const selectedTrainingMode =
    trainingModeOptions.find((mode) => mode.value === formState.trainingModeId) ?? trainingModeOptions[0];
  const currentSessionId = sessionId ?? mockState.sessionId ?? `${activeUseCase.id}-session-1`;
  const datasetHealth = useMemo(
    () => buildDatasetHealth(step1Data, dataCheckStatus, labelState, selectedDataset),
    [step1Data, dataCheckStatus, labelState, selectedDataset],
  );
  const stepOneDatasetState = useMemo(
    () => buildStepOneDatasetState({ step1Data, dataCheckStatus, selectedDataset, datasetDetail, datasetReadyPayload }),
    [step1Data, dataCheckStatus, selectedDataset, datasetDetail, datasetReadyPayload],
  );
  const trainingJob = useMemo(() => buildTrainingJob(mockState.trainingJob, step1Data, dataCheckStatus), [mockState.trainingJob, step1Data, dataCheckStatus]);
  const currentPlanState = useMemo(
    () =>
      buildCurrentPlanState({
        activeStepId,
        currentStep,
        selectedDataset,
        selectedDatasetDetail: datasetDetail,
        labelState,
        datasetReadyPayload,
        dataCheckStatus,
        trainingJob,
      }),
    [activeStepId, currentStep, selectedDataset, datasetDetail, labelState, datasetReadyPayload, dataCheckStatus, trainingJob],
  );
  const annotationEditorHref = useMemo(() => {
    if (!sessionId) return "";
    const params = new URLSearchParams({
      usecase: activeUseCase.id,
      section: sectionLabelToParam[activeUseCase.category] ?? "safety-compliance",
    });
    return `/fine-tuning/${encodeURIComponent(String(sessionId))}/annotate?${params.toString()}`;
  }, [activeUseCase.category, activeUseCase.id, sessionId]);

  const steps = useMemo(
    () => [
      { id: "start", label: "Get started", helper: "Understand the safe path" },
      { id: "data", label: "Your data", helper: "Register MinIO data" },
      { id: "labels", label: "Labels", helper: "Choose labeling path" },
      { id: "plan", label: "Training plan", helper: "Pick model and run" },
      { id: "training", label: "Watch training", helper: "Track progress" },
      { id: "compare", label: "Show results", helper: "Review training artifacts and model details" },
      { id: "rollout", label: "Go live safely", helper: "Save, stage, or keep current" },
    ],
    [],
  );

  const activeStepIndex = Math.max(steps.findIndex((step) => step.id === activeStepId), 0);
  const completedStepIds = steps.slice(0, activeStepIndex).map((step) => step.id);

  const setLoadingFlag = useCallback((key, value) => {
    setLoading((current) => ({ ...current, [key]: value }));
  }, []);

  const setError = useCallback((key, value) => {
    setErrors((current) => ({ ...current, [key]: value }));
  }, []);

  const loadStepOneState = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoadingFlag("step1", true);
      setError("step1", "");
      try {
        const payload = await loadStepOne(activeUseCase.id);
        const datasetId = payload?.selected_dataset_id ?? payload?.summary_cards?.data_readiness?.dataset?.id;
        setStep1Data(payload);
        setSessionId(payload.session_id);
        setCurrentStep(payload.current_step ?? 1);
        setFormState((current) => ({ ...current, selectedDatasetId: datasetId ? String(datasetId) : "" }));
        return payload;
      } catch (error) {
        setError("step1", getErrorMessage(error, "Unable to load fine-tuning setup."));
        return null;
      } finally {
        if (!silent) setLoadingFlag("step1", false);
      }
    },
    [activeUseCase.id, setError, setLoadingFlag],
  );

  const loadDatasetsState = useCallback(
    async ({ silent = false, repairBackendSelection = true } = {}) => {
      if (!sessionId) return null;
      if (!silent) setLoadingFlag("datasets", true);
      setError("datasets", "");
      try {
        let payload = await loadDatasets(sessionId);
        let list = Array.isArray(payload.datasets) ? payload.datasets : [];
        const backendSelectedId =
          payload.selected_dataset_id !== undefined && payload.selected_dataset_id !== null
            ? String(payload.selected_dataset_id)
            : getDatasetApiId(list.find((dataset) => dataset?.is_selected === true));
        let selected = backendSelectedId ? list.find((dataset) => getDatasetApiId(dataset) === backendSelectedId) ?? null : null;
        if (backendSelectedId && !selected) {
          selected = chooseDatasetForStep(list);
        }
        let selectedId = getDatasetApiId(selected);

        if (repairBackendSelection && backendSelectedId && selectedId && selectedId !== backendSelectedId && !isDatasetInvalid(selected)) {
          await selectDataset(sessionId, selectedId);
          payload = await loadDatasets(sessionId);
          list = Array.isArray(payload.datasets) ? payload.datasets : list;
          selected = list.find((dataset) => getDatasetApiId(dataset) === selectedId) ?? chooseDatasetForStep(list);
          selectedId = getDatasetApiId(selected);
        }

        setDatasets(list);
        setCurrentStep(payload.current_step ?? 2);
        setDatasetDetail((current) => {
          const currentId = getDatasetApiId(current?.dataset);
          return selectedId && currentId === selectedId ? current : null;
        });
        if (selected) {
          setFormState((current) => ({
            ...current,
            selectedDatasetId: selectedId,
            labelReadiness: labelStatusToReadiness(selected.label_status),
            labelingMode: labelStatusToMode(selected.label_status),
          }));
        } else {
          setFormState((current) => ({ ...current, selectedDatasetId: "" }));
        }
        return { ...payload, selectedDatasetId: selectedId, selectedDataset: selected };
      } catch (error) {
        setError("datasets", getErrorMessage(error, "Unable to load datasets."));
        return null;
      } finally {
        if (!silent) setLoadingFlag("datasets", false);
      }
    },
    [sessionId, setError, setLoadingFlag],
  );

  const loadDatasetDetailState = useCallback(
    async (datasetId, { silent = false } = {}) => {
      if (!sessionId || !datasetId) return null;
      if (!silent) setLoadingFlag("datasetDetail", true);
      setError("datasetDetail", "");
      try {
        const payload = await loadDatasetDetail(sessionId, datasetId);
        setDatasetDetail(payload);
        return payload;
      } catch (error) {
        setError("datasetDetail", getErrorMessage(error, "Unable to load dataset details."));
        return null;
      } finally {
        if (!silent) setLoadingFlag("datasetDetail", false);
      }
    },
    [sessionId, setError, setLoadingFlag],
  );

  const loadLabelStateFromBackend = useCallback(
    async ({ silent = false } = {}) => {
      if (!sessionId) return null;
      if (!silent) setLoadingFlag("labels", true);
      setError("labels", "");
      try {
        const payload = await loadLabelState(sessionId);
        setLabelState(payload);
        setCurrentStep(3);
        setFormState((current) => ({
          ...current,
          selectedDatasetId: payload.dataset_id ? String(payload.dataset_id) : current.selectedDatasetId,
          labelReadiness: labelStatusToReadiness(payload.current_label_status),
          labelingMode: labelStatusToMode(payload.current_label_status),
        }));
        return payload;
      } catch (error) {
        setError("labels", getErrorMessage(error, "Unable to load label state."));
        return null;
      } finally {
        if (!silent) setLoadingFlag("labels", false);
      }
    },
    [sessionId, setError, setLoadingFlag],
  );

  useEffect(() => {
    setMockState(buildMockFineTuningState(activeUseCase));
    setFormState(getInitialFormState(activeUseCase));
    setRegisterForm(getInitialRegisterForm(activeUseCase));
    setActiveStepId("start");
    setCurrentStep(1);
    setAdvancedOpen(false);
    setSceneOpen(false);
    setPageMessage("");
    setPageError("");
    setTrainingPlanLoading(false);
    setTrainingJobId("");
    setSessionId(null);
    setStep1Data(null);
    setDatasets([]);
    setDatasetDetail(null);
    setLabelState(null);
    setDatasetReadyPayload(null);
    setDataCheckStatus(null);
    setErrors({});
    void loadStepOneState();
  }, [activeUseCase.id, loadStepOneState]);

  useEffect(() => {
    if (activeStepId === "data" && sessionId) {
      void loadDatasetsState();
    }
  }, [activeStepId, sessionId, loadDatasetsState]);

  useEffect(() => {
    if ((activeStepId === "data" || activeStepId === "labels") && sessionId && formState.selectedDatasetId) {
      void loadDatasetDetailState(formState.selectedDatasetId, { silent: true });
    }
  }, [activeStepId, formState.selectedDatasetId, loadDatasetDetailState, sessionId]);

  useEffect(() => {
    if (activeStepId === "labels" && sessionId) {
      void loadLabelStateFromBackend();
    }
  }, [activeStepId, loadLabelStateFromBackend, sessionId]);

  useEffect(() => {
    if (!sessionId || requestedFineTuningStep !== "labels") return;
    setActiveStepId("labels");
    setCurrentStep((current) => Math.max(current, 3));
    void loadDatasetsState({ silent: true, repairBackendSelection: true });
  }, [loadDatasetsState, requestedFineTuningStep, sessionId]);

  const updateFormField = (field, value) => {
    setFormState((current) => ({ ...current, [field]: value }));
  };

  const updateRegisterFormField = (field, value) => {
    setRegisterForm((current) => ({ ...current, [field]: value }));
  };

  const updateAdvancedSetting = (field, value) => {
    setFormState((current) => ({
      ...current,
      advancedSettings: {
        ...current.advancedSettings,
        [field]: value,
      },
    }));
  };

  const updateExtensionSetting = (field, value) => {
    setFormState((current) => ({
      ...current,
      extensionSettings: {
        ...current.extensionSettings,
        [field]: value,
      },
    }));
  };

  const goToStep = (stepId) => {
    setActiveStepId(stepId);
    const stepIndex = steps.findIndex((step) => step.id === stepId);
    if (stepIndex >= 0) setCurrentStep(stepIndex + 1);
  };

  const goNext = () => {
    const nextStep = steps[activeStepIndex + 1];
    if (nextStep) goToStep(nextStep.id);
  };

  const goBack = () => {
    const previousStep = steps[activeStepIndex - 1];
    if (previousStep) goToStep(previousStep.id);
  };

  const refreshEarlySteps = async () => {
    await loadStepOneState({ silent: true });
    if (sessionId) {
      await loadDatasetsState({ silent: true });
      if (activeStepId === "labels") await loadLabelStateFromBackend({ silent: true });
    }
  };

  const pollDataCheckUntilComplete = async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const status = await loadDataCheckStatus(sessionId);
      setDataCheckStatus(status);
      if (status.status && status.status !== "running") return status;
      await sleep(1000);
    }
    throw new Error("Data check is still running. Please check again in a moment.");
  };

  const handleAuditDataset = async () => {
    if (!sessionId) {
      setError("step1", "Fine-tuning session is not loaded yet.");
      return;
    }
    setLoadingFlag("dataCheck", true);
    setError("step1", "");
    setError("labels", "");
    try {
      const started = await runDataCheck(sessionId);
      setDataCheckStatus(started);
      const finalStatus = await pollDataCheckUntilComplete();
      await refreshEarlySteps();
      setPageMessage(
        finalStatus.status === "failed"
          ? "Data check finished with issues. Review the guidance before continuing."
          : "Data check complete. Readiness and label guidance have been refreshed.",
      );
    } catch (error) {
      const message = getErrorMessage(error, "Unable to run data check.");
      setError(activeStepId === "labels" ? "labels" : "step1", message);
      setPageMessage(message);
    } finally {
      setLoadingFlag("dataCheck", false);
    }
  };

  const handleStartSetup = async () => {
    if (!sessionId) {
      setError("step1", "Fine-tuning session is not loaded yet.");
      return;
    }
    setLoadingFlag("startSetup", true);
    setError("step1", "");
    try {
      const payload = await startSetup(sessionId);
      setCurrentStep(payload.current_step ?? 2);
      setActiveStepId("data");
      await loadDatasetsState({ silent: true });
      setPageMessage(
        step1Data?.selected_dataset_id
          ? "Resuming setup. Review or change the selected dataset in Step 2."
          : "Review the safe path, then choose or register the dataset for this tuning run.",
      );
    } catch (error) {
      setError("step1", getErrorMessage(error, "Unable to start setup."));
    } finally {
      setLoadingFlag("startSetup", false);
    }
  };

  const handleStartNewSetup = async () => {
    if (!sessionId) {
      setError("step1", "Fine-tuning session is not loaded yet.");
      return;
    }
    setLoadingFlag("startNewSetup", true);
    setError("step1", "");
    try {
      await startNewSetup(sessionId);
      setDatasetDetail(null);
      setLabelState(null);
      setDatasetReadyPayload(null);
      setDataCheckStatus(null);
      await loadStepOneState({ silent: true });
      await loadDatasetsState({ silent: true, repairBackendSelection: false });
      setActiveStepId("start");
      setCurrentStep(1);
      setPageMessage("Started a fresh setup for this session. No dataset is selected until you choose one in Step 2.");
    } catch (error) {
      setError("step1", getErrorMessage(error, "Unable to start a new setup."));
    } finally {
      setLoadingFlag("startNewSetup", false);
    }
  };

  const handleDatasetSelect = async (datasetId) => {
    if (!sessionId) {
      setError("datasets", "Fine-tuning session is not loaded yet.");
      return;
    }
    setLoadingFlag("selectDataset", true);
    setError("datasets", "");
    try {
      const payload = await selectDataset(sessionId, datasetId);
      const selectedId = payload.selected_dataset?.dataset_id ?? datasetId;
      const refreshed = await loadDatasetsState({ silent: true, repairBackendSelection: true });
      const detailId = refreshed?.selectedDatasetId ?? selectedId;
      if (detailId) await loadDatasetDetailState(detailId, { silent: true });
      setDatasetReadyPayload(null);
      setPageMessage("Dataset selected for this fine-tuning session.");
    } catch (error) {
      setError("datasets", getErrorMessage(error, "Unable to select dataset."));
    } finally {
      setLoadingFlag("selectDataset", false);
    }
  };

  const handleDatasetRegister = async () => {
    if (!sessionId) {
      setError("datasets", "Fine-tuning session is not loaded yet.");
      return;
    }
    setLoadingFlag("registerDataset", true);
    setError("datasets", "");
    try {
      const payload = await registerDataset(sessionId, { ...registerForm, auto_select: false });
      const createdDataset = payload.dataset;
      const createdDatasetWithValidation = createdDataset ? { ...createdDataset, validation: payload.validation } : null;
      const createdDatasetId = createdDataset?.dataset_id;
      const createdDatasetIsValid = createdDatasetWithValidation ? !isDatasetInvalid(createdDatasetWithValidation) : false;

      let selectedAfterRegister = null;
      if (createdDatasetId && createdDatasetIsValid) {
        const selectedPayload = await selectDataset(sessionId, createdDatasetId);
        selectedAfterRegister = selectedPayload.selected_dataset?.dataset_id ?? createdDatasetId;
      }

      const refreshed = await loadDatasetsState({ silent: true, repairBackendSelection: true });
      const detailId = refreshed?.selectedDatasetId ?? selectedAfterRegister;
      if (detailId) await loadDatasetDetailState(detailId, { silent: true });
      setFormState((current) => ({ ...current, datasetSource: "existing" }));
      setDatasetReadyPayload(null);
      const warning = payload.validation?.warnings?.[0];
      setPageMessage(
        createdDatasetIsValid
          ? warning
            ? `Dataset registered and selected. Note: ${warning}`
            : "Dataset registered and selected."
          : warning
            ? `Dataset registered but not selected. Note: ${warning}`
            : "Dataset registered but not selected because it has no supported files.",
      );
    } catch (error) {
      setError("datasets", getErrorMessage(error, "Unable to register MinIO dataset."));
    } finally {
      setLoadingFlag("registerDataset", false);
    }
  };

  const handleDatasetDeleteRequest = (dataset) => {
    void (async () => {
      if (!sessionId) {
        setError("datasets", "Fine-tuning session is not loaded yet.");
        return;
      }
      const datasetId = Number(dataset?.id ?? dataset?.dataset_id ?? dataset?.raw?.dataset_id ?? dataset?.raw?.id);
      if (!Number.isFinite(datasetId)) {
        setError("datasets", "Dataset id is missing.");
        return;
      }
      setLoadingFlag("deleteDataset", true);
      setError("datasets", "");
      try {
        const payload = await deleteDataset(sessionId, datasetId);
        const selectedId = payload?.selected_dataset_id ? String(payload.selected_dataset_id) : "";
        await loadDatasetsState({ silent: true, repairBackendSelection: false });
        if (selectedId) {
          await loadDatasetDetailState(selectedId, { silent: true });
          if (activeStepId === "labels") {
            await loadLabelStateFromBackend({ silent: true });
          }
        } else {
          setDatasetDetail(null);
          setLabelState(null);
          setFormState((current) => ({ ...current, selectedDatasetId: "" }));
        }
        setDatasetReadyPayload(null);
        setPageMessage(`${dataset?.name ?? "Dataset"} was removed from the fine-tuning list. MinIO files were not deleted.`);
      } catch (error) {
        setError("datasets", getErrorMessage(error, "Unable to remove dataset."));
      } finally {
        setLoadingFlag("deleteDataset", false);
      }
    })();
  };

  const handleRefreshDatasets = async () => {
    if (!sessionId) {
      setError("datasets", "Fine-tuning session is not loaded yet.");
      return;
    }
    setLoadingFlag("refreshDatasets", true);
    setError("datasets", "");
    try {
      const refreshed = await loadDatasetsState({ silent: true, repairBackendSelection: true });
      const detailId = refreshed?.selectedDatasetId ?? formState.selectedDatasetId;
      if (detailId) await loadDatasetDetailState(detailId, { silent: true });
      await loadStepOneState({ silent: true });
      setPageMessage("Dataset list refreshed from the latest audit results.");
    } catch (error) {
      setError("datasets", getErrorMessage(error, "Unable to refresh datasets."));
    } finally {
      setLoadingFlag("refreshDatasets", false);
    }
  };

  const handleLabelReadinessChange = async (value) => {
    if (!sessionId) {
      setError("labels", "Fine-tuning session is not loaded yet.");
      return;
    }
    const labelStatus = readinessToLabelStatus(value);
    setLoadingFlag("labelStatus", true);
    setError("labels", "");
    try {
      const payload = await updateLabelStatus(sessionId, labelStatus);
      setLabelState(payload);
      setDatasetReadyPayload(null);
      setFormState((current) => ({
        ...current,
        labelReadiness: labelStatusToReadiness(payload.current_label_status),
        labelingMode: labelStatusToMode(payload.current_label_status),
      }));
      await loadDatasetsState({ silent: true });
      setPageMessage(payload.guidance_message);
    } catch (error) {
      setError("labels", getErrorMessage(error, "Unable to update label status."));
    } finally {
      setLoadingFlag("labelStatus", false);
    }
  };

  const handleLabelImport = async (file) => {
    if (!sessionId) {
      setError("labels", "Fine-tuning session is not loaded yet.");
      return null;
    }
    if (!file) {
      setError("labels", "Choose a YOLO label zip before importing.");
      return null;
    }
    setLoadingFlag("labelImport", true);
    setError("labels", "");
    try {
      const payload = await importLabelExport(sessionId, file);
      setLabelState(payload.label_state ?? null);
      setDatasetReadyPayload(null);
      const refreshed = await loadDatasetsState({ silent: true, repairBackendSelection: true });
      const detailId = refreshed?.selectedDatasetId ?? formState.selectedDatasetId;
      if (detailId) await loadDatasetDetailState(detailId, { silent: true });
      await loadLabelStateFromBackend({ silent: true });
      setPageMessage(
        payload.label_status === "ready"
          ? "Imported labels validated. Label readiness has been refreshed."
          : "Imported labels validated with partial coverage. Continue labeling or review warnings.",
      );
      return payload;
    } catch (error) {
      const message = getErrorMessage(error, "Unable to import labels.");
      setError("labels", message);
      setPageMessage(message);
      return null;
    } finally {
      setLoadingFlag("labelImport", false);
    }
  };

  const handlePrepareDatasetReadyPayload = async () => {
    if (!sessionId) {
      setError("labels", "Fine-tuning session is not loaded yet.");
      return;
    }
    setLoadingFlag("handoff", true);
    setError("labels", "");
    try {
      const payload = await prepareDatasetReadyPayload(sessionId);
      setDatasetReadyPayload(payload);
      if (payload.status === "ready_for_training") {
        setPageMessage("Dataset handoff prepared. Step 4 can consume this payload when training setup is implemented.");
        goNext();
        return;
      }
      if (payload.status === "blocked" || payload.status === "needs_labeling") {
        setPageMessage("Dataset handoff is blocked because labels are missing or invalid. Add labels before training setup.");
        return;
      }
      setPageMessage("Dataset handoff was prepared with warnings. Review label coverage before training setup.");
    } catch (error) {
      setError("labels", getErrorMessage(error, "Unable to prepare dataset handoff."));
    } finally {
      setLoadingFlag("handoff", false);
    }
  };

  const handleTrainingJobSync = (jobData) => {
    if (!jobData?.id && !jobData?.training_job_id && !jobData?.status) return;

    const nextJobId = jobData?.id ?? jobData?.training_job_id ?? trainingJobId;

    if (nextJobId) {
      setTrainingJobId(nextJobId);
    }

    setMockState((current) => ({
      ...current,
      trainingJob: {
        ...current.trainingJob,
        id: nextJobId || current.trainingJob.id,
        ...getTrainingJobUiPatch(
          jobData?.status ?? current.trainingJob.status ?? "queued",
          jobData?.output_model_path ?? current.trainingJob.output_model_path ?? "",
        ),
      },
    }));
  };

  const handleCreateTrainingPlan = async () => {
    const runDepthPayload = RUN_DEPTH_PAYLOAD_MAP[formState.trainingModeId] ?? RUN_DEPTH_PAYLOAD_MAP.balanced;
    const mappedModel = MODEL_PAYLOAD_MAP[formState.baseModelId] ?? "current_model";
    const payload = {
      use_case_id: activeUseCase.id,
      base_model: mappedModel,
      run_depth: runDepthPayload.run_depth,
      epochs: runDepthPayload.epochs,
      batch_size: runDepthPayload.batch_size,
      img_size: runDepthPayload.img_size,
    };

    try {
      setTrainingPlanLoading(true);
      setPageError("");
      setPageMessage("");

      const response = await fetch(`${API_BASE_URL}/api/fine-tuning/${currentSessionId}/training-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.detail || "Failed to create training plan");
      }

      setTrainingJobId(data.training_job_id);
      setMockState((current) => ({
        ...current,
        trainingJob: {
          ...current.trainingJob,
          id: data.training_job_id,
          status: data.status ?? "queued",
          current_stage: "Training plan created",
          eta: "Ready for Step 5",
          next_up: "Training plan is ready. Step 5 can now start the training run when you choose.",
          plain_english_status:
            "Your training plan is saved. The model has not started training yet, so production remains unchanged.",
          activity_feed: [
            {
              id: `${data.training_job_id}-created`,
              time: "Just now",
              title: "Training plan created",
              detail: `Saved backend job ${data.training_job_id} using the selected starting model and run depth.`,
            },
            ...current.trainingJob.activity_feed,
          ],
        },
      }));
      setPageMessage(`Training plan created successfully. Job ${data.training_job_id} is ready for Step 5.`);
      setActiveStepId("training");
    } catch (error) {
      console.error(error);
      setPageError(error instanceof Error ? error.message : "Failed to create training plan");
    } finally {
      setTrainingPlanLoading(false);
    }
  };

  const handlePrimaryNext = async () => {
    if (activeStepId === "start") {
      await handleStartSetup();
      return;
    }
    if (activeStepId === "data") {
      if (!formState.selectedDatasetId) {
        setError("datasets", "Select or register a dataset before continuing.");
        return;
      }
      if (selectedDataset?.isInvalid) {
        setError("datasets", "The selected dataset has no supported files. Choose a valid dataset or correct the MinIO prefix before continuing.");
        return;
      }
      goNext();
      return;
    }
    if (activeStepId === "labels") {
      await handlePrepareDatasetReadyPayload();
      return;
    }
    if (activeStepId === "plan") {
      await handleCreateTrainingPlan();
      return;
    }
    goNext();
  };

  const getNextLabel = () => {
    if (activeStepId === "start") return step1Data?.selected_dataset_id ? "Continue" : "Choose data";
    if (activeStepId === "labels") return loading.handoff ? "Preparing..." : "Prepare handoff";
    if (activeStepId === "plan") return "Start training";
    if (activeStepId === "training") return "Show results";
    if (activeStepId === "compare") return "Go live safely";
    if (activeStepId === "rollout") return "Finish";
    return "Continue";
  };

  const primaryActionDisabled = Boolean(loading.startSetup || loading.startNewSetup || loading.handoff);

  const renderActiveStep = () => {
    if (activeStepId === "start") {
      return (
        <GetStartedStep
          activeUseCase={activeUseCase}
          config={config}
          datasetHealth={datasetHealth}
          isCheckingData={Boolean(loading.dataCheck)}
          isStartingNewSetup={Boolean(loading.startNewSetup)}
          isStartingSetup={Boolean(loading.startSetup)}
          selectedBaseModel={selectedBaseModel}
          stepOneDatasetState={stepOneDatasetState}
          step1Data={step1Data}
          stepError={errors.step1}
          stepLoading={Boolean(loading.step1)}
          trainingJob={trainingJob}
          onAuditDataset={handleAuditDataset}
          onNext={handleStartSetup}
          onStartNewSetup={handleStartNewSetup}
        />
      );
    }

    if (activeStepId === "data") {
      return (
        <DataStep
          actionLoading={Boolean(loading.registerDataset || loading.selectDataset || loading.refreshDatasets || loading.deleteDataset)}
          datasetHealth={datasetHealth}
          datasetSource={formState.datasetSource}
          datasets={mappedDatasets}
          error={errors.datasets || errors.datasetDetail}
          loading={Boolean(loading.datasets)}
          registerForm={registerForm}
          selectedDataset={selectedDataset}
          selectedDatasetDetail={datasetDetail}
          selectedDatasetId={formState.selectedDatasetId}
          supportedFormats={config.supportedFormats}
          onDatasetRegister={handleDatasetRegister}
          onDatasetDeleteRequest={handleDatasetDeleteRequest}
          onRefreshDatasets={handleRefreshDatasets}
          onDatasetSelect={handleDatasetSelect}
          onDatasetSourceChange={(value) => updateFormField("datasetSource", value)}
          onRegisterFormChange={updateRegisterFormField}
        />
      );
    }

    if (activeStepId === "labels") {
      return (
        <LabelsStep
          actionLoading={Boolean(loading.labelStatus || loading.dataCheck || loading.handoff || loading.labelImport || loading.annotationWorkspace || loading.manualAnnotation || loading.autoLabel || loading.assistLabel)}
          annotationEditorHref={annotationEditorHref}
          datasetHealth={datasetHealth}
          datasetReadyPayload={datasetReadyPayload}
          error={errors.labels}
          labelReadiness={formState.labelReadiness}
          labelState={labelState}
          labelingMode={formState.labelingMode}
          loading={Boolean(loading.labels)}
          selectedDataset={selectedDataset}
          selectedDatasetDetail={datasetDetail}
          supportedFormats={config.supportedFormats}
          onAuditDataset={handleAuditDataset}
          onLabelImport={handleLabelImport}
          onLabelReadinessChange={handleLabelReadinessChange}
          onLabelingModeChange={(value) => updateFormField("labelingMode", value)}
        />
      );
    }

    if (activeStepId === "plan") {
      return (
        <TrainingPlanStep
          activeUseCase={activeUseCase}
          advancedOpen={advancedOpen}
          advancedSettings={formState.advancedSettings}
          baseModels={config.baseModels}
          config={config}
          currentModel={mockState.deployment.current_model}
          extensionSettings={formState.extensionSettings}
          sceneOpen={sceneOpen}
          selectedBaseModelId={formState.baseModelId}
          selectedStopConditionId={formState.stopConditionId}
          selectedTrainingModeId={formState.trainingModeId}
          stopConditionOptions={stopConditionOptions}
          trainingModeOptions={trainingModeOptions}
          onAdvancedSettingChange={updateAdvancedSetting}
          onBaseModelChange={(value) => updateFormField("baseModelId", value)}
          onExtensionSettingChange={updateExtensionSetting}
          onStopConditionChange={(value) => updateFormField("stopConditionId", value)}
          onToggleAdvanced={() => setAdvancedOpen((current) => !current)}
          onToggleScene={() => setSceneOpen((current) => !current)}
          onTrainingModeChange={(value) => updateFormField("trainingModeId", value)}
        />
      );
    }

    if (activeStepId === "training") {
      return <WatchTrainingStep trainingJob={mockState.trainingJob} onTrainingJobSync={handleTrainingJobSync} />;
    }

    if (activeStepId === "compare") {
      return (
        <CompareResultsStep
          activeUseCase={activeUseCase}
          currentModel={mockState.deployment.current_model}
          trainingJobId={trainingJobId}
          selectedTrainingMode={selectedTrainingMode}
          trainingJob={mockState.trainingJob}
        />
      );
    }

    return (
      <RolloutStep
        activeUseCase={activeUseCase}
        currentModel={mockState.deployment.current_model}
        trainingJob={mockState.trainingJob}
        trainingJobId={trainingJobId}
        selectedTrainingMode={selectedTrainingMode}
      />
    );
  };

  return (
    <div className="pb-10">
      <div className="mb-5 rounded-[28px] border border-slate-200 bg-gradient-to-br from-[#F8F9FF] via-white to-[#FFF6F8] p-5 shadow-panel">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="normal">Fine-Tuning</Badge>
              <span className="rounded-full border border-white bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-sm">
                {activeUseCase.title}
              </span>
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{config.heroTitle}</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              A guided setup for adapting the current model with your own examples. Choose data, confirm labels, train, compare, then roll out only when ready.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[440px] lg:max-w-[560px]">
            <div className="rounded-2xl border border-white bg-white/90 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Data</div>
              <div className="mt-1 truncate text-sm font-semibold text-slate-900">{selectedDataset?.name ?? "Choose data"}</div>
              {selectedDataset ? <div className="mt-1 truncate text-xs font-semibold text-slate-500">{selectedDataset.label_display}</div> : null}
            </div>
            <div className="rounded-2xl border border-white bg-white/90 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Run depth</div>
              <div className="mt-1 truncate text-sm font-semibold text-slate-900">{selectedTrainingMode?.label ?? "Recommended"}</div>
            </div>
            <div className="rounded-2xl border border-white bg-white/90 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Status</div>
              <div className="mt-1 truncate text-sm font-semibold text-slate-900">{trainingJob.current_stage}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[285px_minmax(0,1fr)]">
        <FineTuningStepRail
          activeStepId={activeStepId}
          completedStepIds={completedStepIds}
          selectedBaseModel={selectedBaseModel}
          currentPlanState={currentPlanState}
          selectedBaseModel={selectedBaseModel}
          selectedDataset={selectedDataset}
          selectedTrainingMode={selectedTrainingMode}
          steps={steps}
          trainingJob={trainingJob}
          onStepSelect={goToStep}
        />

        <main className="min-w-0">
          {isDeprecatedCountingUseCase ? (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              <span className="font-semibold">Class-wise counting is now included in Vehicle Analytics.</span>{" "}
              This legacy fine-tuning flow still works if you opened it directly, but the primary product path now lives under Speed Estimation / Vehicle Analytics.
            </div>
          ) : null}
          {pageMessage ? (
            <div className="mb-4 rounded-2xl border border-brandBlue/15 bg-brandBlue/[0.04] px-4 py-3 text-sm leading-6 text-slate-700">
              {pageMessage}
            </div>
          ) : null}
          {pageError ? (
            <div className="mb-4 rounded-2xl border border-brandRed/20 bg-brandRed/[0.05] px-4 py-3 text-sm leading-6 text-brandRed">
              {pageError}
            </div>
          ) : null}
          {trainingJobId ? (
            <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
              Training job ID: <span className="font-semibold text-slate-900">{trainingJobId}</span>
            </div>
          ) : null}

          {renderActiveStep()}

          <div className="mt-5 flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-panel sm:flex-row sm:items-center sm:justify-between">
            <Button disabled={activeStepIndex === 0} onClick={goBack} type="button" variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div className="text-center text-sm text-slate-500">
              Step {activeStepIndex + 1} of {steps.length}: <span className="font-semibold text-slate-800">{steps[activeStepIndex]?.label}</span>
              <span className="ml-2 text-xs text-slate-400">(backend step {currentStep})</span>
            </div>
            {activeStepId === "rollout" ? (
              <Button onClick={() => setPageMessage("Fine-tuning setup saved in the UI preview. Existing app behavior remains unchanged.")} type="button">
                Finish
              </Button>
            ) : (
              <Button disabled={primaryActionDisabled || trainingPlanLoading} onClick={handlePrimaryNext} type="button">
                {activeStepId === "plan" ? <PlayCircle className="mr-2 h-4 w-4" /> : null}
                {activeStepId === "plan" && trainingPlanLoading ? "Creating training plan..." : getNextLabel()}
                {activeStepId !== "plan" ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
              </Button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
