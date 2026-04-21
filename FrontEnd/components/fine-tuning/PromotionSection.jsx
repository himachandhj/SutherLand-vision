import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

export default function PromotionSection({ currentModel, deploymentState, selectedCandidate, onAction }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-2xl font-semibold text-slate-900">Go live safely</h3>
          <p className="mt-1 text-sm text-slate-500">Save the new version, try it safely, or keep the live one unchanged.</p>
        </div>
        <Badge tone="normal">Step 5</Badge>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {deploymentState.rollout_plan.map((step, index) => (
          <div key={step} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Step {index + 1}</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{step}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Current live model</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">{currentModel.name}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500">{currentModel.version}</span>
            <span className="rounded-full border border-brandBlue/15 bg-brandBlue/[0.04] px-3 py-1 text-brandBlue">{currentModel.environment}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-500">This remains the source of truth until a go-live action is confirmed.</p>
        </div>

        <div className="rounded-2xl border border-brandBlue/15 bg-brandBlue/[0.04] p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">New version under review</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">{selectedCandidate?.name ?? "New version"}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-500">{selectedCandidate?.version ?? "Pending"}</span>
            <span className="rounded-full border border-brandBlue/15 bg-white px-3 py-1 text-brandBlue">{selectedCandidate?.badge ?? "Candidate"}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">{selectedCandidate?.recommendation ?? "Choose a version from the comparison section first."}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={() => onAction("candidate")} type="button" variant="outline">
          Save this version
        </Button>
        <Button onClick={() => onAction("staging")} type="button" variant="outline">
          Promote to staging
        </Button>
        <Button onClick={() => onAction("production")} type="button">
          Promote to production
        </Button>
        <button
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brandBlue hover:text-brandBlue"
          onClick={() => onAction("keep-current")}
          type="button"
        >
          Keep current model
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Latest action</div>
        <p className="mt-3 text-sm leading-6 text-slate-600">{deploymentState.last_action}</p>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-500">
          <span className="font-semibold text-slate-900">Rollback note:</span> {deploymentState.rollback_note}
        </div>
      </div>
    </section>
  );
}
