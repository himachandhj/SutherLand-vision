"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function formatPlaygroundDetection(detection) {
  if (detection.helmet !== undefined || detection.vest !== undefined || detection.shoes !== undefined) {
    const parts = [];
    if (detection.helmet !== undefined) parts.push(`Helmet: ${detection.helmet}`);
    if (detection.vest !== undefined) parts.push(`Vest: ${detection.vest}`);
    if (detection.shoes !== undefined) parts.push(`Shoes: ${detection.shoes}`);
    return `${detection.class} | ${parts.join(" | ")}`;
  }
  if (detection.object_type || detection.detected_speed_kmh !== undefined) {
    const speed = detection.detected_speed_kmh !== undefined ? ` | Speed: ${detection.detected_speed_kmh} km/h` : "";
    const limit = detection.speed_limit_kmh !== undefined ? ` | Limit: ${detection.speed_limit_kmh} km/h` : "";
    const status = detection.status ? ` | Status: ${detection.status}` : "";
    return `${detection.class}${speed}${limit}${status}`;
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

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function buildRoiFromPoints(start, end) {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  if (width < 0.01 || height < 0.01) return null;
  return {
    x: clamp01(left),
    y: clamp01(top),
    width: clamp01(width),
    height: clamp01(height),
  };
}

function roiStyle(roi) {
  return {
    left: `${clamp01(roi?.x ?? 0) * 100}%`,
    top: `${clamp01(roi?.y ?? 0) * 100}%`,
    width: `${clamp01(roi?.width ?? 0) * 100}%`,
    height: `${clamp01(roi?.height ?? 0) * 100}%`,
  };
}

function previewKindFromFile(file) {
  const contentType = String(file?.type || "").toLowerCase();
  return contentType.startsWith("image/") ? "image" : "video";
}

function formatMetricValue(value, suffix = "") {
  const number = Number(value);
  if (Number.isFinite(number)) {
    if (suffix === "%") return `${number.toFixed(1)}${suffix}`;
    if (number % 1 === 0) return `${number}${suffix}`;
    return `${number.toFixed(2)}${suffix}`;
  }
  return value ?? "—";
}

function normalizeSeverityLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "none" || normalized === "n/a") return "";
  if (normalized === "critical" || normalized === "high") return "High";
  if (normalized === "medium") return "Medium";
  if (normalized === "low") return "Low";
  return "";
}

function getHighestSeverityLabel(metrics, detections) {
  const severityRank = { Low: 1, Medium: 2, High: 3 };
  let bestLabel = "";

  const candidates = [
    metrics?.severity,
    metrics?.highest_severity,
    metrics?.max_severity_label,
    ...(Array.isArray(detections)
      ? detections.flatMap((detection) => [
          detection?.severity,
          detection?.alert_severity,
          detection?.risk_level,
        ])
      : []),
  ];

  candidates.forEach((candidate) => {
    const label = normalizeSeverityLabel(candidate);
    if (severityRank[label] > (severityRank[bestLabel] ?? 0)) {
      bestLabel = label;
    }
  });

  return bestLabel;
}

function getCrackDetectionCount(metrics, detections) {
  const countCandidates = [
    metrics?.defect_count,
    metrics?.crack_count,
    metrics?.detections_count,
    metrics?.crack_detections,
    metrics?.total_defects,
    metrics?.total_cracks,
  ];

  for (const candidate of countCandidates) {
    const count = Number(candidate);
    if (Number.isFinite(count) && count >= 0) return count;
  }

  return Array.isArray(detections) ? detections.length : 0;
}

const CRACK_PREVIEW_FRAME_CLASS =
  "relative flex min-h-[16rem] w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 p-4";

const CRACK_PREVIEW_MEDIA_CLASS = "block max-h-[20rem] max-w-full rounded-xl object-contain";

