import { Badge } from "../ui/badge";

function MetricGrid({ title, metrics }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-base font-semibold text-slate-900">{title}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{metric.label}</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">{metric.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ResultsSection({ evaluation, selectedCandidateId, onCandidateSelect }) {
  const selectedCandidate =
    evaluation.candidate_models.find((candidate) => candidate.id === selectedCandidateId) ?? evaluation.candidate_models[0];

  const baselineQuality = Number.parseFloat((evaluation.baseline_model.metrics[0]?.value ?? "0").replace("%", "")) || 0;
  const candidateQuality = Number.parseFloat((selectedCandidate?.metrics[0]?.value ?? "0").replace("%", "")) || 0;
  const qualityDelta = (candidateQuality - baselineQuality).toFixed(1);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-2xl font-semibold text-slate-900">Before vs after</h3>
          <p className="mt-1 text-sm text-slate-500">Compare the live version with the new one and decide whether it is really better.</p>
        </div>
        <Badge tone="normal">Step 4</Badge>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-brandBlue/15 bg-brandBlue/[0.04] p-5 text-sm leading-6 text-slate-700">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Overall read</div>
          <p className="mt-2">{evaluation.summary}</p>
        </div>
        <div className="rounded-2xl border border-brandRed/15 bg-brandRed/[0.04] p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Selected version change</div>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-3xl font-semibold text-slate-900">+{qualityDelta}%</span>
            <span className="pb-1 text-sm font-semibold text-slate-500">quality score</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{selectedCandidate?.recommendation}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <MetricGrid metrics={evaluation.baseline_model.metrics} title={`${evaluation.baseline_model.name} • ${evaluation.baseline_model.version}`} />
        <MetricGrid metrics={selectedCandidate?.metrics ?? []} title={`${selectedCandidate?.name ?? "Candidate"} • ${selectedCandidate?.version ?? ""}`} />
      </div>

      <div className="mt-6">
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Pick the version you want to review</div>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          {evaluation.candidate_models.map((candidate) => {
            const active = candidate.id === selectedCandidateId;
            return (
              <button
                key={candidate.id}
                className={`rounded-2xl border p-5 text-left transition ${active ? "border-brandRed bg-brandRed/5 shadow-sm" : "border-slate-200 hover:border-brandBlue/30"}`}
                onClick={() => onCandidateSelect(candidate.id)}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-base font-semibold text-slate-900">{candidate.badge}</div>
                  <span className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {candidate.version}
                  </span>
                </div>
                <div className="mt-3 text-sm font-semibold text-slate-800">{candidate.name}</div>
                <p className="mt-2 text-sm leading-6 text-slate-500">{candidate.summary}</p>
                <p className="mt-3 text-sm font-medium text-brandBlue">{candidate.recommendation}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {evaluation.improvement_story.map((story) => (
              <div key={story.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">{story.title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-500">{story.detail}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">What improved by class</div>
            <div className="mt-4 space-y-3">
              {evaluation.class_breakdown.map((row) => {
                const baseline = Number.parseFloat(row.baseline.replace("%", "")) || 0;
                const candidate = Number.parseFloat(row.candidate.replace("%", "")) || 0;
                return (
                  <div key={row.label} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-slate-900">{row.label}</div>
                      <div className="flex gap-2 text-xs font-semibold">
                        <span className="rounded-full border border-slate-200 px-3 py-1 text-slate-500">Before {row.baseline}</span>
                        <span className="rounded-full border border-brandBlue/20 bg-brandBlue/[0.04] px-3 py-1 text-brandBlue">After {row.candidate}</span>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      <div>
                        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Before</div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full rounded-full bg-slate-400" style={{ width: `${baseline}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">After</div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full rounded-full bg-brandBlue" style={{ width: `${candidate}%` }} />
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-500">{row.note}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {evaluation.review_buckets.map((bucket, index) => (
            <div key={bucket.title} className={`rounded-2xl border p-5 ${index === 0 ? "border-brandBlue/20 bg-brandBlue/[0.04]" : "border-slate-200 bg-slate-50"}`}>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{bucket.title}</div>
              <div className="mt-4 space-y-2">
                {bucket.items.map((item) => (
                  <div key={item} className="rounded-xl border border-white bg-white px-4 py-3 text-sm leading-6 text-slate-600">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Quick review panels</div>
            <div className="mt-4 grid gap-3">
              {evaluation.gallery.map((item) => (
                <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
