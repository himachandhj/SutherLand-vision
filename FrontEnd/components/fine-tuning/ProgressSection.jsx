import { Badge } from "../ui/badge";

function timelineTone(status) {
  if (status === "complete") return "compliant";
  if (status === "running") return "warning";
  return "normal";
}

export default function ProgressSection({ trainingJob }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-2xl font-semibold text-slate-900">Run details</h3>
          <p className="mt-1 text-sm text-slate-500">See what is done, what is running, and what comes next.</p>
        </div>
        <Badge tone={trainingJob.status === "complete" ? "compliant" : trainingJob.status === "running" ? "warning" : "normal"}>
          {trainingJob.status}
        </Badge>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[0.88fr_1.12fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Current stage</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{trainingJob.current_stage}</div>
          <p className="mt-3 text-sm leading-6 text-slate-600">{trainingJob.plain_english_status}</p>

          <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-brandBlue transition-all" style={{ width: `${trainingJob.progress_percent}%` }} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Progress</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{trainingJob.progress_percent}%</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Elapsed</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{trainingJob.elapsed}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">ETA</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{trainingJob.eta}</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Best result so far</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">{trainingJob.best_metric}</div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">What comes next</div>
            <div className="mt-2 text-sm leading-6 text-slate-600">{trainingJob.next_up}</div>
          </div>
        </div>

        <div className="space-y-3">
          {trainingJob.timeline.map((item, index) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brandBlue/10 text-sm font-semibold text-brandBlue">
                    {index + 1}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{item.detail}</p>
                  </div>
                </div>
                <Badge tone={timelineTone(item.status)}>{item.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Recent activity</div>
          <div className="mt-4 space-y-3">
            {trainingJob.activity_feed.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{item.time}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-brandBlue/[0.04] to-white p-5">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">What this means for the user</div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">No hidden switch</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">The live model stays untouched while training is running.</p>
            </div>
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">You can leave and come back</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">This area is built for long jobs, so future live updates can fit naturally.</p>
            </div>
            <div className="rounded-2xl border border-white bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">The end result stays reviewable</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">The next screen compares the current model and the new versions before any rollout decision.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