export default function ModelPlayground({
  activeUseCase,
  onProcessInput,
  playgroundState,
  selectedSample,
  sampleMedia,
  persistedRegionAlertsRoi,
  onRegionAlertsRoiChange,
}) {
  const fileInputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [loadedSampleVideos, setLoadedSampleVideos] = useState({});
  const [currentInput, setCurrentInput] = useState(null);
  const [fireDetectionMode, setFireDetectionMode] = useState("both");
  const [ppeDetectionMode, setPpeDetectionMode] = useState("helmet_vest");
  const [speedDetectionClass, setSpeedDetectionClass] = useState("all");
  const [roiRect, setRoiRect] = useState(null);
  const [roiStart, setRoiStart] = useState(null);
  const [roiDraft, setRoiDraft] = useState(null);

  const supportsFireMode = activeUseCase.id === "fire-detection";
  const supportsPpeMode = activeUseCase.id === "ppe-detection";
  const supportsRoi = activeUseCase.id === "fire-detection" || activeUseCase.id === "region-alerts";
  const isSpeedEstimation = activeUseCase.id === "speed-estimation";
  const isCrackDetection = activeUseCase.id === "crack-detection";
  const isUnsafeBehaviorDetection = activeUseCase.id === "unsafe-behavior-detection";
  const isLegacyClasswiseCounting = activeUseCase.id === "class-wise-object-counting";
  const showsPreviewGuidance = supportsFireMode || supportsPpeMode || supportsRoi || isSpeedEstimation || isUnsafeBehaviorDetection;
  const activeSampleId = currentInput?.kind === "sample" ? currentInput.sampleId : selectedSample;
  const showsCrackUploadedFilePreview = isCrackDetection && currentInput?.kind === "file";

  useEffect(() => {
    return () => {
      if (currentInput?.kind === "file" && String(currentInput.previewSrc || "").startsWith("blob:")) {
        URL.revokeObjectURL(currentInput.previewSrc);
      }
    };
  }, [currentInput]);

  useEffect(() => {
    setCurrentInput(null);
    setFireDetectionMode("both");
    setPpeDetectionMode("helmet_vest");
    setSpeedDetectionClass("all");
    setRoiRect(activeUseCase.id === "region-alerts" ? persistedRegionAlertsRoi ?? null : null);
    setRoiStart(null);
    setRoiDraft(null);
    setLoadedSampleVideos({});
  }, [activeUseCase.id]);

  useEffect(() => {
    if (activeUseCase.id !== "region-alerts") return;
    setRoiRect(persistedRegionAlertsRoi ?? null);
  }, [activeUseCase.id, persistedRegionAlertsRoi]);

  const previewOptions = useMemo(
    () => ({
      fireDetectionMode: supportsFireMode ? fireDetectionMode : undefined,
      ppe_detection_mode: supportsPpeMode ? ppeDetectionMode : undefined,
      speed_detection_class: isSpeedEstimation ? speedDetectionClass : undefined,
      roi: supportsRoi && roiRect ? roiRect : undefined,
    }),
    [fireDetectionMode, isSpeedEstimation, ppeDetectionMode, roiRect, speedDetectionClass, supportsFireMode, supportsPpeMode, supportsRoi],
  );

  const replaceCurrentInput = (nextInput) => {
    setCurrentInput((current) => {
      if (current?.kind === "file" && String(current.previewSrc || "").startsWith("blob:") && current.previewSrc !== nextInput?.previewSrc) {
        URL.revokeObjectURL(current.previewSrc);
      }
      return nextInput;
    });
  };

  const crackDetectionCount = getCrackDetectionCount(playgroundState.metrics, playgroundState.detections);
  const crackHighestSeverity = getHighestSeverityLabel(playgroundState.metrics, playgroundState.detections);

  const runCurrentInput = async (inputOverride = currentInput) => {
    if (!inputOverride) return;
    if (inputOverride.kind === "file") {
      await onProcessInput("uploaded-file", inputOverride.file, previewOptions);
      return;
    }
    await onProcessInput(inputOverride.sampleId, undefined, previewOptions);
  };

  const processDroppedFile = async (file) => {
    if (!file) return;
    const nextInput = {
      kind: "file",
      file,
      label: file.name,
      previewSrc: URL.createObjectURL(file),
      previewType: previewKindFromFile(file),
    };
    replaceCurrentInput(nextInput);
    await runCurrentInput(nextInput);
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await processDroppedFile(file);
    event.target.value = "";
  };

  const getPointerPoint = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp01((event.clientX - rect.left) / Math.max(rect.width, 1)),
      y: clamp01((event.clientY - rect.top) / Math.max(rect.height, 1)),
    };
  };

  const handlePreviewPointerDown = (event) => {
    if (!supportsRoi || !currentInput) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = getPointerPoint(event);
    setRoiStart(point);
    setRoiDraft(buildRoiFromPoints(point, point));
  };

  const handlePreviewPointerMove = (event) => {
    if (!roiStart) return;
    event.preventDefault();
    setRoiDraft(buildRoiFromPoints(roiStart, getPointerPoint(event)));
  };

  const handlePreviewPointerUp = (event) => {
    if (!roiStart) return;
    event.preventDefault();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const nextRoi = buildRoiFromPoints(roiStart, getPointerPoint(event));
    setRoiStart(null);
    setRoiDraft(null);
    setRoiRect(nextRoi);
    if (activeUseCase.id === "region-alerts") {
      onRegionAlertsRoiChange?.(nextRoi);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Input</h2>
          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500">Image &amp; Video</span>
        </div>

        <input ref={fileInputRef} accept="image/*,video/*,.mp4,.avi,.mov,.mkv,.webm" className="hidden" type="file" onChange={handleFileChange} />
        {showsCrackUploadedFilePreview ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel">
            <div className={CRACK_PREVIEW_FRAME_CLASS}>
              {currentInput.previewType === "video" ? (
                <video
                  className={CRACK_PREVIEW_MEDIA_CLASS}
                  controls
                  playsInline
                  preload="metadata"
                  src={currentInput.previewSrc}
                />
              ) : (
                <img alt={currentInput.label} className={CRACK_PREVIEW_MEDIA_CLASS} src={currentInput.previewSrc} />
              )}
            </div>
            <div className="mt-3 text-sm font-medium text-slate-700">{currentInput.label}</div>
          </div>
        ) : (
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
        )}
        {sampleMedia.length > 0 && (
          <div className="mt-8">
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Try a Sample</h3>
            <div className="mt-4 space-y-3">
              {sampleMedia.map((sample) => (
                <button
                  key={sample.id}
                  className={`w-full rounded-2xl border p-3 text-left transition ${activeSampleId === sample.id ? "border-brandRed shadow-panel" : "border-slate-200 hover:border-brandBlue/40"}`}
                  onClick={async () => {
                    const nextInput = {
                      kind: "sample",
                      sampleId: sample.id,
                      label: sample.label,
                      previewSrc: sample.src,
                      previewType: sample.type,
                    };
                    replaceCurrentInput(nextInput);
                    await runCurrentInput(nextInput);
                  }}
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
        {isCrackDetection ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="rounded-xl bg-brandBlue px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!currentInput || playgroundState.status === "loading"}
              onClick={() => void runCurrentInput()}
              type="button"
            >
              {playgroundState.status === "loading" ? "Running defect preview..." : "Run Defect Preview"}
            </button>
            {currentInput?.kind === "file" ? (
              <button
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-brandBlue/30"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                Upload Another File
              </button>
            ) : null}
          </div>
        ) : null}
        {showsPreviewGuidance ? (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">
              {isSpeedEstimation ? "Preview guidance" : "Custom preview options"}
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {isSpeedEstimation
                ? "Upload your own input or pick a sample, then re-run the preview with motion-aware expectations in mind."
                : "Upload your own input or pick a sample, then re-run the preview with the settings below."}
            </p>

            {isLegacyClasswiseCounting ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                Class-wise counting is now included in Vehicle Analytics under Speed Estimation. This preview remains available only for direct access and backward compatibility.
              </div>
            ) : null}

            {isSpeedEstimation ? (
              <div className="mt-4 rounded-2xl border border-brandBlue/10 bg-brandBlue/[0.03] px-4 py-4 text-sm text-slate-600">
                <p>Vehicle Analytics tracks moving objects across frames, estimates speed from motion, and summarizes class-wise vehicle counts. Use video input for the most meaningful results.</p>
                <p className="mt-2">Image previews may only show object detection; speed requires motion across video frames.</p>
              </div>
            ) : null}

            {isUnsafeBehaviorDetection ? (
              <div className="mt-4 rounded-2xl border border-brandBlue/10 bg-brandBlue/[0.03] px-4 py-4 text-sm text-slate-600">
                <p>Unsafe Behavior Detection uses a smoking YOLO model at <span className="font-semibold">BackEnd/models/unsafe_behavior/smoking_best.pt</span> and a COCO model for person + cell phone association.</p>
                <p className="mt-2">Upload images or videos containing smoking or mobile phone usage to preview combined unsafe behavior detections.</p>
              </div>
            ) : null}

            {supportsPpeMode ? (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">PPE detection mode</div>
                <div className="mt-2 inline-flex flex-wrap rounded-xl border border-slate-200 bg-white p-1">
                  {[
                    { value: "helmet", label: "Detect helmet only" },
                    { value: "vest", label: "Detect vest only" },
                    { value: "helmet_vest", label: "Detect helmet + vest" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                        ppeDetectionMode === option.value ? "bg-slate-50 text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}
                      onClick={() => setPpeDetectionMode(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {supportsFireMode ? (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Fire detection mode</div>
                <div className="mt-2 inline-flex rounded-xl border border-slate-200 bg-white p-1">
                  {[
                    { value: "fire", label: "Detect fire only" },
                    { value: "smoke", label: "Detect smoke only" },
                    { value: "both", label: "Detect both fire and smoke" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                        fireDetectionMode === option.value ? "bg-slate-50 text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}
                      onClick={() => setFireDetectionMode(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {isSpeedEstimation ? (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Vehicle filter</div>
                <div className="mt-2 inline-flex flex-wrap rounded-xl border border-slate-200 bg-white p-1">
                  {[
                    { value: "all", label: "All vehicles" },
                    { value: "car", label: "Car only" },
                    { value: "bus", label: "Bus only" },
                    { value: "truck", label: "Truck only" },
                    { value: "motorcycle", label: "Motorcycle only" },
                    { value: "bicycle", label: "Bicycle only" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                        speedDetectionClass === option.value ? "bg-slate-50 text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}
                      onClick={() => setSpeedDetectionClass(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {supportsRoi ? (
              <div className="mt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Region of interest</div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      {activeUseCase.id === "region-alerts"
                        ? "Drag a rectangle on the current input preview. Region Alerts will treat it as the restricted zone."
                        : "Drag a rectangle on the current input preview. Fire Detection will keep detections only inside that ROI."}
                    </p>
                    {activeUseCase.id === "region-alerts" ? (
                      <div className="mt-3 rounded-2xl border border-brandBlue/10 bg-brandBlue/[0.03] px-4 py-4 text-sm text-slate-600">
                        <p>Region Alerts currently detects person intrusion inside one selected region. Draw a region and rerun preview to test the rule.</p>
                        <p className="mt-2">Objects outside the selected region are ignored for alerts.</p>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {roiRect ? (
                      <span className="rounded-full border border-brandBlue/15 bg-brandBlue/[0.04] px-3 py-1 text-xs font-semibold text-brandBlue">
                        ROI selected
                      </span>
                    ) : null}
                    <button
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-brandBlue/30"
                      disabled={!roiRect}
                      onClick={() => {
                        setRoiRect(null);
                        if (activeUseCase.id === "region-alerts") {
                          onRegionAlertsRoiChange?.(null);
                        }
                      }}
                      type="button"
                    >
                      Clear ROI
                    </button>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                  {currentInput ? (
                    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
                      {currentInput.previewType === "video" ? (
                        <video
                          autoPlay
                          className="block h-72 w-full object-contain"
                          loop
                          muted
                          playsInline
                          src={currentInput.previewSrc}
                        />
                      ) : (
                        <img alt={currentInput.label} className="block h-72 w-full object-contain" src={currentInput.previewSrc} />
                      )}
                      <div
                        className="absolute inset-0 cursor-crosshair touch-none"
                        onPointerDown={handlePreviewPointerDown}
                        onPointerLeave={() => {
                          setRoiStart(null);
                          setRoiDraft(null);
                        }}
                        onPointerMove={handlePreviewPointerMove}
                        onPointerUp={handlePreviewPointerUp}
                      >
                        {roiRect ? (
                          <div className="absolute border-2 border-dashed border-amber-300 bg-amber-300/10" style={roiStyle(roiRect)}>
                            <span className="absolute left-0 top-0 bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">ROI</span>
                          </div>
                        ) : null}
                        {roiDraft ? (
                          <div className="absolute border-2 border-dashed border-white bg-white/10" style={roiStyle(roiDraft)} />
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center text-sm leading-6 text-slate-500">
                      Select a sample or upload a file first, then drag on the preview to define an ROI.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="rounded-xl bg-brandBlue px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!currentInput || playgroundState.status === "loading"}
                onClick={() => void runCurrentInput()}
                type="button"
              >
                {playgroundState.status === "loading"
                  ? "Running preview..."
                  : "Run Preview with Current Settings"}
              </button>
              {activeUseCase.id === "fire-detection" && currentInput?.previewType === "video" ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-700">
                  Fire Detection playground previews use a representative frame from the video.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
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
            <div className={isCrackDetection ? CRACK_PREVIEW_FRAME_CLASS : "relative flex h-[28rem] items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 p-4"}>
              {playgroundState.outputVideoUrl ? (
                <video
                  key={playgroundState.outputVideoUrl}
                  autoPlay
                  className={isCrackDetection ? CRACK_PREVIEW_MEDIA_CLASS : "max-h-full max-w-full rounded-xl object-contain"}
                  controls
                  muted
                  playsInline
                  preload="metadata"
                  poster={playgroundState.imageBase64 || undefined}
                  src={playgroundState.outputVideoUrl}
                />
              ) : (
                <img
                  alt="Processed output"
                  className={isCrackDetection ? CRACK_PREVIEW_MEDIA_CLASS : "max-h-full max-w-full rounded-xl object-contain"}
                  src={playgroundState.imageBase64}
                />
              )}
            </div>
            {isCrackDetection ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Inspection Summary</div>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <span className="text-sm text-slate-500">Defects detected</span>
                    <span className="text-base font-semibold text-slate-900">{crackDetectionCount}</span>
                  </div>
                  {crackHighestSeverity ? (
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <span className="text-sm text-slate-500">Highest severity</span>
                      <span className="text-base font-semibold text-slate-900">{crackHighestSeverity}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
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
            )}
            {isUnsafeBehaviorDetection && playgroundState.metrics ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  ["Total unsafe events", formatMetricValue(playgroundState.metrics.total_unsafe_events)],
                  ["Smoking events", formatMetricValue(playgroundState.metrics.smoking_events)],
                  ["Phone usage events", formatMetricValue(playgroundState.metrics.phone_usage_events)],
                  ["Frames analyzed", formatMetricValue(playgroundState.metrics.frames_analyzed)],
                  ["Frames with unsafe behavior", formatMetricValue(playgroundState.metrics.frames_with_unsafe_behavior)],
                  ["Unsafe rate", formatMetricValue(playgroundState.metrics.unsafe_rate_pct, "%")],
                  ["Max confidence", formatMetricValue(playgroundState.metrics.max_confidence)],
                  ["Average confidence", formatMetricValue(playgroundState.metrics.avg_confidence)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</div>
                    <div className="mt-2 text-xl font-semibold text-slate-900">{value}</div>
                  </div>
                ))}
              </div>
            ) : null}
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
