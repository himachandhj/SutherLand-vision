"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, PlayCircle } from "lucide-react";

import { API_BASE_URL } from "./visionLabConfig";
import {
  DEFAULT_ADVANCED_SETTINGS,
  getFineTuningConfig,
  goalOptions,
  stopConditionOptions,
  trainingModeOptions,
} from "./fine-tuning/useCaseFineTuningConfig";
import {
  buildMockFineTuningState,
  runDatasetAudit,
} from "./fine-tuning/mockFineTuningData";
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
    selectedDatasetId: `${useCase.id}-dataset-live`,
    labelReadiness: "yes",
    labelingMode: "already-labeled",
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

export default function FineTuning({ activeUseCase }) {
  const [mockState, setMockState] = useState(() => buildMockFineTuningState(activeUseCase));
  const [formState, setFormState] = useState(() => getInitialFormState(activeUseCase));
  const [activeStepId, setActiveStepId] = useState("start");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(false);
  const [pageMessage, setPageMessage] = useState("");
  const [pageError, setPageError] = useState("");
  const [trainingPlanLoading, setTrainingPlanLoading] = useState(false);
  const [trainingJobId, setTrainingJobId] = useState("");

  const config = getFineTuningConfig(activeUseCase);
  const selectedDataset =
    mockState.datasets.find((dataset) => dataset.id === formState.selectedDatasetId) ?? mockState.datasets[0] ?? null;
  const selectedBaseModel =
    config.baseModels.find((model) => model.value === formState.baseModelId) ?? config.baseModels[0] ?? null;
  const selectedTrainingMode =
    trainingModeOptions.find((mode) => mode.value === formState.trainingModeId) ?? trainingModeOptions[0];
  const currentSessionId =
    mockState.sessionId ??
    selectedDataset?.session_id ??
    selectedDataset?.sessionId ??
    `${activeUseCase.id}-session-1`;

  const steps = useMemo(
    () => [
      { id: "start", label: "Get started", helper: "Understand the safe path" },
      { id: "data", label: "Your data", helper: "Choose examples" },
      { id: "labels", label: "Labels", helper: "Say if labels are ready" },
      { id: "plan", label: "Training plan", helper: "Pick model and run" },
      { id: "training", label: "Watch training", helper: "Track progress" },
      { id: "compare", label: "Show results", helper: "Review training artifacts and model details" },
      { id: "rollout", label: "Go live safely", helper: "Save, stage, or keep current" },
    ],
    [],
  );

  const activeStepIndex = Math.max(steps.findIndex((step) => step.id === activeStepId), 0);
  const completedStepIds = steps.slice(0, activeStepIndex).map((step) => step.id);

  useEffect(() => {
    setMockState(buildMockFineTuningState(activeUseCase));
    setFormState(getInitialFormState(activeUseCase));
    setActiveStepId("start");
    setAdvancedOpen(false);
    setSceneOpen(false);
    setPageMessage("");
    setPageError("");
    setTrainingPlanLoading(false);
    setTrainingJobId("");
  }, [activeUseCase.id]);

  const updateFormField = (field, value) => {
    setFormState((current) => ({ ...current, [field]: value }));
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
  };

  const goNext = () => {
    const nextStep = steps[activeStepIndex + 1];
    if (nextStep) setActiveStepId(nextStep.id);
  };

  const goBack = () => {
    const previousStep = steps[activeStepIndex - 1];
    if (previousStep) setActiveStepId(previousStep.id);
  };

  const handleDatasetSelect = (datasetId) => {
    const dataset = mockState.datasets.find((item) => item.id === datasetId);
    setFormState((current) => ({
      ...current,
      selectedDatasetId: datasetId,
      labelReadiness: dataset?.labeled ? "yes" : "no",
      labelingMode: dataset?.labeled ? "already-labeled" : "label-later",
    }));
  };

  const handleDatasetUpload = (file) => {
    if (!file) return;
    const datasetId = `${activeUseCase.id}-dataset-upload`;
    const labeled = formState.labelReadiness === "yes";
    const uploadedDataset = {
      id: datasetId,
      name: file.name,
      source: "uploaded-now",
      format: file.name.endsWith(".zip") ? "ZIP archive" : "Folder bundle",
      item_count: "Pending scan",
      labeled,
      annotation_mode: labeled ? "already-labeled" : formState.labelingMode,
      status: "uploading",
      updated_at: "Just now",
      note: "Pending setup. Future backend ingest can attach storage and data checks here.",
    };

    setMockState((current) => ({
      ...current,
      datasets: [uploadedDataset, ...current.datasets.filter((dataset) => dataset.id !== datasetId)],
      dataset: uploadedDataset,
      trainingJob: {
        ...current.trainingJob,
        status: "uploading",
        current_stage: "Uploading dataset",
        progress_percent: 8,
        elapsed: "00:01",
        eta: "Preparing check",
        next_up: "Confirm whether labels are ready, then run the data check.",
        plain_english_status: `Uploading ${file.name}. After upload, we check labels and prepare a clean training setup.`,
      },
    }));
    setFormState((current) => ({
      ...current,
      datasetSource: "upload",
      selectedDatasetId: datasetId,
    }));
    setPageMessage(`${file.name} was added to the fine-tuning workspace. No existing APIs or live model behavior changed.`);
  };

  const handleLabelReadinessChange = (value) => {
    setFormState((current) => ({
      ...current,
      labelReadiness: value,
      labelingMode: value === "yes" ? "already-labeled" : value === "no" ? "label-later" : current.labelingMode,
    }));
  };

  const handleAuditDataset = () => {
    setMockState((current) => runDatasetAudit(current));
    setPageMessage(`Data check complete for ${activeUseCase.title}. The UI is ready for future backend validation and cleanup responses.`);
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
    if (activeStepId === "plan") {
      await handleCreateTrainingPlan();
      return;
    }
    goNext();
  };

  const getNextLabel = () => {
    if (activeStepId === "plan") return "Start training";
    if (activeStepId === "training") return "Show results";
    if (activeStepId === "compare") return "Go live safely";
    if (activeStepId === "rollout") return "Finish";
    return "Continue";
  };

  const renderActiveStep = () => {
    if (activeStepId === "start") {
      return (
        <GetStartedStep
          activeUseCase={activeUseCase}
          config={config}
          datasetHealth={mockState.datasetHealth}
          selectedBaseModel={selectedBaseModel}
          trainingJob={mockState.trainingJob}
          onAuditDataset={handleAuditDataset}
          onNext={goNext}
        />
      );
    }

    if (activeStepId === "data") {
      return (
        <DataStep
          datasetHealth={mockState.datasetHealth}
          datasetSource={formState.datasetSource}
          datasets={mockState.datasets}
          selectedDataset={selectedDataset}
          selectedDatasetId={formState.selectedDatasetId}
          supportedFormats={config.supportedFormats}
          onDatasetSelect={handleDatasetSelect}
          onDatasetSourceChange={(value) => updateFormField("datasetSource", value)}
          onDatasetUpload={handleDatasetUpload}
        />
      );
    }

    if (activeStepId === "labels") {
      return (
        <LabelsStep
          datasetHealth={mockState.datasetHealth}
          labelReadiness={formState.labelReadiness}
          labelingMode={formState.labelingMode}
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
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Run depth</div>
              <div className="mt-1 truncate text-sm font-semibold text-slate-900">{selectedTrainingMode?.label ?? "Recommended"}</div>
            </div>
            <div className="rounded-2xl border border-white bg-white/90 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Status</div>
              <div className="mt-1 truncate text-sm font-semibold text-slate-900">{mockState.trainingJob.current_stage}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[285px_minmax(0,1fr)]">
        <FineTuningStepRail
          activeStepId={activeStepId}
          completedStepIds={completedStepIds}
          selectedBaseModel={selectedBaseModel}
          selectedDataset={selectedDataset}
          selectedTrainingMode={selectedTrainingMode}
          steps={steps}
          trainingJob={mockState.trainingJob}
          onStepSelect={goToStep}
        />

        <main className="min-w-0">
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
            </div>
            {activeStepId === "rollout" ? (
              <Button onClick={() => setPageMessage("Fine-tuning setup saved in the UI preview. Existing app behavior remains unchanged.")} type="button">
                Finish
              </Button>
            ) : (
              <Button disabled={trainingPlanLoading} onClick={handlePrimaryNext} type="button">
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
