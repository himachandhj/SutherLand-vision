"use client";

import { useRef, useState } from "react";

function formatPlaygroundDetection(detection) {
  if (detection.helmet || detection.vest || detection.shoes) {
    return `${detection.class} | Helmet: ${detection.helmet ?? "?"} | Vest: ${detection.vest ?? "?"} | Shoes: ${detection.shoes ?? "?"}`;
  }
  if (detection.zone_status) {
    const severity = detection.severity ? ` | Severity: ${detection.severity}` : "";
    const tracked = detection.tracked_object_id ? ` | Track: ${detection.tracked_object_id}` : "";
    return `${detection.class} | Zone: ${detection.zone_status}${severity}${tracked}`;
  }
  if (["vehicles scanned", "avg speed km/h", "max speed km/h", "speeding violations"].includes(detection.class)) {
    return `${detection.class}: ${detection.confidence}`;
  }
  return `${detection.class} (${Math.round(detection.confidence * 100)}%)`;
}

export default function ModelPlayground({ activeUseCase, onProcessInput, playgroundState, selectedSample, sampleMedia }) {
  const fileInputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [loadedSampleVideos, setLoadedSampleVideos] = useState({});

  const processDroppedFile = async (file) => {
    if (!file) return;
    await onProcessInput("uploaded-file", file);
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await processDroppedFile(file);
    event.target.value = "";
  };

  return (
    <div className="grid grid-cols-2 gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Input</h2>
          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500">Image &amp; Video</span>
        </div>
        <input ref={fileInputRef} accept="image/*,video/*,.mp4,.avi,.mov,.mkv,.webm" className="hidden" type="file" onChange={handleFileChange} />
        <button
          className={`flex h-72 w-full flex-col items-center justify-center rounded-2xl border border-dashed text-center transition ${dragging ? "border-brandBlue bg-brandBlue/5" : "border-slate-300 bg-slate-50 hover:border-brandBlue hover:bg-white"}`}
          onDragEnter={() => setDragging(true)}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={async (event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            await processDroppedFile(file);
          }}
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          <div className="mb-3 rounded-full bg-white p-4 shadow-sm">
            <div className="h-8 w-8 rounded-lg border border-brandBlue/20 bg-brandBlue/5" />
          </div>
          <div className="text-lg font-semibold text-slate-900">Upload image or video</div>
          <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Drop files here or click to preview a sample inference for {activeUseCase.title}.</p>
        </button>
        {sampleMedia.length > 0 && (
          <div className="mt-8">
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Try a Sample</h3>
            <div className="mt-4 space-y-3">
              {sampleMedia.map((sample) => (
                <button
                  key={sample.id}
                  className={`w-full rounded-2xl border p-3 text-left transition ${selectedSample === sample.id ? "border-brandRed shadow-panel" : "border-slate-200 hover:border-brandBlue/40"}`}
                  onClick={() => onProcessInput(sample.id)}
                  type="button"
                >
                  <div className="relative h-40 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                    {sample.type === "video" ? (
                      <div className="relative h-full w-full bg-slate-900">
                        {!loadedSampleVideos[sample.id] && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="flex items-center gap-3 rounded-xl bg-black/40 px-4 py-2 text-xs font-semibold text-white">
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                              Loading sample…
                            </div>
                          </div>
                        )}
                        <video
                          className={`h-full w-full object-cover ${loadedSampleVideos[sample.id] ? "opacity-100" : "opacity-0"}`}
                          controls
                          muted
                          playsInline
                          preload="metadata"
                          src={sample.src}
                          onCanPlay={() => setLoadedSampleVideos((current) => ({ ...current, [sample.id]: true }))}
                          onError={() => setLoadedSampleVideos((current) => ({ ...current, [sample.id]: true }))}
                        />
                      </div>
                    ) : (
                      <img alt={sample.label} className="h-full w-full object-contain bg-white" src={sample.src} />
                    )}
                  </div>
                  <div className="px-1 pb-1 pt-3 text-sm font-medium text-slate-700">{sample.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Output</h2>
          <span className="text-sm text-slate-500">Inference Preview</span>
        </div>
        {playgroundState.status === "idle" ? (
          <div className="flex h-[28rem] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-lg font-medium text-slate-400">Awaiting Input</div>
        ) : playgroundState.status === "loading" ? (
          <div className="flex h-[28rem] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brandBlue" />
            <div className="mt-4 text-lg font-medium text-slate-700">Generating preview...</div>
            <p className="mt-2 text-sm text-slate-500">Running backend inference for {playgroundState.sourceLabel || activeUseCase.title}.</p>
          </div>
        ) : playgroundState.status === "error" ? (
          <div className="flex h-[28rem] items-center justify-center rounded-2xl border border-brandRed/20 bg-brandRed/5 px-8 text-center text-lg font-medium text-slate-700">{playgroundState.error}</div>
        ) : (
          <div>
            <div className="relative flex h-[28rem] items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 p-4">
              {playgroundState.outputVideoUrl ? (
                <video
                  className="max-h-full max-w-full rounded-xl object-contain"
                  controls
                  playsInline
                  preload="metadata"
                  poster={playgroundState.imageBase64 || undefined}
                  src={playgroundState.outputVideoUrl}
                />
              ) : (
                <img alt="Processed output" className="max-h-full max-w-full rounded-xl object-contain" src={playgroundState.imageBase64} />
              )}
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 text-xs text-slate-400">Source: {playgroundState.sourceLabel}</div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Detections</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {playgroundState.detections.length > 0 ? playgroundState.detections.map((detection) => (
                  <div key={`${detection.class}-${detection.confidence}`} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    {formatPlaygroundDetection(detection)}
                  </div>
                )) : (
                  <div className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">No detections returned</div>
                )}
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                className="rounded-xl border border-brandBlue px-4 py-3 text-sm font-semibold text-brandBlue transition hover:bg-brandBlue hover:text-white"
                onClick={() => window.open(playgroundState.outputVideoUrl || playgroundState.imageBase64, "_blank")}
                type="button"
              >
                Preview in Browser
              </button>
              <button
                className="rounded-xl bg-brandBlue px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95"
                onClick={() => {
                  const link = document.createElement("a");
                  link.href = playgroundState.outputVideoUrl || playgroundState.imageBase64;
                  link.download = playgroundState.outputVideoUrl ? "analysis-result.mp4" : "analysis-result.jpg";
                  link.click();
                }}
                type="button"
              >
                Download Results
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
