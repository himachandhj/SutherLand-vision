"use client";

import { useState } from "react";

import { Badge } from "../ui/badge";
import AdvancedSettings from "./AdvancedSettings";

export default function TrainingSection({
  goalOptions,
  selectedGoalId,
  trainingModeOptions,
  selectedTrainingModeId,
  stopConditionOptions,
  selectedStopConditionId,
  advancedOpen,
  advancedSettings,
  onGoalChange,
  onTrainingModeChange,
  onStopConditionChange,
  onToggleAdvanced,
  onAdvancedSettingChange,
}) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-2xl font-semibold text-slate-900">What matters most</h3>
          <p className="mt-1 text-sm text-slate-500">Choose the outcome you care about, then decide how deep the run should go.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="normal">Step 3</Badge>
          <button
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-brandBlue hover:text-brandBlue"
            onClick={() => setShowHelp((current) => !current)}
            type="button"
          >
            {showHelp ? "Hide help" : "Why this?"}
          </button>
        </div>
      </div>

      {showHelp ? (
        <div className="mt-5 rounded-2xl border border-brandBlue/15 bg-brandBlue/[0.04] p-4 text-sm leading-6 text-slate-600">
          We start with safe defaults, try a few improved versions behind the scenes, compare them with the live model, and let you decide whether one is strong enough to move forward.
        </div>
      ) : null}

      <div className="mt-6">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Main goal</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {goalOptions.map((goal) => {
            const active = goal.value === selectedGoalId;
            return (
              <button
                key={goal.value}
                className={`rounded-2xl border p-4 text-left transition ${active ? "border-brandRed bg-brandRed/5 shadow-sm" : "border-slate-200 hover:border-brandBlue/30"}`}
                onClick={() => onGoalChange(goal.value)}
                type="button"
              >
                <div className="text-sm font-semibold text-slate-900">{goal.label}</div>
                <p className="mt-2 text-sm leading-6 text-slate-500">{goal.helper}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">How deep should we go?</div>
          <div className="mt-3 space-y-3">
            {trainingModeOptions.map((mode) => {
              const active = mode.value === selectedTrainingModeId;
              return (
                <button
                  key={mode.value}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${active ? "border-brandRed bg-white" : "border-slate-200 bg-white hover:border-brandBlue/30"}`}
                  onClick={() => onTrainingModeChange(mode.value)}
                  type="button"
                >
                  <div className="text-sm font-semibold text-slate-900">{mode.label}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{mode.helper}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">When should we stop?</div>
          <div className="mt-3 space-y-3">
            {stopConditionOptions.map((option) => {
              const active = option.value === selectedStopConditionId;
              return (
                <button
                  key={option.value}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${active ? "border-brandRed bg-white" : "border-slate-200 bg-white hover:border-brandBlue/30"}`}
                  onClick={() => onStopConditionChange(option.value)}
                  type="button"
                >
                  <div className="text-sm font-semibold text-slate-900">{option.label}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <button
          className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-brandBlue hover:text-brandBlue"
          onClick={onToggleAdvanced}
          type="button"
        >
          {advancedOpen ? "Hide extra controls" : "Show extra controls"}
        </button>
        {advancedOpen ? <AdvancedSettings settings={advancedSettings} onChange={onAdvancedSettingChange} /> : null}
      </div>
    </section>
  );
}
