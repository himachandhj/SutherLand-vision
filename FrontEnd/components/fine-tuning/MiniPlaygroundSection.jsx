"use client";

import { useEffect, useRef, useState } from "react";

import { Badge } from "../ui/badge";

export default function MiniPlaygroundSection({ activeUseCase, currentModel, selectedCandidate }) {
  const uploadRef = useRef(null);
  const [sampleName, setSampleName] = useState("");
  const [viewMode, setViewMode] = useState("side-by-side");

  useEffect(() => {
    setSampleName("");
    setViewMode("side-by-side");
  }, [activeUseCase.id]);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-2xl font-semibold text-slate-900">Quick side-by-side check</h3>
          <p className="mt-1 text-sm text-slate-500">Keep this lightweight. The main Model Playground stays untouched; this smaller area is only for checking whether the new version feels better before you move it forward.</p>
        </div>
        <Badge tone="normal">Validation</Badge>
      </div>

      <input
        ref={uploadRef}
        accept="image/*,video/*,.mp4,.mov,.avi"
        className="hidden"
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) setSampleName(file.name);
          event.target.value = "";
        }}
      />

      <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">Upload one small sample</div>
            <p className="mt-2 text-sm leading-6 text-slate-500">Use one representative image or short clip from your site and compare the current model with the new version side by side.</p>
          </div>
          <button
            className="rounded-xl border border-brandBlue px-4 py-3 text-sm font-semibold text-brandBlue transition hover:bg-brandBlue hover:text-white"
            onClick={() => uploadRef.current?.click()}
            type="button"
          >
            Choose sample
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {["side-by-side", "what got better", "watch-outs"].map((mode) => {
            const active = viewMode === mode;
            const label = mode === "side-by-side" ? "Side by side" : mode === "what got better" ? "What got better" : "What to double-check";
            return (
              <button
                key={mode}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${active ? "border-brandRed bg-brandRed/5 text-slate-900" : "border-slate-200 text-slate-500 hover:border-brandBlue/30 hover:text-slate-900"}`}
                onClick={() => setViewMode(mode)}
                type="button"
              >
                {label}
              </button>
            );
          })}
          {sampleName && <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">Loaded sample: {sampleName}</div>}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-base font-semibold text-slate-900">{currentModel.name}</div>
            <Badge tone="normal">{currentModel.version}</Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">What the current live model tends to do on this kind of sample.</p>
          <div className="mt-4 space-y-2">
            {(selectedCandidate?.preview.current ?? []).map((item) => (
              <div key={item} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-brandBlue/20 bg-brandBlue/[0.04] p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-base font-semibold text-slate-900">{selectedCandidate?.name ?? `${activeUseCase.title} Candidate`}</div>
            <Badge tone="compliant">{selectedCandidate?.version ?? "Candidate"}</Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {viewMode === "watch-outs"
              ? "Use this view to spot anything that still needs a quick human check."
              : viewMode === "what got better"
                ? "Use this view to see the main improvements you should expect."
                : "Expected behavior once backend comparison inference is connected."}
          </p>
          <div className="mt-4 space-y-2">
            {(selectedCandidate?.preview.candidate ?? []).map((item) => (
              <div key={item} className="rounded-xl border border-brandBlue/15 bg-white px-3 py-3 text-sm text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
