"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, PlayCircle } from "lucide-react";

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

export default function FineTuning({ activeUseCase }) {
  const [mockState, setMockState] = useState(() => buildMockFineTuningState(activeUseCase));
  const [formState, setFormState] = useState(() => getInitialFormState(activeUseCase));
  const [activeStepId, setActiveStepId] = useState("start");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(false);
  const [pageMessage, setPageMessage] = useState("");

  const config = getFineTuningConfig(activeUseCase);
  const selectedDataset =
    mockState.datasets.find((dataset) => dataset.id === formState.selectedDatasetId) ?? mockState.datasets[0] ?? null;
  const selectedCandidate =
    mockState.evaluation.candidate_models.find((candidate) => candidate.id === formState.selectedCandidateId) ??
    mockState.evaluation.candidate_models[0] ??
    null;
  const selectedBaseModel =
    config.baseModels.find((model) => model.value === formState.baseModelId) ?? config.baseModels[0] ?? null;
  const selectedGoal = goalOptions.find((goal) => goal.value === formState.goalId) ?? goalOptions[0];
  const selectedTrainingMode =
    trainingModeOptions.find((mode) => mode.value === formState.trainingModeId) ?? trainingModeOptions[0];

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

  useEffect(() => {
    setMockState(buildMockFineTuningState(activeUseCase));
    setFormState(getInitialFormState(activeUseCase));
    setActiveStepId("start");
    setAdvancedOpen(false);
    setSceneOpen(false);
    setPageMessage("");
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

  const handleAdvanceTraining = () => {
    setMockState((current) => advanceMockTraining(current));
    setPageMessage("Moved the mock training run forward one stage. Backend progress can replace this local action later.");
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
    if (activeStepId === "plan") {
      handleAdvanceTraining();
      setActiveStepId("training");
      return;
    }
    goNext();
  };

  const getNextLabel = () => {
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
              <div className="mt-1 truncate text-sm font-semibold text-slate-900">{mockState.trainingJob.current_stage}</div>
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
          trainingJob={mockState.trainingJob}
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
            </div>
            {activeStepId === "rollout" ? (
              <Button onClick={() => setPageMessage("Fine-tuning setup saved in the UI preview. Existing app behavior remains unchanged.")} type="button">
                Finish
              </Button>
            ) : (
              <Button onClick={handlePrimaryNext} type="button">
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
