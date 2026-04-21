"use client";

import { useRef } from "react";
import { Database, Tag, UploadCloud } from "lucide-react";

import { Badge } from "../ui/badge";

const datasetSourceOptions = [
  { value: "upload", label: "Upload new files", helper: "Bring a ZIP or folder export from your site.", icon: UploadCloud },
  { value: "existing", label: "Use saved data", helper: "Reuse a data set already stored in the platform.", icon: Database },
  { value: "external", label: "Bring labels from another tool", helper: "Start from an export from CVAT, Label Studio, or a similar tool.", icon: Tag },
];

const labelingOptions = [
  { value: "already-labeled", label: "Already labeled", helper: "Fastest option when your boxes or tags already exist." },
  { value: "label-later", label: "Label it here later", helper: "Use a guided labeling flow before training begins." },
  { value: "import-external", label: "Bring labels from another tool", helper: "Use exports from tools your team already knows." },
];

function datasetStatusTone(status) {
  if (status === "ready" || status === "healthy") return "compliant";
  if (status === "uploading") return "warning";
  return "normal";
}

export default function DatasetSection({
  datasets,
  selectedDatasetId,
  selectedDataset,
  datasetSource,
  labelingMode,
  supportedFormats,
  datasetChecklist,
  onDatasetSelect,
  onDatasetSourceChange,
  onLabelingModeChange,
  onDatasetUpload,
}) {
  const uploadInputRef = useRef(null);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-2xl font-semibold text-slate-900">Your data</h3>
          <p className="mt-1 text-sm text-slate-500">Bring real examples from your site, then tell us whether labels are already ready.</p>
        </div>
        <Badge tone="normal">Step 1</Badge>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {datasetSourceOptions.map((option) => {
          const active = datasetSource === option.value;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              className={`rounded-2xl border p-4 text-left transition ${active ? "border-brandRed bg-brandRed/5 shadow-sm" : "border-slate-200 hover:border-brandBlue/30"}`}
              onClick={() => onDatasetSourceChange(option.value)}
              type="button"
            >
              <div className="flex items-center gap-3">
                <span className={`flex h-10 w-10 items-center justify-center rounded-full ${active ? "bg-brandRed text-white" : "bg-brandBlue/[0.08] text-brandBlue"}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="text-sm font-semibold text-slate-900">{option.label}</div>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">{option.helper}</p>
            </button>
          );
        })}
      </div>

      <input
        ref={uploadInputRef}
        accept=".zip,.json,.yaml,.yml"
        className="hidden"
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onDatasetUpload(file);
          event.target.value = "";
        }}
      />

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_0.85fr_1.1fr]">
        <div className="rounded-3xl border border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold text-slate-900">Upload a data bundle</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">Add images, short videos, or a ZIP from your site.</p>
            </div>
            <button
              className="rounded-xl bg-brandBlue px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95"
              onClick={() => uploadInputRef.current?.click()}
              type="button"
            >
              Select files
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {supportedFormats.map((format) => (
              <span key={format} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600">
                {format}
              </span>
            ))}
          </div>

          <div className="mt-5 grid gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">What good training data looks like</div>
              <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-500">
                <li>Use the same camera angles you care about.</li>
                <li>Include bright, dark, easy, and messy scenes.</li>
                <li>Show the tough cases you want the model to learn.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Need labels first?</div>
              <p className="mt-2 text-sm leading-6 text-slate-500">That is okay. Pick a label plan below and keep moving.</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Available data sets</div>
          {datasets.map((dataset) => {
            const active = dataset.id === selectedDatasetId;
            return (
              <button
                key={dataset.id}
                className={`w-full rounded-2xl border p-4 text-left transition ${active ? "border-brandRed bg-brandRed/5 shadow-sm" : "border-slate-200 hover:border-brandBlue/30"}`}
                onClick={() => onDatasetSelect(dataset.id)}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">{dataset.name}</div>
                  <Badge tone={datasetStatusTone(dataset.status)}>{dataset.status}</Badge>
                </div>
                <div className="mt-2 text-sm text-slate-500">{dataset.item_count} • {dataset.format}</div>
                <div className="mt-2 text-sm leading-6 text-slate-500">{dataset.note}</div>
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Selected data set</div>
              <div className="mt-2 text-xl font-semibold text-slate-900">{selectedDataset?.name ?? "No data selected yet"}</div>
            </div>
            {selectedDataset && <Badge tone={selectedDataset.labeled ? "compliant" : "warning"}>{selectedDataset.labeled ? "Labeled" : "Needs labels"}</Badge>}
          </div>

          {selectedDataset && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Source</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">{selectedDataset.source}</div>
                <p className="mt-2 text-sm text-slate-500">Updated {selectedDataset.updated_at}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Label status</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">{selectedDataset.annotation_mode}</div>
                <p className="mt-2 text-sm text-slate-500">We will use this to decide the next setup step later.</p>
              </div>
            </div>
          )}

          <div className="mt-5">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">How do you want to handle labels?</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {labelingOptions.map((option) => {
                const active = labelingMode === option.value;
                return (
                  <button
                    key={option.value}
                    className={`rounded-2xl border p-4 text-left transition ${active ? "border-brandRed bg-brandRed/5 shadow-sm" : "border-slate-200 bg-white hover:border-brandBlue/30"}`}
                    onClick={() => onLabelingModeChange(option.value)}
                    type="button"
                  >
                    <div className="text-sm font-semibold text-slate-900">{option.label}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{option.helper}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">What happens next</div>
            <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-600 md:grid-cols-2">
              {datasetChecklist.map((item) => (
                <li key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
