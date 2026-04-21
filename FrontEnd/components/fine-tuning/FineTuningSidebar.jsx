import { ArrowRight, CircleCheckBig, ListTodo, Sparkles, TimerReset } from "lucide-react";

import { Badge } from "../ui/badge";

function SidebarCard({ children, className = "" }) {
  return <div className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-panel ${className}`}>{children}</div>;
}

export default function FineTuningSidebar({
  datasetHealth,
  trainingJob,
  selectedDataset,
  selectedBaseModel,
  selectedGoal,
  selectedTrainingMode,
  selectedCandidate,
  steps,
  activeStep,
  onStepSelect,
}) {
  return (
    <div className="space-y-4">
      <SidebarCard className="bg-gradient-to-br from-brandBlue/[0.05] via-white to-brandRed/[0.03]">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Sparkles className="h-4 w-4 text-brandRed" />
          Your plan
        </div>
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-white/70 bg-white px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Your data</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{selectedDataset?.name ?? "Choose your examples"}</div>
            <p className="mt-1 text-sm text-slate-500">{selectedDataset?.item_count ?? "Bring real-world examples from your site."}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Starting model</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{selectedBaseModel?.label ?? "Recommended model"}</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-2xl border border-white/70 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Main goal</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{selectedGoal?.label ?? "Keep it balanced"}</div>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Depth</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{selectedTrainingMode?.label ?? "Recommended"}</div>
            </div>
          </div>
        </div>
      </SidebarCard>

      <SidebarCard>
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <TimerReset className="h-4 w-4 text-brandBlue" />
          What is happening now
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold text-slate-900">{trainingJob.current_stage}</div>
          <p className="mt-2 text-sm leading-6 text-slate-500">{trainingJob.next_up}</p>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-500">Progress</span>
          <span className="font-semibold text-slate-900">{trainingJob.progress_percent}%</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-brandBlue transition-all" style={{ width: `${trainingJob.progress_percent}%` }} />
        </div>
      </SidebarCard>

      <SidebarCard>
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ListTodo className="h-4 w-4 text-brandBlue" />
          Quick navigation
        </div>
        <div className="mt-4 space-y-2">
          {steps.map((step, index) => {
            const active = activeStep === step.id;
            return (
              <button
                key={step.id}
                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition ${
                  active ? "border-brandRed bg-brandRed/5 text-slate-900" : "border-slate-200 text-slate-600 hover:border-brandBlue/30 hover:text-slate-900"
                }`}
                onClick={() => onStepSelect(step.id)}
                type="button"
              >
                <span className="flex items-center gap-3">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${active ? "bg-brandRed text-white" : "bg-slate-100 text-slate-500"}`}>
                    {index + 1}
                  </span>
                  {step.label}
                </span>
                <ArrowRight className={`h-4 w-4 ${active ? "text-brandRed" : "text-slate-300"}`} />
              </button>
            );
          })}
        </div>
      </SidebarCard>

      <SidebarCard>
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <CircleCheckBig className="h-4 w-4 text-brandBlue" />
          What good examples look like
        </div>
        <div className="mt-4 space-y-3">
          {datasetHealth.good_example_tips.map((tip) => (
            <div key={tip} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
              {tip}
            </div>
          ))}
        </div>
      </SidebarCard>

      <SidebarCard>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Recommended new version</div>
            <p className="mt-1 text-sm text-slate-500">Ready for a final side-by-side check before you go live.</p>
          </div>
          <Badge tone="normal">Suggested</Badge>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold text-slate-900">{selectedCandidate?.name ?? "Best overall balance"}</div>
          <p className="mt-2 text-sm leading-6 text-slate-500">{selectedCandidate?.recommendation ?? "Choose a version in the comparison section first."}</p>
        </div>
      </SidebarCard>
    </div>
  );
}
