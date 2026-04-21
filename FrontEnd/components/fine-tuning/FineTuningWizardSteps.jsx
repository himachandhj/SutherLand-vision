"use client";

import { useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Database,
  HelpCircle,
  PlayCircle,
  Rocket,
  ShieldCheck,
  Tag,
  UploadCloud,
} from "lucide-react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
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
  selectedGoalId,
  selectedTrainingModeId,
  selectedStopConditionId,
  advancedOpen,
  sceneOpen,
  advancedSettings,
  extensionSettings,
  onBaseModelChange,
  onGoalChange,
  onTrainingModeChange,
  onStopConditionChange,
  onToggleAdvanced,
  onToggleScene,
  onAdvancedSettingChange,
  onExtensionSettingChange,
  goalOptions,
  trainingModeOptions,
  stopConditionOptions,
}) {
  const selectedBaseModel = baseModels.find((model) => model.value === selectedBaseModelId) ?? baseModels[0];

  return (
    <StepShell
      eyebrow="Step 4"
      helper="Pick a starting point and choose what matters most. Advanced controls stay hidden."
      title="Choose your plan"
      aside={
        <>
          <SmallCard helper="This stays live until rollout." title="Live model" value={currentModel.version} />
          <SmallCard helper={selectedBaseModel?.helper} title="Starting model" tone="accent" value={selectedBaseModel?.label ?? "Recommended"} />
        </>
      }
    >
      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
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

        <div>
          <div className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Choose what matters most</div>
          <div className="grid gap-3 md:grid-cols-2">
            {goalOptions.map((goal) => (
              <ChoiceCard
                key={goal.value}
                active={selectedGoalId === goal.value}
                helper={goal.helper}
                title={goal.label}
                onClick={() => onGoalChange(goal.value)}
              />
            ))}
          </div>
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

export function WatchTrainingStep({ trainingJob, onAdvanceTraining }) {
  return (
    <StepShell
      eyebrow="Step 5"
      helper="This is ready for backend progress updates later. For now, the mock button moves the staged flow forward."
      title="Watch training"
      aside={
        <>
          <SmallCard helper={trainingJob.next_up} title="Current stage" tone="accent" value={trainingJob.current_stage} />
          <SmallCard helper={trainingJob.eta} title="Progress" value={`${trainingJob.progress_percent}%`} />
        </>
      }
    >
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold text-slate-900">{trainingJob.current_stage}</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{trainingJob.plain_english_status}</p>
          </div>
          <Button onClick={onAdvanceTraining} type="button">
            Advance mock stage
          </Button>
        </div>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-brandBlue transition-all" style={{ width: `${trainingJob.progress_percent}%` }} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SmallCard title="Elapsed" value={trainingJob.elapsed} />
          <SmallCard title="ETA" value={trainingJob.eta} />
          <SmallCard title="Best so far" value={trainingJob.best_metric} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {trainingJob.timeline.map((item, index) => (
          <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${item.status === "complete" ? "bg-brandBlue text-white" : item.status === "running" ? "bg-brandRed text-white" : "bg-slate-100 text-slate-500"}`}>
                  {index + 1}
                </span>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                  <p className="mt-1 text-sm leading-6 text-slate-500">{item.detail}</p>
                </div>
              </div>
              <Badge tone={item.status === "complete" ? "compliant" : item.status === "running" ? "warning" : "normal"}>{item.status}</Badge>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Recent activity</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {trainingJob.activity_feed.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{item.time}</span>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-500">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </StepShell>
  );
}

export function CompareResultsStep({ activeUseCase, currentModel, evaluation, selectedCandidateId, selectedCandidate, onCandidateSelect }) {
  const baselineQuality = Number.parseFloat((evaluation.baseline_model.metrics[0]?.value ?? "0").replace("%", "")) || 0;
  const candidateQuality = Number.parseFloat((selectedCandidate?.metrics[0]?.value ?? "0").replace("%", "")) || 0;
  const qualityDelta = (candidateQuality - baselineQuality).toFixed(1);

  return (
    <StepShell
      eyebrow="Step 6"
      helper="Pick the version that looks safest to test. Production is still unchanged."
      title="Compare before replacing"
      aside={
        <>
          <SmallCard helper={selectedCandidate?.recommendation} title="Selected version" tone="accent" value={selectedCandidate?.badge ?? "Choose one"} />
          <SmallCard helper="Compared with the current live model." title="Quality change" value={`+${qualityDelta}%`} />
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {evaluation.candidate_models.map((candidate) => (
          <ChoiceCard
            key={candidate.id}
            active={candidate.id === selectedCandidateId}
            badge={candidate.version}
            helper={candidate.summary}
            icon={BarChart3}
            title={candidate.badge}
            onClick={() => onCandidateSelect(candidate.id)}
          />
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-sm font-semibold text-slate-900">{currentModel.name}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {evaluation.baseline_model.metrics.map((metric) => (
              <SmallCard key={metric.label} title={metric.label} value={metric.value} />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-brandBlue/20 bg-brandBlue/[0.04] p-5">
          <div className="text-sm font-semibold text-slate-900">{selectedCandidate?.name}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {(selectedCandidate?.metrics ?? []).map((metric) => (
              <SmallCard key={metric.label} title={metric.label} value={metric.value} tone="accent" />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">What improved</div>
          <div className="mt-3 grid gap-3">
            {evaluation.review_buckets[0]?.items.map((item) => (
              <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Quick side-by-side check</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">{activeUseCase.title} current</div>
              <div className="mt-3 space-y-2">
                {(selectedCandidate?.preview?.current ?? []).map((item) => (
                  <div key={item} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">{item}</div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-brandBlue/20 bg-brandBlue/[0.04] p-4">
              <div className="text-sm font-semibold text-slate-900">{activeUseCase.title} new version</div>
              <div className="mt-3 space-y-2">
                {(selectedCandidate?.preview?.candidate ?? []).map((item) => (
                  <div key={item} className="rounded-xl border border-white bg-white px-3 py-2 text-sm text-slate-600">{item}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </StepShell>
  );
}

export function RolloutStep({ currentModel, deploymentState, selectedCandidate, onAction }) {
  return (
    <StepShell
      eyebrow="Step 7"
      helper="Save, test, or keep the current model. This UI does not change production unless a backend action is added later."
      title="Go live safely"
      aside={
        <>
          <SmallCard helper={currentModel.environment} title="Current live model" value={currentModel.version} />
          <SmallCard helper={selectedCandidate?.badge} title="New version" tone="accent" value={selectedCandidate?.version ?? "Choose candidate"} />
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        {deploymentState.rollout_plan.map((step, index) => (
          <div key={step} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brandBlue text-sm font-semibold text-white">{index + 1}</div>
            <div className="mt-3 text-sm font-semibold text-slate-900">{step}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-brandBlue/20 bg-brandBlue/[0.04] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-900">{selectedCandidate?.name ?? "Candidate version"}</div>
            <p className="mt-1 text-sm leading-6 text-slate-600">{selectedCandidate?.recommendation ?? "Choose a version in the compare step first."}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => onAction("candidate")} type="button" variant="outline">
              Save version
            </Button>
            <Button onClick={() => onAction("staging")} type="button" variant="outline">
              Try staging
            </Button>
            <Button onClick={() => onAction("production")} type="button">
              Promote
              <Rocket className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Latest action</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{deploymentState.last_action}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Rollback note</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{deploymentState.rollback_note}</p>
          <Button className="mt-4" onClick={() => onAction("keep-current")} type="button" variant="outline">
            Keep current model
          </Button>
        </div>
      </div>
    </StepShell>
  );
}
