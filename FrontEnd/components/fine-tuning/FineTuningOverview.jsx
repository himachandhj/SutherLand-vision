"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles, UploadCloud } from "lucide-react";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

export default function FineTuningOverview({
  activeUseCase,
  config,
  datasetHealth,
  trainingJob,
  selectedBaseModelName,
  pageMessage,
  steps,
  activeStep,
  onAuditDataset,
  onStepSelect,
}) {
  const [showHelp, setShowHelp] = useState(false);

  const guidePoints = [
    "Bring real examples from the site you care about.",
    "We check the data before any tuning starts.",
    "Nothing replaces the live model until you approve it.",
  ];

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-[#F8F9FF] via-white to-[#FFF6F8] shadow-panel">
      <div className="grid gap-5 px-5 py-5 xl:grid-cols-[1.15fr_0.85fr] xl:px-7 xl:py-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="normal">Guided Fine-Tuning</Badge>
            <span className="rounded-full border border-white bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 shadow-sm">
              {activeUseCase.title}
            </span>
          </div>

          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <h2 className="text-[2rem] font-semibold tracking-tight text-slate-900">{config.heroTitle}</h2>
              <p className="mt-2 text-[15px] leading-7 text-slate-600">Bring examples from your site, choose what matters most, compare the new version with the live one, then decide whether to roll it out.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={onAuditDataset} type="button">
                Run data check
              </Button>
              <Button onClick={() => onStepSelect("data")} type="button" variant="outline">
                Open workflow
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white bg-white/90 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                <UploadCloud className="h-4 w-4 text-brandBlue" />
                Ready score
              </div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">{datasetHealth.score}/100</div>
              <p className="mt-1 text-sm text-slate-500">{datasetHealth.readiness}</p>
            </div>

            <div className="rounded-2xl border border-white bg-white/90 p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Start from</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{selectedBaseModelName}</div>
              <p className="mt-1 text-sm text-slate-500">Recommended starting point for this use case.</p>
            </div>

            <div className="rounded-2xl border border-white bg-white/90 p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Current stage</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{trainingJob.current_stage}</div>
              <p className="mt-1 text-sm text-slate-500">{trainingJob.next_up}</p>
            </div>

            <div className="rounded-2xl border border-white bg-white/90 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                <ShieldCheck className="h-4 w-4 text-brandBlue" />
                Safety
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-900">Live model stays protected</div>
              <p className="mt-1 text-sm text-slate-500">You compare first and choose later.</p>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-white bg-white/90 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Simple path</div>
              <p className="mt-1 text-sm text-slate-500">Start simple. Open details only when you need them.</p>
            </div>
            <button
              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-brandBlue hover:text-brandBlue"
              onClick={() => setShowHelp((current) => !current)}
              type="button"
            >
              {showHelp ? "Hide help" : "Why this?"}
            </button>
          </div>

          {showHelp ? (
            <div className="mt-4 space-y-2">
              {guidePoints.map((point) => (
                <div key={point} className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-brandBlue" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-sm font-semibold text-slate-900">What happens next</div>
                <p className="mt-1 text-sm text-slate-500">{trainingJob.plain_english_status}</p>
              </div>
              <button
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-brandBlue/30"
                onClick={() => onStepSelect("results")}
                type="button"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">Want to see the decision area first?</div>
                  <p className="mt-1 text-sm text-slate-500">Jump straight to before-vs-after comparison and rollout actions.</p>
                </div>
                <ArrowRight className="h-4 w-4 text-brandBlue" />
              </button>
            </div>
          )}
        </div>

        <div className="xl:col-span-2">
          <div className="grid gap-3 lg:grid-cols-6">
            {steps.map((step, index) => {
              const active = activeStep === step.id;
              return (
                <button
                  key={step.id}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    active ? "border-brandRed bg-white shadow-sm" : "border-white bg-white/80 hover:border-brandBlue/30"
                  }`}
                  onClick={() => onStepSelect(step.id)}
                  type="button"
                >
                  <div className="flex items-center gap-3">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${active ? "bg-brandRed text-white" : "bg-slate-100 text-slate-500"}`}>
                      {index + 1}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">{step.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {pageMessage ? (
          <div className="xl:col-span-2">
            <div className="flex items-start gap-3 rounded-2xl border border-brandBlue/15 bg-white px-4 py-4 text-sm text-slate-700 shadow-sm">
              <Sparkles className="mt-0.5 h-4 w-4 text-brandBlue" />
              <span>{pageMessage}</span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
