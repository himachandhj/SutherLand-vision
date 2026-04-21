"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, PlayCircle } from "lucide-react";

import { getIntegrationDefaults } from "./visionLabConfig";
import {
  DEFAULT_ADVANCED_SETTINGS,
  getFineTuningConfig,
  goalOptions,
  stopConditionOptions,
  trainingModeOptions,
} from "./fine-tuning/useCaseFineTuningConfig";
import {
  advanceMockTraining,
  buildMockFineTuningState,
  promoteMockCandidate,
} from "./fine-tuning/mockFineTuningData";
import {
  loadDataCheckStatus,
  loadDatasetDetail,
  loadDatasets,
  loadLabelState,
  loadStepOne,
  prepareDatasetReadyPayload,
  registerDataset,
  runDataCheck,
  selectDataset,
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

  return (
    fileCount === 0 &&
    (prefixValidationFailed ||
      dataset?.audit_status === "not_run" ||
      dataset?.label_status === "unknown" ||
      dataset?.label_status === undefined)
  );
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

const sleep = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export default function FineTuning({ activeUseCase }) {
  const [mockState, setMockState] = useState(() => buildMockFineTuningState(activeUseCase));
  const [formState, setFormState] = useState(() => getInitialFormState(activeUseCase));
  const [registerForm, setRegisterForm] = useState(() => getInitialRegisterForm(activeUseCase));
  const [activeStepId, setActiveStepId] = useState("start");
  const [currentStep, setCurrentStep] = useState(1);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(false);
  const [pageMessage, setPageMessage] = useState("");

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
  const mappedDatasets = useMemo(() => sortDatasetsForStep(datasets).map(mapDatasetFromApi), [datasets]);
  const selectedDataset = useMemo(
    () => mappedDatasets.find((dataset) => dataset.id === String(formState.selectedDatasetId)) ?? null,
    [formState.selectedDatasetId, mappedDatasets],
  );
  const selectedCandidate =
    mockState.evaluation.candidate_models.find((candidate) => candidate.id === formState.selectedCandidateId) ??
    mockState.evaluation.candidate_models[0] ??
    null;
  const selectedBaseModel =
    config.baseModels.find((model) => model.value === formState.baseModelId) ?? config.baseModels[0] ?? null;
  const selectedGoal = goalOptions.find((goal) => goal.value === formState.goalId) ?? goalOptions[0];
  const selectedTrainingMode =
    trainingModeOptions.find((mode) => mode.value === formState.trainingModeId) ?? trainingModeOptions[0];
  const datasetHealth = useMemo(
    () => buildDatasetHealth(step1Data, dataCheckStatus, labelState, selectedDataset),
    [step1Data, dataCheckStatus, labelState, selectedDataset],
  );
  const trainingJob = useMemo(() => buildTrainingJob(mockState.trainingJob, step1Data, dataCheckStatus), [mockState.trainingJob, step1Data, dataCheckStatus]);

  const steps = useMemo(
    () => [
      { id: "start", label: "Get started", helper: "Understand the safe path" },
      { id: "data", label: "Your data", helper: "Choose examples" },
      { id: "labels", label: "Labels", helper: "Say if labels are ready" },
      { id: "plan", label: "Training plan", helper: "Pick model and goal" },
      { id: "training", label: "Watch training", helper: "Track progress" },
      { id: "compare", label: "Compare results", helper: "Choose the best version" },
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
        const datasetId = payload?.summary_cards?.data_readiness?.dataset?.id;
        setStep1Data(payload);
        setSessionId(payload.session_id);
        setCurrentStep(1);
        if (datasetId) {
          setFormState((current) => ({ ...current, selectedDatasetId: String(datasetId) }));
        }
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
        let selected = chooseDatasetForStep(list);
        let selectedId = getDatasetApiId(selected);
        const backendSelectedId =
          payload.selected_dataset_id !== undefined && payload.selected_dataset_id !== null
            ? String(payload.selected_dataset_id)
            : getDatasetApiId(list.find((dataset) => dataset?.is_selected === true));

        if (repairBackendSelection && selectedId && selectedId !== backendSelectedId && !isDatasetInvalid(selected)) {
          await selectDataset(sessionId, selectedId);
          payload = await loadDatasets(sessionId);
          list = Array.isArray(payload.datasets) ? payload.datasets : list;
          selected = chooseDatasetForStep(list);
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
      setPageMessage("Setup started. Choose or register the dataset for this tuning run.");
    } catch (error) {
      setError("step1", getErrorMessage(error, "Unable to start setup."));
    } finally {
      setLoadingFlag("startSetup", false);
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
      setPageMessage(
        payload.status === "needs_labeling"
          ? "Dataset handoff says labels are missing. Add labels before training setup."
          : "Dataset handoff says labels need review before training setup.",
      );
    } catch (error) {
      setError("labels", getErrorMessage(error, "Unable to prepare dataset handoff."));
    } finally {
      setLoadingFlag("handoff", false);
    }
  };

  const handleAdvanceTraining = () => {
    setMockState((current) => advanceMockTraining(current));
    setPageMessage("Moved the placeholder training run forward one stage. Step 4+ backend is not connected yet.");
  };

  const handlePromotionAction = (action) => {
    if (!selectedCandidate) return;
    setMockState((current) => promoteMockCandidate(current, selectedCandidate.id, action));
    if (action === "candidate") {
      setPageMessage(`Saved ${selectedCandidate.name} as a candidate. The current live model stays untouched.`);
      return;
    }
    if (action === "keep-current") {
      setPageMessage("Kept the current live model in place. The new version stays available for more checking.");
      return;
    }
    setPageMessage(`Prepared ${selectedCandidate.name} for ${action}. This remains UI-only until backend deployment actions are connected.`);
  };

  const handlePrimaryNext = () => {
    if (activeStepId === "start") {
      void handleStartSetup();
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
      void handlePrepareDatasetReadyPayload();
      return;
    }
    if (activeStepId === "plan") {
      handleAdvanceTraining();
      setActiveStepId("training");
      return;
    }
    goNext();
  };

  const getNextLabel = () => {
    if (activeStepId === "start") return step1Data?.actions?.can_continue ? "Continue" : "Start setup";
    if (activeStepId === "labels") return loading.handoff ? "Preparing..." : "Prepare handoff";
    if (activeStepId === "plan") return "Start training";
    if (activeStepId === "training") return "Compare results";
    if (activeStepId === "compare") return "Go live safely";
    if (activeStepId === "rollout") return "Finish";
    return "Continue";
  };

  const renderActiveStep = () => {
    if (activeStepId === "start") {
      return (
        <GetStartedStep
          activeUseCase={activeUseCase}
          actionLoading={Boolean(loading.dataCheck || loading.startSetup)}
          config={config}
          datasetHealth={datasetHealth}
          selectedBaseModel={selectedBaseModel}
          step1Data={step1Data}
          stepError={errors.step1}
          stepLoading={Boolean(loading.step1)}
          trainingJob={trainingJob}
          onAuditDataset={handleAuditDataset}
          onNext={handleStartSetup}
        />
      );
    }

    if (activeStepId === "data") {
      return (
        <DataStep
          actionLoading={Boolean(loading.registerDataset || loading.selectDataset)}
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
          onDatasetSelect={handleDatasetSelect}
          onDatasetSourceChange={(value) => updateFormField("datasetSource", value)}
          onRegisterFormChange={updateRegisterFormField}
        />
      );
    }

    if (activeStepId === "labels") {
      return (
        <LabelsStep
          actionLoading={Boolean(loading.labelStatus || loading.dataCheck || loading.handoff)}
          datasetHealth={datasetHealth}
          datasetReadyPayload={datasetReadyPayload}
          error={errors.labels}
          labelReadiness={formState.labelReadiness}
          labelState={labelState}
          labelingMode={formState.labelingMode}
          loading={Boolean(loading.labels)}
          selectedDataset={selectedDataset}
          supportedFormats={config.supportedFormats}
          onAuditDataset={handleAuditDataset}
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
          goalOptions={goalOptions}
          sceneOpen={sceneOpen}
          selectedBaseModelId={formState.baseModelId}
          selectedGoalId={formState.goalId}
          selectedStopConditionId={formState.stopConditionId}
          selectedTrainingModeId={formState.trainingModeId}
          stopConditionOptions={stopConditionOptions}
          trainingModeOptions={trainingModeOptions}
          onAdvancedSettingChange={updateAdvancedSetting}
          onBaseModelChange={(value) => updateFormField("baseModelId", value)}
          onExtensionSettingChange={updateExtensionSetting}
          onGoalChange={(value) => updateFormField("goalId", value)}
          onStopConditionChange={(value) => updateFormField("stopConditionId", value)}
          onToggleAdvanced={() => setAdvancedOpen((current) => !current)}
          onToggleScene={() => setSceneOpen((current) => !current)}
          onTrainingModeChange={(value) => updateFormField("trainingModeId", value)}
        />
      );
    }

    if (activeStepId === "training") {
      return <WatchTrainingStep trainingJob={mockState.trainingJob} onAdvanceTraining={handleAdvanceTraining} />;
    }

    if (activeStepId === "compare") {
      return (
        <CompareResultsStep
          activeUseCase={activeUseCase}
          currentModel={mockState.deployment.current_model}
          evaluation={mockState.evaluation}
          selectedCandidate={selectedCandidate}
          selectedCandidateId={formState.selectedCandidateId}
          onCandidateSelect={(value) => updateFormField("selectedCandidateId", value)}
        />
      );
    }

    return (
      <RolloutStep
        currentModel={mockState.deployment.current_model}
        deploymentState={mockState.deployment}
        selectedCandidate={selectedCandidate}
        onAction={handlePromotionAction}
      />
    );
  };

  return (
    <div className="pb-10">
      <div className="mb-5 rounded-[28px] border border-slate-200 bg-gradient-to-br from-[#F8F9FF] via-white to-[#FFF6F8] p-5 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
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
          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[440px]">
            <div className="rounded-2xl border border-white bg-white/90 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Data</div>
              <div className="mt-1 truncate text-sm font-semibold text-slate-900">{selectedDataset?.name ?? "Choose data"}</div>
            </div>
            <div className="rounded-2xl border border-white bg-white/90 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Goal</div>
              <div className="mt-1 truncate text-sm font-semibold text-slate-900">{selectedGoal?.label ?? "Balanced"}</div>
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
          selectedDataset={selectedDataset}
          selectedGoal={selectedGoal}
          selectedTrainingMode={selectedTrainingMode}
          steps={steps}
          trainingJob={trainingJob}
          onStepSelect={goToStep}
        />

        <main className="min-w-0">
          {pageMessage ? (
            <div className="mb-4 rounded-2xl border border-brandBlue/15 bg-brandBlue/[0.04] px-4 py-3 text-sm leading-6 text-slate-700">
              {pageMessage}
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
              <Button disabled={Boolean(loading.startSetup || loading.handoff)} onClick={handlePrimaryNext} type="button">
                {activeStepId === "plan" ? <PlayCircle className="mr-2 h-4 w-4" /> : null}
                {getNextLabel()}
                {activeStepId !== "plan" ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
              </Button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
