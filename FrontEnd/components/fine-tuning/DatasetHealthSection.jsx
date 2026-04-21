import { Badge } from "../ui/badge";

function toneFromStatus(status) {
  if (status === "compliant") return "compliant";
  if (status === "warning") return "warning";
  return "alert";
}

export default function DatasetHealthSection({ datasetHealth, selectedDataset }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-2xl font-semibold text-slate-900">Data check</h3>
          <p className="mt-1 text-sm text-slate-500">See what looks good, what needs attention, and what the system will clean up for you.</p>
        </div>
        <Badge tone="normal">Audit</Badge>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[0.78fr_1.22fr]">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Ready score</div>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-4xl font-semibold text-slate-900">{datasetHealth.score}</span>
                <span className="pb-1 text-sm font-semibold text-slate-400">/100</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{datasetHealth.readiness}</p>
            </div>
            <div
              className="flex h-24 w-24 items-center justify-center rounded-full border border-slate-200 bg-white text-xl font-semibold text-brandBlue"
              style={{ background: `conic-gradient(#27235C ${datasetHealth.score * 3.6}deg, #E7EAF2 0deg)` }}
            >
              <div className="flex h-[74px] w-[74px] items-center justify-center rounded-full bg-white">
                {datasetHealth.score}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
            <div className="font-semibold text-slate-900">{selectedDataset?.name ?? "Selected data set"}</div>
            <div className="mt-1">Split plan: {datasetHealth.split_summary.train} / {datasetHealth.split_summary.validation} / {datasetHealth.split_summary.test}</div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Best next actions</div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              {datasetHealth.top_actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-3">
          {datasetHealth.checks.map((check) => (
            <div key={check.label} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">{check.label}</div>
                <p className="mt-1 text-sm leading-6 text-slate-500">{check.detail}</p>
              </div>
              <Badge tone={toneFromStatus(check.status)}>{check.status}</Badge>
            </div>
          ))}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Planned cleanup</div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
              {datasetHealth.preprocessing_steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
