"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  HelpCircle,
  Rocket,
  ShieldCheck,
  Tag,
  UploadCloud,
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

function ChoiceCard({ active, title, helper, icon: Icon, badge, onClick }) {
  return (
    <button
      className={`rounded-2xl border p-4 text-left transition ${
        active ? "border-brandRed bg-brandRed/5 shadow-sm" : "border-slate-200 bg-white hover:border-brandBlue/30 hover:bg-slate-50"
      }`}
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

export function GetStartedStep({ activeUseCase, config, datasetHealth, trainingJob, selectedBaseModel, onAuditDataset, onNext }) {
  return (
    <StepShell
      eyebrow="Step 1"
      helper="A short guided path for improving the current model with examples from your own site."
      title={`Tune ${activeUseCase.title} safely`}
      aside={
        <>
          <SmallCard helper={datasetHealth.readiness} title="Data readiness" tone="accent" value={`${datasetHealth.score}/100`} />
          <SmallCard helper="Current production stays unchanged until rollout." title="Safety" value="Protected" />
          <SmallCard helper="Recommended starting point." title="Starting model" value={selectedBaseModel?.label ?? "Recommended"} />
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <UploadCloud className="h-5 w-5 text-brandBlue" />
          <div className="mt-3 text-base font-semibold text-slate-900">Bring examples</div>
          <p className="mt-2 text-sm leading-6 text-slate-500">Use images or short videos from the place where the model will run.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <Tag className="h-5 w-5 text-brandBlue" />
          <div className="mt-3 text-base font-semibold text-slate-900">Check labels</div>
          <p className="mt-2 text-sm leading-6 text-slate-500">Tell us if labels are ready, missing, or not clear yet.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <ShieldCheck className="h-5 w-5 text-brandBlue" />
          <div className="mt-3 text-base font-semibold text-slate-900">Compare first</div>
          <p className="mt-2 text-sm leading-6 text-slate-500">Review the new version before replacing anything live.</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-brandBlue/15 bg-brandBlue/[0.04] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Recommended next action</div>
            <p className="mt-1 text-sm text-slate-600">{trainingJob.next_up}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={onAuditDataset} type="button" variant="outline">
              Run data check
            </Button>
            <Button onClick={onNext} type="button">
              Start setup
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <HelpBox title="What does fine-tuning mean?">
        It means starting with the current model and helping it learn your camera angles, lighting, and real examples. This screen is UI-only for now and is ready for backend hookup later.
      </HelpBox>
    </StepShell>
  );
}

export function DataStep({
  datasets,
  selectedDataset,
  selectedDatasetId,
  datasetSource,
  supportedFormats,
  datasetHealth,
  onDatasetSourceChange,
  onDatasetSelect,
  onDatasetUpload,
}) {
  const uploadInputRef = useRef(null);
  const sourceOptions = [
    { value: "upload", label: "Upload new files", helper: "Choose images, clips, or a ZIP from your site.", icon: UploadCloud },
    { value: "existing", label: "Use saved data", helper: "Reuse a dataset already stored in this platform.", icon: Database },
    { value: "external", label: "Import from another tool", helper: "Bring labels or exports from another labeling tool.", icon: Tag },
  ];

  return (
    <StepShell
      eyebrow="Step 2"
      helper="Choose where your examples come from. You can change this later."
      title="Your data"
      aside={
        <>
          <SmallCard helper={selectedDataset?.item_count ?? "No dataset selected"} title="Selected data" tone="accent" value={selectedDataset?.name ?? "Choose data"} />
          <SmallCard helper={datasetHealth.readiness} title="Readiness" value={`${datasetHealth.score}/100`} />
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
      <input
        ref={uploadInputRef}
        accept=".zip,.json,.yaml,.yml"
        className="hidden"
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onDatasetUpload(file);
          event.target.value = "";
        }}
      />

      <div className="grid gap-3 md:grid-cols-3">
        {sourceOptions.map((option) => (
          <ChoiceCard
            key={option.value}
            active={datasetSource === option.value}
            helper={option.helper}
            icon={option.icon}
            title={option.label}
            onClick={() => {
              onDatasetSourceChange(option.value);
              if (option.value === "upload") uploadInputRef.current?.click();
            }}
          />
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Saved data</div>
          <div className="mt-3 space-y-3">
            {datasets.map((dataset) => (
              <button
                key={dataset.id}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  selectedDatasetId === dataset.id ? "border-brandRed bg-white shadow-sm" : "border-slate-200 bg-white hover:border-brandBlue/30"
                }`}
                onClick={() => onDatasetSelect(dataset.id)}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-900">{dataset.name}</div>
                  <Badge tone={dataset.labeled ? "compliant" : "warning"}>{dataset.labeled ? "labeled" : "needs labels"}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-500">{dataset.item_count} · {dataset.format}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">What happens next</div>
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
    </StepShell>
  );
}

export function LabelsStep({
  labelReadiness,
  labelingMode,
  selectedDataset,
  supportedFormats,
  datasetHealth,
  onLabelReadinessChange,
  onLabelingModeChange,
  onAuditDataset,
}) {
  const labelOptions = [
    { value: "yes", label: "Yes, labels are ready", helper: "Use this if boxes or tags already exist.", badge: "Fastest" },
    { value: "no", label: "No, labels are needed", helper: "Prepare a labeling path before training.", badge: "Needs setup" },
    { value: "unsure", label: "Not sure yet", helper: "Run a check and decide after we inspect the files.", badge: "Check first" },
  ];
  const labelingPaths = [
    { value: "label-later", label: "Label inside platform later", helper: "Create a safe placeholder for a future labeling workflow." },
    { value: "import-external", label: "Import labels from another tool", helper: "Use exports from CVAT, Label Studio, or similar tools." },
    { value: "prepare-labeling", label: "Prepare for labeling", helper: "Keep the dataset ready for a labeling task before training." },
  ];

  return (
    <StepShell
      eyebrow="Step 3"
      helper="Tell us if your dataset has labels. The screen changes based on your answer."
      title="Are labels ready?"
      aside={
        <>
          <SmallCard helper={selectedDataset?.name ?? "Choose data first"} title="Dataset" value={selectedDataset?.labeled ? "Labeled" : "Needs labels"} />
          <SmallCard helper={datasetHealth.checks[0]?.detail} title="Label check" tone={labelReadiness === "yes" ? "accent" : "warn"} value={labelReadiness === "yes" ? "Ready" : "Needs review"} />
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-3">
        {labelOptions.map((option) => (
          <ChoiceCard
            key={option.value}
            active={labelReadiness === option.value}
            badge={option.badge}
            helper={option.helper}
            icon={Tag}
            title={option.label}
            onClick={() => onLabelReadinessChange(option.value)}
          />
        ))}
      </div>

      {labelReadiness === "yes" ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <div className="rounded-2xl border border-brandBlue/20 bg-brandBlue/[0.04] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CheckCircle2 className="h-4 w-4 text-brandBlue" />
              Label format check
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">Great. We will check that labels match the images and can be prepared for training.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {supportedFormats.map((format) => (
                <span key={format} className="rounded-full border border-white bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                  {format}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-sm font-semibold text-slate-900">Next best action</div>
            <p className="mt-2 text-sm leading-6 text-slate-500">Run a data check so training starts from clean examples.</p>
            <Button className="mt-4" onClick={onAuditDataset} type="button" variant="outline">
              Run data check
            </Button>
          </div>
        </div>
      ) : null}

      {labelReadiness === "no" ? (
        <div className="mt-5">
          <div className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Choose a labeling path</div>
          <div className="grid gap-3 md:grid-cols-3">
            {labelingPaths.map((path) => (
              <ChoiceCard
                key={path.value}
                active={labelingMode === path.value}
                helper={path.helper}
                icon={Tag}
                title={path.label}
                onClick={() => onLabelingModeChange(path.value)}
              />
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-brandRed/20 bg-brandRed/[0.04] p-4 text-sm leading-6 text-slate-600">
            This is a safe UI path for future labeling support. It does not pretend labeling is already done.
          </div>
        </div>
      ) : null}

      {labelReadiness === "unsure" ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-sm font-semibold text-slate-900">Not sure is okay</div>
          <p className="mt-2 text-sm leading-6 text-slate-500">Run a check first. If labels are missing, choose a labeling path before training.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={onAuditDataset} type="button">
              Run data check
            </Button>
            <Button onClick={() => onLabelReadinessChange("no")} type="button" variant="outline">
              Prepare labels
            </Button>
          </div>
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
  const currentModelPath = currentModel?.model_path || "Production model (existing inference pipeline)";
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
                : activeUseCase?.id === "class-wise-object-counting"
                  ? "Training completed successfully. Counting accuracy is not evaluated yet. This fine-tuning improves the detection layer; counting results are validated in Integration/Dashboard."
              : "Training completed successfully. Model ready for evaluation and staging."
            : "Training is not complete yet.";
  const currentModelDescription =
    activeUseCase?.id === "speed-estimation"
      ? "This is the model currently used for speed estimation inference. It remains unchanged."
      : activeUseCase?.id === "object-tracking"
        ? "This is the model currently used for object tracking inference. It remains unchanged."
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
          <SmallCard helper="This remains the active inference model." title="Current model" value={currentModel?.version ?? "Production"} />
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
          <div className="text-lg font-semibold text-slate-900">Current Live Model</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{currentModelDescription}</p>
          <div className="mt-5 space-y-3">
            <SmallCard helper="Shown when a concrete live model path is available." title="Model path" value={currentModelPath} />
            <SmallCard helper="Production remains untouched in this step." title="Status" value={currentModelStatus} tone="accent" />
          </div>
        </div>

        <div className="rounded-2xl border border-brandBlue/20 bg-brandBlue/[0.04] p-5">
          <div className="text-lg font-semibold text-slate-900">New Fine-Tuned Model</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">This model comes from the Step 5 training run and reflects the latest backend job state.</p>
          <div className="mt-5 space-y-3">
            <SmallCard helper="Backend training job identifier." title="Training job ID" value={jobDetails?.id ?? "No training job"} />
            <SmallCard helper={jobLoading ? "Refreshing latest backend state..." : "Returned from the Step 5 job endpoint."} title="Status" value={comparisonStatus || "Not started"} tone="accent" />
            <SmallCard helper="Saved after training completes." title="Output model path" value={jobDetails?.output_model_path || "Available after training completes"} />
            <SmallCard helper="Shown from the Step 4 selection while backend plan details stay internal." title="Run depth" value={runDepthLabel} />
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
            : activeUseCase?.id === "class-wise-object-counting"
              ? "Register the trained model, try it safely in staging for Class-wise Object Counting, or promote it only after validation."
          : "Register the trained model, try it safely in staging, or promote it only after validation."
      }
      title="Go live safely"
      aside={
        <>
          <SmallCard helper="Active production reference" title="Current live model" value={currentModel.version} />
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
