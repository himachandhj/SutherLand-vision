import { Badge } from "../ui/badge";

export default function BaseModelSection({ baseModels, currentModel, selectedBaseModelId, selectedGoal, onBaseModelChange }) {
  const selectedModel = baseModels.find((model) => model.value === selectedBaseModelId) ?? baseModels[0];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-2xl font-semibold text-slate-900">Choose a starting model</h3>
          <p className="mt-1 text-sm text-slate-500">Pick the version you want to build from. The live model stays safe in view the whole time.</p>
        </div>
        <Badge tone="normal">Step 2</Badge>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Current live model</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="text-lg font-semibold text-slate-900">{currentModel.name}</div>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {currentModel.version}
            </span>
            <span className="rounded-full border border-brandBlue/15 bg-brandBlue/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brandBlue">
              {currentModel.environment}
            </span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-500">This stays live until you choose otherwise.</p>
        </div>

        <div className="rounded-2xl border border-brandBlue/15 bg-brandBlue/[0.04] p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Why this choice fits</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">{selectedModel?.label ?? "Recommended model"}</div>
          <p className="mt-3 text-sm leading-6 text-slate-600">{selectedModel?.helper}</p>
          <div className="mt-4 rounded-xl border border-white bg-white px-3 py-3 text-sm text-slate-600">
            Best paired with the goal <span className="font-semibold text-slate-900">{selectedGoal?.label ?? "Keep it balanced"}</span>.
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {baseModels.map((model) => {
          const active = selectedBaseModelId === model.value;
          return (
            <button
              key={model.value}
              className={`rounded-2xl border p-5 text-left transition ${active ? "border-brandRed bg-brandRed/5 shadow-sm" : "border-slate-200 hover:border-brandBlue/30"}`}
              onClick={() => onBaseModelChange(model.value)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-base font-semibold text-slate-900">{model.label}</div>
                <span className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {model.tradeoff}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-500">{model.helper}</p>
              {active && (
                <div className="mt-4 rounded-xl border border-brandRed/15 bg-white px-3 py-3 text-sm font-medium text-slate-700">
                  This starting model is selected for the next guided run.
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
