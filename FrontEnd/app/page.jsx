"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import DetailPage from "../components/DetailPage";
import LandingPage from "../components/LandingPage";
import UseCasesPage from "../components/UseCasesPage";
import {
  API_BASE_URL,
  categoryDetails,
  getIntegrationDefaults,
  integrationSupportedUseCases,
  resolveBackendUrl,
  sampleMediaByUseCase,
  sectionLabelToParam,
  sectionParamToLabel,
  tabLabelToParam,
  tabParamToLabel,
  useCaseToAnalyticsDashboardSlug,
  useCases,
} from "../components/visionLabConfig";

function buildEmptyIntegrationOverview() {
  return {
    connected: false,
    processing: false,
    message: "",
    last_sync_at: null,
    connection: null,
    recent_runs: [],
    input_videos: [],
    output_videos: [],
    summary: {},
  };
}

const DEFAULT_REGION_ALERT_RULE_CONFIG = {
  trigger_type: "enter",
  alert_delay_sec: 0,
  confidence_threshold: 0.5,
  alerts_enabled: true,
};

function zonePointsNormalizedFromRoi(roi) {
  if (!roi) return null;
  return [
    [roi.x, roi.y],
    [roi.x + roi.width, roi.y],
    [roi.x + roi.width, roi.y + roi.height],
    [roi.x, roi.y + roi.height],
  ];
}

function normalizeRegionAlertsRuleConfig(ruleConfig) {
  if (!ruleConfig || typeof ruleConfig !== "object") {
    return DEFAULT_REGION_ALERT_RULE_CONFIG;
  }

  const triggerType = ruleConfig.trigger_type === "exit" ? "exit" : "enter";
  const alertDelay = Number(ruleConfig.alert_delay_sec);
  const confidenceThreshold = Number(ruleConfig.confidence_threshold);

  return {
    trigger_type: triggerType,
    alert_delay_sec: Number.isFinite(alertDelay) ? Math.max(0, Math.min(10, Math.round(alertDelay))) : 0,
    confidence_threshold: Number.isFinite(confidenceThreshold)
      ? Math.max(0.1, Math.min(1, Math.round(confidenceThreshold * 100) / 100))
      : 0.5,
    alerts_enabled: typeof ruleConfig.alerts_enabled === "boolean"
      ? ruleConfig.alerts_enabled
      : true,
  };
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <VisionLabPage />
    </Suspense>
  );
}

function VisionLabPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedSample, setSelectedSample] = useState(null);
  const [playgroundState, setPlaygroundState] = useState({
    status: "idle",
    imageBase64: "",
    outputVideoUrl: "",
    detections: [],
    sourceLabel: "",
    error: "",
  });
  const [regionAlertsRoi, setRegionAlertsRoi] = useState(null);
  const [regionAlertsRuleConfig, setRegionAlertsRuleConfig] = useState(DEFAULT_REGION_ALERT_RULE_CONFIG);
  const [integrationForm, setIntegrationForm] = useState({
    endpoint: "http://127.0.0.1:9000",
    access_key: "demo-access-key",
    secret_key: "demo-secret-key",
    bucket: "vision-demo",
    input_prefix: "ppe/input/",
    output_prefix: "ppe/output/",
  });
  const [integrationOverview, setIntegrationOverview] = useState(buildEmptyIntegrationOverview);
  const [isConnectingIntegration, setIsConnectingIntegration] = useState(false);
  const [integrationError, setIntegrationError] = useState("");
  const [integrationMode, setIntegrationMode] = useState("manual");
  const [integrationFetchCount, setIntegrationFetchCount] = useState(10);
  const [integrationFetchedVideos, setIntegrationFetchedVideos] = useState([]);
  const [selectedIntegrationVideos, setSelectedIntegrationVideos] = useState([]);
  const [isFetchingIntegrationVideos, setIsFetchingIntegrationVideos] = useState(false);
  const [isProcessingIntegrationVideos, setIsProcessingIntegrationVideos] = useState(false);
  const [integrationFetchMessage, setIntegrationFetchMessage] = useState("");
  const [integrationProcessMessage, setIntegrationProcessMessage] = useState("");
  const [expandedRunId, setExpandedRunId] = useState(null);

  const currentView =
    searchParams.get("view") === "detail"
      ? "detail"
      : searchParams.get("view") === "usecases"
        ? "usecases"
        : "landing";

  const activeTab = tabParamToLabel[searchParams.get("tab")] ?? "Model Playground";
  const requestedSection = sectionParamToLabel[searchParams.get("section")] ?? "Safety & Compliance";
  const requestedUseCaseId = searchParams.get("usecase") ?? "ppe-detection";
  const activeUseCase = useCases.find((useCase) => useCase.id === requestedUseCaseId) ?? useCases[0];
  const activeUseCaseId = activeUseCase.id;
  const activeSection = categoryDetails.some((section) => section.label === requestedSection) ? requestedSection : activeUseCase.category;
  const sampleMedia = sampleMediaByUseCase[activeUseCaseId] ?? [];

  const normalizeIntegrationOverview = (payload) => ({
    connected: Boolean(payload?.connected),
    processing: Boolean(payload?.processing),
    message: payload?.message ?? "",
    last_sync_at: payload?.last_sync_at ?? null,
    connection: payload?.connection ?? null,
    recent_runs: Array.isArray(payload?.recent_runs) ? payload.recent_runs : [],
    input_videos: Array.isArray(payload?.input_videos) ? payload.input_videos : [],
    output_videos: Array.isArray(payload?.output_videos) ? payload.output_videos : [],
    summary: payload?.summary && typeof payload.summary === "object" ? payload.summary : {},
  });

  const fetchIntegrationOverview = async () => {
    if (!integrationSupportedUseCases.has(activeUseCaseId)) {
      setIntegrationOverview(buildEmptyIntegrationOverview());
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/integrations/minio/status?use_case_id=${encodeURIComponent(activeUseCaseId)}`);
      if (!response.ok) throw new Error("Unable to load MinIO integration status.");
      const data = await response.json();
      setIntegrationOverview(normalizeIntegrationOverview(data));
      if (data?.connection) {
        setIntegrationForm((current) => ({
          ...current,
          endpoint: data.connection.endpoint ?? current.endpoint,
          bucket: data.connection.bucket ?? current.bucket,
          input_prefix: data.connection.input_prefix ?? current.input_prefix,
          output_prefix: data.connection.output_prefix ?? current.output_prefix,
        }));
        setIntegrationMode(data.connection.processing_mode ?? "manual");
        if (activeUseCaseId === "region-alerts") {
          setRegionAlertsRuleConfig(normalizeRegionAlertsRuleConfig(data.connection.rule_config));
        }
      } else {
        const defaults = getIntegrationDefaults(activeUseCaseId);
        setIntegrationForm((current) => ({ ...current, input_prefix: defaults.input_prefix, output_prefix: defaults.output_prefix }));
        if (activeUseCaseId === "region-alerts") {
          setRegionAlertsRuleConfig(DEFAULT_REGION_ALERT_RULE_CONFIG);
        }
      }
      setIntegrationError("");
    } catch (error) {
      setIntegrationError(error instanceof Error ? error.message : "Unable to load MinIO integration status.");
    }
  };

  const handleIntegrationFieldChange = (field, value) => {
    setIntegrationForm((current) => ({ ...current, [field]: value }));
  };

  const handleIntegrationConnect = async (modeOverride = integrationMode) => {
    const resolvedMode = modeOverride === "auto" || modeOverride === "manual" ? modeOverride : integrationMode;
    setIsConnectingIntegration(true);
    setIntegrationError("");
    try {
      const regionAlertZonePoints =
        activeUseCaseId === "region-alerts" ? zonePointsNormalizedFromRoi(regionAlertsRoi) : undefined;
      const regionAlertRuleConfig =
        activeUseCaseId === "region-alerts" ? normalizeRegionAlertsRuleConfig(regionAlertsRuleConfig) : undefined;
      const response = await fetch(`${API_BASE_URL}/api/integrations/minio/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...integrationForm,
          use_case_id: activeUseCaseId,
          processing_mode: resolvedMode,
          ...(activeUseCaseId === "region-alerts"
            ? {
                zone_points_normalized: regionAlertZonePoints,
                rule_config: regionAlertRuleConfig,
              }
            : {}),
        }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.detail ?? "Unable to connect to MinIO.");
      }
      const data = await response.json();
      setIntegrationOverview(normalizeIntegrationOverview(data));
      setIntegrationMode(data?.connection?.processing_mode ?? resolvedMode);
    } catch (error) {
      setIntegrationError(error instanceof Error ? error.message : "Unable to connect to MinIO.");
    } finally {
      setIsConnectingIntegration(false);
    }
  };

  const handleIntegrationModeChange = async (nextMode) => {
    setIntegrationMode(nextMode);
    setIntegrationFetchMessage("");
    setIntegrationProcessMessage("");
    if (!integrationOverview.connected) return;
    await handleIntegrationConnect(nextMode);
  };

  const handleIntegrationFetchVideos = async () => {
    if (!integrationSupportedUseCases.has(activeUseCaseId)) return;
    setIsFetchingIntegrationVideos(true);
    setIntegrationFetchMessage("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/integrations/minio/input-videos?use_case_id=${encodeURIComponent(activeUseCaseId)}&limit=${encodeURIComponent(String(integrationFetchCount))}`,
      );
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.detail ?? "Unable to fetch MinIO videos.");
      }
      const data = await response.json();
      const videos = Array.isArray(data?.videos) ? data.videos : [];
      setIntegrationFetchedVideos(videos);
      setSelectedIntegrationVideos((current) => current.filter((key) => videos.some((video) => video.object_key === key && video.status !== "completed" && video.status !== "processing")));
      setIntegrationFetchMessage(
        `Fetched ${Number(data?.fetched_count ?? videos.length)} video${Number(data?.fetched_count ?? videos.length) === 1 ? "" : "s"} from ${activeUseCase.title} input storage.`,
      );
      setIntegrationError("");
    } catch (error) {
      setIntegrationFetchMessage(`✗ ${error instanceof Error ? error.message : "Unable to fetch MinIO videos."}`);
    } finally {
      setIsFetchingIntegrationVideos(false);
    }
  };

  const handleIntegrationProcessSelected = async () => {
    if (selectedIntegrationVideos.length === 0) return;
    setIsProcessingIntegrationVideos(true);
    setIntegrationProcessMessage("");
    try {
      const regionAlertZonePoints =
        activeUseCaseId === "region-alerts" ? zonePointsNormalizedFromRoi(regionAlertsRoi) : undefined;
      const regionAlertRuleConfig =
        activeUseCaseId === "region-alerts" ? normalizeRegionAlertsRuleConfig(regionAlertsRuleConfig) : undefined;
      const response = await fetch(`${API_BASE_URL}/api/integrations/minio/process-selected`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          use_case_id: activeUseCaseId,
          object_keys: selectedIntegrationVideos,
          ...(activeUseCaseId === "region-alerts"
            ? {
                zone_points_normalized: regionAlertZonePoints,
                rule_config: regionAlertRuleConfig,
              }
            : {}),
        }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.detail ?? "Unable to queue selected videos.");
      }
      const data = await response.json();
      if (data?.overview) {
        setIntegrationOverview(normalizeIntegrationOverview(data.overview));
      } else {
        await fetchIntegrationOverview();
      }
      setIntegrationProcessMessage(data?.message ?? "Selected videos have been queued.");
      setSelectedIntegrationVideos([]);
      await handleIntegrationFetchVideos();
    } catch (error) {
      setIntegrationProcessMessage(`✗ ${error instanceof Error ? error.message : "Unable to queue selected videos."}`);
    } finally {
      setIsProcessingIntegrationVideos(false);
    }
  };

  useEffect(() => {
    if (!integrationSupportedUseCases.has(activeUseCaseId)) return;
    fetchIntegrationOverview();
  }, [activeUseCaseId]);

  useEffect(() => {
    if (!integrationSupportedUseCases.has(activeUseCaseId) || !integrationOverview.connected) return;
    const poller = setInterval(fetchIntegrationOverview, 5000);
    return () => clearInterval(poller);
  }, [activeUseCaseId, integrationOverview.connected, integrationOverview.processing]);

  useEffect(() => {
    setIntegrationFetchedVideos([]);
    setSelectedIntegrationVideos([]);
    setIntegrationFetchMessage("");
    setIntegrationProcessMessage("");
    setExpandedRunId(null);
  }, [activeUseCaseId]);

  useEffect(() => {
    setSelectedSample(null);
    setPlaygroundState({
      status: "idle",
      imageBase64: "",
      outputVideoUrl: "",
      detections: [],
      sourceLabel: "",
      error: "",
    });
    const defaults = getIntegrationDefaults(activeUseCaseId);
    setIntegrationOverview(buildEmptyIntegrationOverview());
    setIntegrationForm((current) => ({
      ...current,
      input_prefix: defaults.input_prefix,
      output_prefix: defaults.output_prefix,
    }));
    setIntegrationMode("manual");
    setIntegrationError("");
    setIntegrationFetchMessage("");
    setIntegrationProcessMessage("");
    setRegionAlertsRuleConfig(DEFAULT_REGION_ALERT_RULE_CONFIG);
  }, [activeUseCaseId]);

  const navigateTo = (nextView, nextTab, method = "push", nextSection = activeSection, useCaseId) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextView === "detail") {
      params.set("view", "detail");
      params.set("tab", tabLabelToParam[nextTab] ?? "playground");
      params.set("section", sectionLabelToParam[nextSection] ?? "safety-compliance");
      if (useCaseId) params.set("usecase", useCaseId);
    } else if (nextView === "usecases") {
      params.set("view", "usecases");
      params.delete("tab");
      params.set("section", sectionLabelToParam[nextSection] ?? "safety-compliance");
      params.delete("usecase");
    } else {
      params.delete("view");
      params.delete("tab");
      params.delete("section");
      params.delete("usecase");
    }
    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    router[method](href, { scroll: false });
  };

  const runPlaygroundPreview = async (file, sourceLabel, previewOptions = {}) => {
    setPlaygroundState({ status: "loading", imageBase64: "", outputVideoUrl: "", detections: [], sourceLabel, error: "" });
    navigateTo("detail", "Model Playground", "replace", activeSection, activeUseCaseId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("use_case_id", activeUseCaseId);
      if (previewOptions.fireDetectionMode) {
        formData.append("fire_detection_mode", previewOptions.fireDetectionMode);
      }
      if (previewOptions.roi) {
        formData.append("roi_json", JSON.stringify(previewOptions.roi));
      }
      const response = await fetch(`${API_BASE_URL}/api/playground-preview`, { method: "POST", body: formData });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail ?? "Playground preview failed.");
      }
      const data = await response.json();
      setPlaygroundState({
        status: "success",
        imageBase64: data.image_base64 ?? "",
        outputVideoUrl: resolveBackendUrl(data.output_video_url ?? ""),
        detections: data.detections ?? [],
        sourceLabel,
        error: "",
      });
    } catch (error) {
      setPlaygroundState({
        status: "error",
        imageBase64: "",
        outputVideoUrl: "",
        detections: [],
        sourceLabel,
        error: error instanceof Error ? error.message : "Unable to generate playground preview.",
      });
    }
  };

  const handleProcessInput = async (sampleId, fileOverride, previewOptions = {}) => {
    const matchingSample = sampleMedia.find((sample) => sample.id === sampleId);
    const sourceLabel = fileOverride?.name ?? matchingSample?.label ?? "Uploaded File";
    setSelectedSample(sampleId);
    if (fileOverride) {
      await runPlaygroundPreview(fileOverride, sourceLabel, previewOptions);
      return;
    }
    if (!matchingSample) return;

    try {
      setPlaygroundState({ status: "loading", imageBase64: "", outputVideoUrl: "", detections: [], sourceLabel, error: "" });
      navigateTo("detail", "Model Playground", "replace", activeSection, activeUseCaseId);
      const formData = new FormData();
      formData.append("sample_name", matchingSample.label);
      formData.append("use_case_id", activeUseCaseId);
      if (previewOptions.fireDetectionMode) {
        formData.append("fire_detection_mode", previewOptions.fireDetectionMode);
      }
      if (previewOptions.roi) {
        formData.append("roi_json", JSON.stringify(previewOptions.roi));
      }
      const response = await fetch(`${API_BASE_URL}/api/playground-preview-sample`, { method: "POST", body: formData });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail ?? "Unable to load sample media.");
      }
      const data = await response.json();
      setPlaygroundState({
        status: "success",
        imageBase64: data.image_base64 ?? "",
        outputVideoUrl: resolveBackendUrl(data.output_video_url ?? ""),
        detections: data.detections ?? [],
        sourceLabel,
        error: "",
      });
    } catch (error) {
      setPlaygroundState({
        status: "error",
        imageBase64: "",
        outputVideoUrl: "",
        detections: [],
        sourceLabel,
        error: error instanceof Error ? error.message : "Unable to process sample media.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {currentView === "landing" && (
        <LandingPage onExploreSection={(section) => navigateTo("usecases", undefined, "push", section)} />
      )}
      {currentView === "usecases" && (
        <UseCasesPage
          activeSection={activeSection}
          onChangeSection={(section) => navigateTo("usecases", undefined, "push", section)}
          onGoHome={() => navigateTo("landing")}
          onOpenUseCase={(useCaseId, category) => navigateTo("detail", "Model Playground", "push", category, useCaseId)}
        />
      )}
      {currentView === "detail" && (
        <DetailPage
          activeTab={activeTab}
          activeUseCase={activeUseCase}
          onBack={() => navigateTo("usecases", undefined, "push", activeUseCase.category)}
          onGoHome={() => navigateTo("landing")}
          onProcessInput={handleProcessInput}
          playgroundState={playgroundState}
          selectedSample={selectedSample}
          sampleMedia={sampleMedia}
          persistedRegionAlertsRoi={regionAlertsRoi}
          onRegionAlertsRoiChange={setRegionAlertsRoi}
          regionAlertsRuleConfig={regionAlertsRuleConfig}
          onRegionAlertsRuleConfigChange={(nextConfig) => setRegionAlertsRuleConfig(normalizeRegionAlertsRuleConfig(nextConfig))}
          setActiveTab={(tab) => navigateTo("detail", tab, "push", activeSection, activeUseCaseId)}
          integrationForm={integrationForm}
          integrationOverview={integrationOverview}
          integrationError={integrationError}
          isConnectingIntegration={isConnectingIntegration}
          integrationMode={integrationMode}
          integrationFetchCount={integrationFetchCount}
          integrationFetchedVideos={integrationFetchedVideos}
          selectedIntegrationVideos={selectedIntegrationVideos}
          isFetchingIntegrationVideos={isFetchingIntegrationVideos}
          isProcessingIntegrationVideos={isProcessingIntegrationVideos}
          integrationFetchMessage={integrationFetchMessage}
          integrationProcessMessage={integrationProcessMessage}
          expandedRunId={expandedRunId}
          onIntegrationFieldChange={handleIntegrationFieldChange}
          onIntegrationConnect={handleIntegrationConnect}
          onIntegrationModeChange={handleIntegrationModeChange}
          onIntegrationFetchCountChange={setIntegrationFetchCount}
          onIntegrationFetchVideos={handleIntegrationFetchVideos}
          onIntegrationSelectionChange={setSelectedIntegrationVideos}
          onIntegrationProcessSelected={handleIntegrationProcessSelected}
          onToggleRunAnalysis={(runId) => setExpandedRunId((current) => (current === runId ? null : runId))}
          onOpenAnalyticsDashboard={() => {
            const slug = useCaseToAnalyticsDashboardSlug[activeUseCaseId] ?? activeUseCaseId;
            router.push(`/dashboard/${slug}`);
          }}
        />
      )}
    </div>
  );
}
