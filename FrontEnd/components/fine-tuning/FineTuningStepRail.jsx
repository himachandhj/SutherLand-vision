"use client";

import { CheckCircle2, Circle, CircleDot } from "lucide-react";

import { Badge } from "../ui/badge";

export default function FineTuningStepRail({
  steps,
  activeStepId,
  completedStepIds,
  currentPlanState,
  selectedDataset,
  selectedGoal,
  selectedTrainingMode,
  trainingJob,
  onStepSelect,
}) {
  const planStatus = currentPlanState?.status ?? trainingJob.status ?? "normal";
  const totalSteps = Math.max(steps.length, 1);
  const activeStepIndex = Math.max(steps.findIndex((step) => step.id === activeStepId), 0);
  const stepProgressCount = Math.max(completedStepIds.length, activeStepIndex) + 1;
  const progressPercent = Math.round((Math.min(stepProgressCount, totalSteps) / totalSteps) * 100);

  return (
    <aside className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-panel lg:sticky lg:top-5 lg:self-start">
      <div className="mb-4 px-2">
        <div className="text-sm font-semibold text-slate-900">Fine-tuning flow</div>
        <p className="mt-1 text-sm text-slate-500">Move step by step. Nothing goes live until you choose it.</p>
      </div>

      <div className="space-y-2">
        {steps.map((step, index) => {
          const active = step.id === activeStepId;
          const complete = completedStepIds.includes(step.id);
          const Icon = complete ? CheckCircle2 : active ? CircleDot : Circle;

          return (
            <button
              key={step.id}
              className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                active
                  ? "border-brandRed bg-brandRed/5 shadow-sm"
                  : complete
                    ? "border-brandBlue/15 bg-brandBlue/[0.04] hover:border-brandBlue/30"
                    : "border-transparent hover:border-slate-200 hover:bg-slate-50"
              }`}
              onClick={() => onStepSelect(step.id)}
              type="button"
            >
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  active ? "bg-brandRed text-white" : complete ? "bg-brandBlue text-white" : "bg-slate-100 text-slate-400"
                }`}
              >
                {complete ? <Icon className="h-4 w-4" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900">{step.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-500">{step.helper}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">Current plan</div>
          <Badge
            tone={
              planStatus === "running"
                ? "warning"
                : planStatus === "compliant" || planStatus === "complete"
                  ? "compliant"
                  : planStatus === "blocked"
                    ? "alert"
                    : planStatus === "warning"
                      ? "warning"
                      : "normal"
            }
          >
            {planStatus}
          </Badge>
        </div>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Data</span>
            <span className="max-w-[150px] truncate font-semibold text-slate-800">{selectedDataset?.name ?? "Not selected"}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Goal</span>
            <span className="max-w-[150px] truncate font-semibold text-slate-800">{selectedGoal?.label ?? "Balanced"}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Run</span>
            <span className="max-w-[150px] truncate font-semibold text-slate-800">{selectedTrainingMode?.label ?? "Recommended"}</span>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          <span>Step progress</span>
          <span>{Math.min(stepProgressCount, totalSteps)} of {totalSteps}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-brandBlue transition-all" style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }} />
        </div>
      </div>
    </aside>
  );
}
