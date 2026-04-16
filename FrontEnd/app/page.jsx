"use client";

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import fireDetectionCover from "../FireDetection.webp";
import objectCountingCover from "../ObjectCounting.webp";
import objectTrackingCover from "../ObjectTracking.webp";
import ppeDetectionImage from "../PPE_Detection.png";
import queueIntelligenceImage from "../Queue_Intelligence.png";
import restrictedAreaCover from "../RestrictedArea.webp";
import speedEstimationCover from "../SpeedEstimation.jpeg";
import sutherlandLogo from "../Sutherland_logo.png";
import trafficVisibilityImage from "../Traffic_visibility .png";
import testPPEImage from "../Test_PPE.png";

const BRAND_BLUE = "#27235C";
const BRAND_RED = "#DE1B54";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const resolveBackendUrl = (value) => {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `${API_BASE_URL}${value}`;
};

// ── Use Cases (updated lineup) ───────────────────────────────────────────

const useCases = [
  {
    id: "object-counting",
    title: "Object Counting",
    description: "Count objects crossing a checkpoint to monitor throughput across production lines, docks, and conveyor lanes.",
    category: "Operations Intelligence",
    accent: BRAND_BLUE,
    image: objectCountingCover,
    backstory: "Operations teams need a reliable throughput view without waiting for custom models. This view tracks how many objects move through a line and how close the site is to its daily target.",
  },
  {
    id: "region-alerts",
    title: "Region Alerts",
    description: "Trigger alerts when people or objects enter a restricted or hazardous area inside the monitored scene.",
    category: "Security & Surveillance",
    accent: "#7C3AED",
    image: restrictedAreaCover,
    backstory: "Security and plant teams use this to monitor danger zones, restricted aisles, and perimeter segments where entry should immediately raise an alert.",
  },
  {
    id: "queue-management",
    title: "Queue Management",
    description: "Track queue build-up, wait times, and abandonment risk at counters, help desks, gates, and retail checkout areas.",
    category: "Customer Experience",
    accent: BRAND_BLUE,
    image: queueIntelligenceImage,
    backstory: "Service leaders need a quick read on queue pressure so they can add staff before wait times and customer drop-off rise.",
  },
  {
    id: "speed-estimation",
    title: "Speed Estimation",
    description: "Estimate vehicle speeds at intersections, campuses, and industrial roads to flag speeding events.",
    category: "Traffic Intelligence",
    accent: BRAND_BLUE,
    image: speedEstimationCover,
    backstory: "Traffic and campus operations teams need fast visibility into average speed, peak speed, and speeding violations without a dedicated radar stack.",
  },
  {
    id: "fire-detection",
    title: "Fire Detection",
    description: "Detect fire and smoke signatures early from CCTV feeds to reduce emergency response time.",
    category: "Safety & Compliance",
    accent: BRAND_RED,
    image: fireDetectionCover,
    backstory: "Facilities teams need earlier warning than traditional systems can provide. This view surfaces fire and smoke-like activity directly from camera footage.",
  },
  {
    id: "class-wise-object-counting",
    title: "Class-Wise Object Counting",
    description: "Separate counts by class such as cars, trucks, buses, and bikes to understand traffic composition.",
    category: "Traffic Intelligence",
    accent: BRAND_BLUE,
    image: trafficVisibilityImage,
    backstory: "Mobility and logistics teams care about what mix of vehicles uses a road or yard, not just the total. This view highlights class distribution at a glance.",
  },
  {
    id: "object-tracking",
    title: "Object Tracking",
    description: "Track moving objects across frames to understand motion paths, asset activity, and overlap risk.",
    category: "Security & Surveillance",
    accent: "#7C3AED",
    image: objectTrackingCover,
    backstory: "Operations and security teams need to follow objects through the frame to understand movement patterns, idle assets, and near misses.",
  },
  {
    id: "ppe-detection",
    title: "PPE Detection",
    description: "Ensure workplace safety by detecting missing helmets and vests across industrial and warehouse operations.",
    category: "Safety & Compliance",
    accent: BRAND_RED,
    image: ppeDetectionImage,
    backstory: "Construction and warehouse supervisors cannot watch every camera continuously. This view surfaces missing PPE and compliance trends in one place.",
  },
];

const integrationSupportedUseCases = new Set(["ppe-detection", "region-alerts", "fire-detection"]);
const integrationPrefixDefaults = {
  "ppe-detection": { input_prefix: "ppe/input/", output_prefix: "ppe/output/" },
  "region-alerts": { input_prefix: "region/input/", output_prefix: "region/output/" },
  "fire-detection": { input_prefix: "fire/input/", output_prefix: "fire/output/" },
};

function getIntegrationDefaults(useCaseId) {
  return integrationPrefixDefaults[useCaseId] ?? { input_prefix: "input/", output_prefix: "output/" };
}

// ── Categories ───────────────────────────────────────────────────────────

const categoryDetails = [
  {
    label: "Safety & Compliance",
    param: "safety-compliance",
    description: "Detect PPE violations and fire risk conditions across plant floors, warehouses, and industrial facilities.",
    image: fireDetectionCover,
  },
  {
    label: "Security & Surveillance",
    param: "security-surveillance",
    description: "Monitor restricted regions and object movement to surface breaches, path overlap, and suspicious activity.",
    image: restrictedAreaCover,
  },
  {
    label: "Customer Experience",
    param: "customer-experience",
    description: "Measure queues and waiting behavior so service teams can reduce delays and improve staffing decisions.",
    image: queueIntelligenceImage,
  },
  {
    label: "Traffic Intelligence",
    param: "traffic-intelligence",
    description: "Analyze speed and class-wise traffic mix for roads, campuses, toll lanes, and logistics corridors.",
    image: speedEstimationCover,
  },
  {
    label: "Operations Intelligence",
    param: "operations-intelligence",
    description: "Track throughput and object movement across lines, docks, conveyors, and production checkpoints.",
    image: objectCountingCover,
  },
];

const sampleMediaByUseCase = {
  "ppe-detection": [
    { id: "ppe-sample-1", label: "PPE_TEST1.png", src: `${API_BASE_URL}/static/sample-images/PPE_TEST1.png`, type: "image" },
  ],
  "fire-detection": [
    { id: "fire-sample-1", label: "FireDetection_Test.webp", src: `${API_BASE_URL}/static/sample-images/FireDetection_Test.webp`, type: "image" },
  ],
  "object-counting": [
    { id: "object-counting-sample-1", label: "ObjectCounting_Test.png", src: `${API_BASE_URL}/static/sample-images/ObjectCounting_Test.png`, type: "image" },
  ],
  "region-alerts": [
    { id: "region-alerts-sample-1", label: "solutions-ci-demo.mp4", src: `${API_BASE_URL}/static/sample-images/solutions-ci-demo.mp4`, type: "video" },
  ],
  "queue-management": [
    { id: "queue-sample-1", label: "Queue_Intelligence.png", src: `${API_BASE_URL}/static/sample-images/Queue_Intelligence.png`, type: "image" },
  ],
  "speed-estimation": [
    { id: "speed-sample-1", label: "SpeedEstimation_Test.mp4", src: `${API_BASE_URL}/static/sample-images/SpeedEstimation_Test.mp4`, type: "video" },
  ],
  "class-wise-object-counting": [
    { id: "classwise-sample-1", label: "ClassWise.png", src: `${API_BASE_URL}/static/sample-images/ClassWise.png`, type: "image" },
  ],
  "object-tracking": [
    { id: "object-tracking-sample-1", label: "ObjectTracking.mp4", src: `${API_BASE_URL}/static/sample-images/ObjectTracking.mp4`, type: "video" },
  ],
};

const tabs = ["Model Playground", "Integration", "Dashboard"];
const tabParamToLabel = { playground: "Model Playground", integration: "Integration", dashboard: "Dashboard" };
const tabLabelToParam = { "Model Playground": "playground", Integration: "integration", Dashboard: "dashboard" };

const sectionParamToLabel = Object.fromEntries(categoryDetails.map((c) => [c.param, c.label]));
const sectionLabelToParam = Object.fromEntries(categoryDetails.map((c) => [c.label, c.param]));

const useCaseToAnalyticsDashboardSlug = {
  "object-counting": "object-counting",
  "region-alerts": "region-alerts",
  "queue-management": "queue-management",
  "speed-estimation": "speed-estimation",
  "fire-detection": "fire-detection",
  "class-wise-object-counting": "class-wise-counting",
  "object-tracking": "object-tracking",
  "ppe-detection": "ppe-detection",
};

// ── Root ─────────────────────────────────────────────────────────────────

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
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [selectedFile, setSelectedFile] = useState("");
  const [analysisState, setAnalysisState] = useState("idle");
  const [playgroundState, setPlaygroundState] = useState({
    status: "idle",
    imageBase64: "",
    detections: [],
    sourceLabel: "",
    error: "",
  });
  const [videoAnalysisMessage, setVideoAnalysisMessage] = useState("");
  const [videoResultUrl, setVideoResultUrl] = useState("");
  const [jobHistory, setJobHistory] = useState([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [jobsError, setJobsError] = useState("");
  const [latestMetrics, setLatestMetrics] = useState({});
  const [videoFiles, setVideoFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [integrationForm, setIntegrationForm] = useState({
    endpoint: "http://127.0.0.1:9000",
    access_key: "demo-access-key",
    secret_key: "demo-secret-key",
    bucket: "vision-demo",
    input_prefix: "ppe/input/",
    output_prefix: "ppe/output/",
  });
  const [integrationOverview, setIntegrationOverview] = useState({
    connected: false,
    processing: false,
    message: "",
    last_sync_at: null,
    connection: null,
    recent_runs: [],
    input_videos: [],
    output_videos: [],
    summary: {},
  });
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
  const activeSection = sectionParamToLabel[searchParams.get("section")] ?? "Safety & Compliance";
  const activeUseCaseId = searchParams.get("usecase") ?? "ppe-detection";
  const activeUseCase = useCases.find((uc) => uc.id === activeUseCaseId) ?? useCases[0];
  const sampleMedia = sampleMediaByUseCase[activeUseCaseId] ?? [];

  const fetchVideos = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/list-videos`);
      if (!res.ok) return;
      const data = await res.json();
      setVideoFiles(Array.isArray(data) ? data : []);
    } catch {}
  };

  const handleUploadVideo = async (file) => {
    if (!file) return;
    setIsUploading(true);
    setUploadMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE_URL}/api/upload-video`, { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload failed.");
      const data = await res.json();
      setUploadMessage(`✓ Uploaded: ${data.filename}`);
      setSelectedFile(data.filename);
      await fetchVideos();
    } catch (e) {
      setUploadMessage(`✗ ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const fetchJobs = async () => {
    setIsLoadingJobs(true);
    setJobsError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/jobs?use_case_id=${activeUseCaseId}`);
      if (!response.ok) throw new Error("Unable to load analysis history.");
      const data = await response.json();
      const jobs = Array.isArray(data) ? data : [];
      setJobHistory(jobs);
      const completed = jobs.find((j) => j.status === "completed" && j.metrics && Object.keys(j.metrics).length > 0);
      if (completed) setLatestMetrics(completed.metrics);
    } catch (error) {
      setJobsError(error instanceof Error ? error.message : "Unable to load analysis history.");
    } finally {
      setIsLoadingJobs(false);
    }
  };

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
      setIntegrationOverview({ connected: false, processing: false, message: "", last_sync_at: null, connection: null, recent_runs: [], input_videos: [], output_videos: [], summary: {} });
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
      } else {
        const defaults = getIntegrationDefaults(activeUseCaseId);
        setIntegrationForm((current) => ({ ...current, input_prefix: defaults.input_prefix, output_prefix: defaults.output_prefix }));
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
      const response = await fetch(`${API_BASE_URL}/api/integrations/minio/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...integrationForm, use_case_id: activeUseCaseId, processing_mode: resolvedMode }),
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
        `${API_BASE_URL}/api/integrations/minio/input-videos?use_case_id=${encodeURIComponent(activeUseCaseId)}&limit=${encodeURIComponent(String(integrationFetchCount))}`
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
        `Fetched ${Number(data?.fetched_count ?? videos.length)} video${Number(data?.fetched_count ?? videos.length) === 1 ? "" : "s"} from ${activeUseCase.title} input storage.`
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
      const response = await fetch(`${API_BASE_URL}/api/integrations/minio/process-selected`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          use_case_id: activeUseCaseId,
          object_keys: selectedIntegrationVideos,
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
    if (!isAuthenticated) return;
    fetchJobs();
    fetchVideos();
  }, [isAuthenticated, activeUseCaseId]);

  // Always fetch integration status for supported use cases on mount / use-case change
  useEffect(() => {
    if (!integrationSupportedUseCases.has(activeUseCaseId)) return;
    fetchIntegrationOverview();
  }, [activeUseCaseId]);

  // Poll every 5 s while connected (any tab)
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
      detections: [],
      sourceLabel: "",
      error: "",
    });
    const defaults = getIntegrationDefaults(activeUseCaseId);
    setIntegrationOverview({
      connected: false,
      processing: false,
      message: "",
      last_sync_at: null,
      connection: null,
      recent_runs: [],
      input_videos: [],
      output_videos: [],
      summary: {},
    });
    setIntegrationForm((current) => ({
      ...current,
      input_prefix: defaults.input_prefix,
      output_prefix: defaults.output_prefix,
    }));
    setIntegrationMode("manual");
    setIntegrationError("");
    setIntegrationFetchMessage("");
    setIntegrationProcessMessage("");
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

  const runPlaygroundPreview = async (file, sourceLabel) => {
    setPlaygroundState({ status: "loading", imageBase64: "", detections: [], sourceLabel, error: "" });
    navigateTo("detail", "Model Playground", "replace", activeSection, activeUseCaseId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("use_case_id", activeUseCaseId);
      const response = await fetch(`${API_BASE_URL}/api/playground-preview`, { method: "POST", body: formData });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail ?? "Playground preview failed.");
      }
      const data = await response.json();
      setPlaygroundState({ status: "success", imageBase64: data.image_base64, detections: data.detections ?? [], sourceLabel, error: "" });
    } catch (error) {
      setPlaygroundState({ status: "error", imageBase64: "", detections: [], sourceLabel, error: error instanceof Error ? error.message : "Unable to generate playground preview." });
    }
  };

  const handleProcessInput = async (sampleId, fileOverride) => {
    const matchingSample = sampleMedia.find((s) => s.id === sampleId);
    const sourceLabel = fileOverride?.name ?? matchingSample?.label ?? "Uploaded File";
    setSelectedSample(sampleId);
    if (fileOverride) { await runPlaygroundPreview(fileOverride, sourceLabel); return; }
    if (!matchingSample) return;

    try {
      setPlaygroundState({ status: "loading", imageBase64: "", detections: [], sourceLabel, error: "" });
      navigateTo("detail", "Model Playground", "replace", activeSection, activeUseCaseId);
      const formData = new FormData();
      formData.append("sample_name", matchingSample.label);
      formData.append("use_case_id", activeUseCaseId);
      const response = await fetch(`${API_BASE_URL}/api/playground-preview-sample`, { method: "POST", body: formData });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail ?? "Unable to load sample media.");
      }
      const data = await response.json();
      setPlaygroundState({ status: "success", imageBase64: data.image_base64, detections: data.detections ?? [], sourceLabel, error: "" });
    } catch (error) {
      setPlaygroundState({
        status: "error",
        imageBase64: "",
        detections: [],
        sourceLabel,
        error: error instanceof Error ? error.message : "Unable to process sample media.",
      });
    }
  };

  const handleAuthenticate = () => {
    setIsAuthenticating(true);
    setTimeout(() => { setIsAuthenticating(false); setIsAuthenticated(true); setAnalysisState("idle"); setVideoAnalysisMessage(""); setVideoResultUrl(""); }, 1200);
  };

  const handleAnalyze = async () => {
    setAnalysisState("running");
    setVideoAnalysisMessage("");
    setVideoResultUrl("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/analyze-use-case`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: selectedFile, use_case_id: activeUseCaseId }),
      });
      if (!response.ok) throw new Error("Video analysis request failed.");
      const data = await response.json();
      setAnalysisState("completed");
      setVideoAnalysisMessage(data.message ?? "Analysis started.");
      const resolvedOutputUrl = resolveBackendUrl(data.output_url || data.result_url || "");
      console.log("Processed output_url:", resolvedOutputUrl);
      setVideoResultUrl(resolvedOutputUrl);
      if (data.metrics && Object.keys(data.metrics).length > 0) setLatestMetrics(data.metrics);
      fetchJobs();
    } catch (error) {
      setAnalysisState("idle");
      setVideoAnalysisMessage(error instanceof Error ? error.message : "Unable to start analysis.");
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
          onOpenUseCase={(ucId, category) => navigateTo("detail", "Model Playground", "push", category, ucId)}
        />
      )}
      {currentView === "detail" && (
        <DetailPage
          activeTab={activeTab}
          activeUseCase={activeUseCase}
          analysisState={analysisState}
          isAuthenticated={isAuthenticated}
          isAuthenticating={isAuthenticating}
          onAnalyze={handleAnalyze}
          onAuthenticate={handleAuthenticate}
          onBack={() => navigateTo("usecases", undefined, "push", activeUseCase.category)}
          onGoHome={() => navigateTo("landing")}
          onProcessInput={handleProcessInput}
          playgroundState={playgroundState}
          onSelectFile={(fileName) => { setSelectedFile(fileName); setAnalysisState("idle"); setVideoAnalysisMessage(""); setVideoResultUrl(""); }}
          selectedFile={selectedFile}
          selectedSample={selectedSample}
          sampleMedia={sampleMedia}
          setActiveTab={(tab) => navigateTo("detail", tab, "push", activeSection, activeUseCaseId)}
          jobHistory={jobHistory}
          jobsError={jobsError}
          isLoadingJobs={isLoadingJobs}
          videoAnalysisMessage={videoAnalysisMessage}
          videoResultUrl={videoResultUrl}
          latestMetrics={latestMetrics}
          videoFiles={videoFiles}
          isUploading={isUploading}
          uploadMessage={uploadMessage}
          onUploadVideo={handleUploadVideo}
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

// ── Brand Header ─────────────────────────────────────────────────────────

function BrandHeader({ onHomeClick }) {
  return (
    <button className="flex items-center gap-3" onClick={onHomeClick} type="button">
      <div className="relative h-11 w-11 overflow-hidden rounded-xl border border-slate-200 bg-white p-1">
        <Image alt="Sutherland logo" className="object-contain" fill sizes="44px" src={sutherlandLogo} />
      </div>
      <div className="text-left">
      <div className="text-xl font-bold tracking-[0.25em] text-brandBlue">
     SUTHERLAND
  </div>
  <div className="text-xs tracking-[0.2em] text-slate-500 mt-1">
    VISION HUB
  </div>
</div>
    </button>
  );
}

// ── Landing Page ─────────────────────────────────────────────────────────

function LandingPage({ onExploreSection }) {
  return (
    <div className="bg-white">
      <header className="px-10 py-8">
        <BrandHeader onHomeClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
      </header>
      <main className="px-10 pb-16">
        <section className="mx-auto max-w-5xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-brandRed">Enterprise AI Vision</p>
          <h1 className="mt-5 text-6xl font-semibold tracking-tight text-slate-900">
            Transforming enterprise video into actionable intelligence.
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-xl leading-9 text-slate-500">
            Sutherland Hub brings together enterprise-grade computer vision workflows for workplace safety,
            retail intelligence, healthcare, security, and smart city operations.
          </p>
        </section>

        <section className="mx-auto mt-14 max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-100 shadow-panel">
          <video autoPlay className="h-[34rem] w-full object-cover" controls loop muted playsInline src={`${API_BASE_URL}/static/PPE_VIDEO1.mp4`} />
        </section>

        {/* Stats bar */}
        <section className="mx-auto mt-12 max-w-5xl">
          <div className="grid grid-cols-4 gap-6">
            {[
              { label: "Pre-built Use Cases", value: String(useCases.length) },
              { label: "Industry Verticals", value: "5" },
              { label: "CV Models Integrated", value: "YOLOv8" },
              { label: "Processing", value: "Real-time" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-panel">
                <div className="text-3xl font-semibold text-brandBlue">{stat.value}</div>
                <div className="mt-2 text-sm text-slate-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-6xl">
          <div className="mb-8">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-brandRed">Explore Categories</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">Enterprise vision use cases by domain</h2>
          </div>
          <div className="grid grid-cols-3 gap-6">
            {categoryDetails.slice(0, 3).map((category) => (
              <button
                key={category.param}
                className="overflow-hidden rounded-3xl border border-slate-200 bg-white text-left shadow-panel transition hover:-translate-y-1 hover:border-brandBlue/35"
                onClick={() => onExploreSection(category.label)}
                type="button"
              >
                <div className="relative h-64 overflow-hidden bg-slate-100">
                  <Image alt={category.label} className="h-full w-full object-cover" fill sizes="(min-width: 1280px) 30vw, 100vw" src={category.image} />
                </div>
                <div className="p-6">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-brandRed">{category.label}</div>
                  <h3 className="mt-3 text-2xl font-semibold text-slate-900">{category.label}</h3>
                  <p className="mt-4 text-sm leading-7 text-slate-500">{category.description}</p>
                </div>
              </button>
            ))}
          </div>
          {/* Second row for remaining categories */}
          <div className="mt-6 grid grid-cols-2 gap-6">
            {categoryDetails.slice(3).map((category) => (
              <button
                key={category.param}
                className="overflow-hidden rounded-3xl border border-slate-200 bg-white text-left shadow-panel transition hover:-translate-y-1 hover:border-brandBlue/35"
                onClick={() => onExploreSection(category.label)}
                type="button"
              >
                <div className="relative h-48 overflow-hidden bg-slate-100">
                  <Image alt={category.label} className="h-full w-full object-cover" fill sizes="(min-width: 1280px) 45vw, 100vw" src={category.image} />
                </div>
                <div className="p-6">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-brandRed">{category.label}</div>
                  <h3 className="mt-3 text-2xl font-semibold text-slate-900">{category.label}</h3>
                  <p className="mt-4 text-sm leading-7 text-slate-500">{category.description}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

// ── Use Cases Page ───────────────────────────────────────────────────────

function UseCasesPage({ activeSection, onChangeSection, onGoHome, onOpenUseCase }) {
  const filteredUseCases = useCases.filter((item) => item.category === activeSection);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200 px-10 py-6">
        <BrandHeader onHomeClick={onGoHome} />
      </header>
      <div className="flex min-h-[calc(100vh-96px)] bg-white">
        <aside className="w-72 border-r border-slate-200 bg-white px-8 py-10">
          <nav className="space-y-2">
            {categoryDetails.map((section) => (
              <SidebarLink key={section.param} active={activeSection === section.label} label={section.label} onClick={() => onChangeSection(section.label)} />
            ))}
          </nav>
          {/* Use case count badge */}
          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Total Use Cases</div>
            <div className="mt-2 text-3xl font-semibold text-brandBlue">{useCases.length}</div>
            <div className="mt-1 text-xs text-slate-400">{categoryDetails.length} categories</div>
          </div>
        </aside>

        <main className="flex-1 px-10 py-10">
          <div className="mb-8">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-brandRed">{activeSection}</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">Operational Vision Use Cases</h1>
            <p className="mt-2 text-sm text-slate-500">{filteredUseCases.length} use case{filteredUseCases.length !== 1 ? "s" : ""} in this category</p>
          </div>
          <div className={`grid gap-6 ${filteredUseCases.length === 1 ? "grid-cols-1 max-w-xl" : filteredUseCases.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
            {filteredUseCases.map((item) => (
              <UseCaseCard key={item.id} item={item} onClick={() => onOpenUseCase(item.id, item.category)} />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Detail Page ──────────────────────────────────────────────────────────

function DetailPage({
  activeTab, activeUseCase, analysisState, isAuthenticated, isAuthenticating,
  onAnalyze, onAuthenticate, onBack, onGoHome, onProcessInput, playgroundState,
  onSelectFile, selectedFile, selectedSample, sampleMedia, setActiveTab,
  jobHistory, jobsError, isLoadingJobs, videoAnalysisMessage, videoResultUrl, latestMetrics,
  videoFiles, isUploading, uploadMessage, onUploadVideo,
  integrationForm, integrationOverview, integrationError, isConnectingIntegration,
  integrationMode, integrationFetchCount, integrationFetchedVideos, selectedIntegrationVideos,
  isFetchingIntegrationVideos, isProcessingIntegrationVideos, integrationFetchMessage, integrationProcessMessage, expandedRunId,
  onIntegrationFieldChange, onIntegrationConnect, onIntegrationModeChange,
  onIntegrationFetchCountChange, onIntegrationFetchVideos, onIntegrationSelectionChange, onIntegrationProcessSelected, onToggleRunAnalysis,
  onOpenAnalyticsDashboard,
}) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200 bg-white px-10 py-6">
        <BrandHeader onHomeClick={onGoHome} />
        <div className="mt-5">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <button className="hover:text-brandBlue" onClick={onGoHome}>Home</button>
            <span>/</span>
            <button className="hover:text-brandBlue" onClick={onBack}>{activeUseCase.category}</button>
            <span>/</span>
            <span className="font-medium text-slate-900">{activeUseCase.title}</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{activeUseCase.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{activeUseCase.description}</p>
        </div>
      </header>

      <div className="px-10 pt-6">
        <div className="mb-8 flex gap-3 border-b border-slate-200">
          {tabs.map((tab) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${active ? "border-brandRed text-brandBlue" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                onClick={() => {
                  if (tab === "Dashboard") {
                    onOpenAnalyticsDashboard?.();
                    return;
                  }
                  setActiveTab(tab);
                }}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {activeTab === "Model Playground" && (
          <ModelPlayground activeUseCase={activeUseCase} onProcessInput={onProcessInput} playgroundState={playgroundState} selectedSample={selectedSample} sampleMedia={sampleMedia} />
        )}
        {activeTab === "Integration" && (
          <IntegrationTab
            activeUseCase={activeUseCase}
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
            onIntegrationFieldChange={onIntegrationFieldChange}
            onIntegrationConnect={onIntegrationConnect}
            onIntegrationModeChange={onIntegrationModeChange}
            onIntegrationFetchCountChange={onIntegrationFetchCountChange}
            onIntegrationFetchVideos={onIntegrationFetchVideos}
            onIntegrationSelectionChange={onIntegrationSelectionChange}
            onIntegrationProcessSelected={onIntegrationProcessSelected}
            onToggleRunAnalysis={onToggleRunAnalysis}
          />
        )}
        {activeTab === "Dashboard" && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            Redirecting to the analytics dashboard…
          </div>
        )}
      </div>
    </div>
  );
}

// ── Model Playground ─────────────────────────────────────────────────────

function ModelPlayground({ activeUseCase, onProcessInput, playgroundState, selectedSample, sampleMedia }) {
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
          onClick={() => fileInputRef.current?.click()} type="button"
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
                onClick={() => onProcessInput(sample.id)} type="button"
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
                        onCanPlay={() => setLoadedSampleVideos((prev) => ({ ...prev, [sample.id]: true }))}
                        onError={() => setLoadedSampleVideos((prev) => ({ ...prev, [sample.id]: true }))}
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
              <img alt="Processed output" className="max-h-full max-w-full rounded-xl object-contain" src={playgroundState.imageBase64} />
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 text-xs text-slate-400">Source: {playgroundState.sourceLabel}</div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Detections</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {playgroundState.detections.length > 0 ? playgroundState.detections.map((d) => (
                  <div key={`${d.class}-${d.confidence}`} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    {formatPlaygroundDetection(d)}
                  </div>
                )) : (
                  <div className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">No detections returned</div>
                )}
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button className="rounded-xl border border-brandBlue px-4 py-3 text-sm font-semibold text-brandBlue transition hover:bg-brandBlue hover:text-white" onClick={() => window.open(playgroundState.imageBase64, "_blank")} type="button">Preview in Browser</button>
              <button
                className="rounded-xl bg-brandBlue px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95"
                onClick={() => { const link = document.createElement("a"); link.href = playgroundState.imageBase64; link.download = "analysis-result.jpg"; link.click(); }}
                type="button"
              >Download Results</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// \u2500\u2500 Integration Tab \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function integrationStatusClasses(status) {
  if (status === "completed") return "border-green-200 bg-green-50 text-green-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (status === "processing" || status === "queued") return "border-brandBlue/15 bg-brandBlue/[0.03] text-brandBlue";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function formatIntegrationStatus(status) {
  return (status || "available").replaceAll("_", " ");
}

function formatIntegrationBytes(size) {
  if (!size) return "0 MB";
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatIntegrationTime(value) {
  if (!value) return "\u2014";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatAnalysisLabel(key) {
  return (key || "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAnalysisValue(value) {
  if (value === null || value === undefined || value === "") return "\u2014";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2);
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function RunAnalysisPanel({ run }) {
  const entries = Object.entries(run.metrics ?? {});

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Output Analysis</h4>
          <p className="mt-1 text-sm text-slate-500">Latest analysis metadata captured for this {run.use_case_id.replaceAll("-", " ")} run.</p>
        </div>
        <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Run #{run.id}</div>
      </div>
      {entries.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          No analysis metadata was stored for this run.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map(([key, value]) => (
            <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{formatAnalysisLabel(key)}</div>
              <div className="mt-2 break-words text-sm font-medium text-slate-800">{formatAnalysisValue(value)}</div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 text-xs text-slate-400">
        {run.message || "No additional run note available."}
      </div>
    </div>
  );
}

function IntegrationField({ label, type = "text", value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      <input
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-brandBlue"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

function StorageProviderCard({ title, subtitle, active }) {
  return (
    <div className={`rounded-2xl border p-4 transition ${active ? "border-brandBlue bg-brandBlue/[0.03]" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${active ? "bg-brandBlue text-white" : "bg-white text-slate-400"}`}>
          {active ? "Active" : "Soon"}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p>
    </div>
  );
}

function IntegrationMetricCard({ label, value, helper }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-panel">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-brandBlue">{value}</div>
      <p className="mt-2 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

function IntegrationModeButton({ active, label, onClick }) {
  return (
    <button
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
        active ? "bg-brandBlue text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-brandBlue/40 hover:text-brandBlue"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function IntegrationAutoPanel({ connection, isConnected, isProcessing, useCaseLabel }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Auto Mode Monitor</h3>
          <p className="mt-1 text-sm text-slate-500">
            Auto mode monitors the connected MinIO <strong>{connection?.input_prefix ?? "input/"}</strong> prefix for new or unprocessed <strong>{useCaseLabel}</strong> videos and processes them one by one into <strong>{connection?.output_prefix ?? "output/"}</strong>.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${integrationStatusClasses(isProcessing ? "processing" : isConnected ? "available" : "failed")}`}>
          {isProcessing ? "Monitoring \u2022 Active" : isConnected ? "Monitoring \u2022 Idle" : "Not Connected"}
        </span>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Input Source</div>
          <div className="mt-2 text-sm font-semibold text-slate-800">{connection?.bucket ?? "\u2014"}</div>
          <div className="mt-1 text-xs text-slate-500">{connection?.input_prefix ?? "input/"}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Detection Rule</div>
          <div className="mt-2 text-sm font-semibold text-slate-800">New or Unprocessed Videos</div>
          <div className="mt-1 text-xs text-slate-500">Already completed videos are skipped on later polls.</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Output Target</div>
          <div className="mt-2 text-sm font-semibold text-slate-800">{connection?.bucket ?? "\u2014"}</div>
          <div className="mt-1 text-xs text-slate-500">{connection?.output_prefix ?? "output/"}</div>
        </div>
      </div>
    </section>
  );
}

function IntegrationManualPanel({
  connection,
  disabled,
  fetchCount,
  fetchedVideos,
  isFetching,
  isProcessing,
  fetchMessage,
  processMessage,
  selectedVideos,
  useCaseLabel,
  onFetchCountChange,
  onFetchVideos,
  onProcessSelected,
  onSelectionChange,
}) {
  const selectableVideos = fetchedVideos.filter((video) => !["completed", "processing"].includes(video.status));
  const allSelectableSelected = selectableVideos.length > 0 && selectableVideos.every((video) => selectedVideos.includes(video.object_key));

  const toggleVideo = (objectKey) => {
    onSelectionChange(
      selectedVideos.includes(objectKey)
        ? selectedVideos.filter((key) => key !== objectKey)
        : [...selectedVideos, objectKey]
    );
  };

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      onSelectionChange(selectedVideos.filter((key) => !selectableVideos.some((video) => video.object_key === key)));
      return;
    }
    const next = new Set(selectedVideos);
    selectableVideos.forEach((video) => next.add(video.object_key));
    onSelectionChange(Array.from(next));
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Manual Fetch & Process</h3>
          <p className="mt-1 text-sm text-slate-500">
            Fetch videos from the connected MinIO <strong>{connection?.input_prefix ?? "input/"}</strong> prefix, choose the {useCaseLabel} inputs you want, and process only those selections.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          Target bucket: <strong className="text-slate-700">{connection?.bucket ?? "Not connected"}</strong>
        </div>
      </div>
      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-semibold text-slate-700" htmlFor="integration-fetch-count">Fetch count</label>
            <select
              id="integration-fetch-count"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
              disabled={disabled || isFetching}
              value={fetchCount}
              onChange={(event) => onFetchCountChange(Number(event.target.value))}
            >
              {[5, 10, 20, 50].map((count) => (
                <option key={count} value={count}>{count}</option>
              ))}
            </select>
            <button className="rounded-xl border border-brandBlue px-5 py-3 text-sm font-semibold text-brandBlue transition hover:bg-brandBlue hover:text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={disabled || isFetching} onClick={onFetchVideos} type="button">
              {isFetching ? "Fetching..." : "Fetch Videos"}
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-brandBlue hover:text-brandBlue disabled:cursor-not-allowed disabled:opacity-60" disabled={selectableVideos.length === 0} onClick={toggleSelectAll} type="button">
              {allSelectableSelected ? "Clear Selection" : "Select All"}
            </button>
            <button className="rounded-xl bg-brandBlue px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60" disabled={disabled || isProcessing || selectedVideos.length === 0} onClick={onProcessSelected} type="button">
              {isProcessing ? "Processing..." : `Process Selected${selectedVideos.length > 0 ? ` (${selectedVideos.length})` : ""}`}
            </button>
          </div>
        </div>
      </div>
      {fetchMessage && (
        <div className={`mt-4 rounded-2xl border px-4 py-4 text-sm font-medium ${fetchMessage.startsWith("\u2717") ? "border-red-200 bg-red-50 text-red-700" : "border-brandBlue/15 bg-brandBlue/[0.03] text-slate-700"}`}>
          {fetchMessage}
        </div>
      )}
      {processMessage && (
        <div className={`mt-4 rounded-2xl border px-4 py-4 text-sm font-medium ${processMessage.startsWith("\u2717") ? "border-red-200 bg-red-50 text-red-700" : "border-brandBlue/15 bg-brandBlue/[0.03] text-slate-700"}`}>
          {processMessage}
        </div>
      )}
      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
        {fetchedVideos.length === 0 ? (
          <div className="bg-white px-4 py-10 text-center text-sm text-slate-500">
            Fetch videos to list the current {useCaseLabel} inputs from MinIO.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Select</th>
                <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Video</th>
                <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</th>
                <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Updated</th>
                <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {fetchedVideos.map((video) => {
                const selectable = !["completed", "processing"].includes(video.status);
                return (
                  <tr key={video.object_key} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <input
                        checked={selectedVideos.includes(video.object_key)}
                        className="h-4 w-4 rounded border-slate-300 text-brandBlue focus:ring-brandBlue"
                        disabled={!selectable}
                        type="checkbox"
                        onChange={() => toggleVideo(video.object_key)}
                      />
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      <div className="font-medium text-slate-800">{video.name}</div>
                      <div className="mt-1 break-all text-xs text-slate-500">{video.object_key}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${integrationStatusClasses(video.status)}`}>
                        {formatIntegrationStatus(video.status)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-500">{formatIntegrationTime(video.updated_at || video.last_modified)}</td>
                    <td className="px-5 py-4 text-sm text-slate-500">{formatIntegrationBytes(video.size_bytes)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function IntegrationTab({
  activeUseCase,
  integrationForm,
  integrationOverview,
  integrationError,
  isConnectingIntegration,
  integrationMode,
  integrationFetchCount,
  integrationFetchedVideos,
  selectedIntegrationVideos,
  isFetchingIntegrationVideos,
  isProcessingIntegrationVideos,
  integrationFetchMessage,
  integrationProcessMessage,
  expandedRunId,
  onIntegrationFieldChange,
  onIntegrationConnect,
  onIntegrationModeChange,
  onIntegrationFetchCountChange,
  onIntegrationFetchVideos,
  onIntegrationSelectionChange,
  onIntegrationProcessSelected,
  onToggleRunAnalysis,
}) {
  const supportedUseCase = integrationSupportedUseCases.has(activeUseCase.id);
  const useCaseLabel = activeUseCase.title;
  const connection = integrationOverview?.connection;
  const recentRuns = integrationOverview?.recent_runs ?? [];
  const activeMode = connection?.processing_mode ?? integrationMode;
  const isAutoMode = activeMode === "auto";

  return (
    <div className="space-y-6">
      {/* Connection form */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel">
        <div className="grid gap-8 xl:grid-cols-[1.25fr_1fr]">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Integration Configuration</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Connect to MinIO object storage to route videos through the <strong>{useCaseLabel}</strong> pipeline.
              Supports Auto (continuous monitoring) and Manual (on-demand upload) modes.
            </p>
            <div className="mt-4 rounded-xl border border-brandBlue/10 bg-brandBlue/[0.02] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brandBlue">Demo Flow</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Connect to MinIO \u2192 choose Auto or Manual mode \u2192 process videos through <strong>{useCaseLabel}</strong> \u2192 view outputs here.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <StorageProviderCard active subtitle="Configured for the current client demo." title="MinIO" />
            <StorageProviderCard subtitle="Placeholder for future connectors." title="AWS S3" />
            <StorageProviderCard subtitle="Placeholder for future connectors." title="Azure Blob" />
          </div>
        </div>

        {!supportedUseCase && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-800">
            MinIO integration is available for <strong>PPE Detection</strong>, <strong>Region Alerts</strong>, and <strong>Fire Detection</strong>. Switch to one of those use cases to connect.
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-slate-200 p-6">
          <div className="mb-5">
            <div className="mb-2 text-sm font-semibold text-slate-700">Processing Mode</div>
            <div className="flex flex-wrap gap-3">
              <IntegrationModeButton active={activeMode === "auto"} label="Auto" onClick={() => onIntegrationModeChange("auto")} />
              <IntegrationModeButton active={activeMode === "manual"} label="Manual" onClick={() => onIntegrationModeChange("manual")} />
            </div>
            <p className="mt-3 text-sm text-slate-500">
              {isAutoMode
                ? `Auto mode continuously monitors the MinIO input prefix and processes new ${useCaseLabel} videos automatically.`
                : `Manual mode fetches videos already present in the MinIO input prefix and processes only the ${useCaseLabel} videos you select.`}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <IntegrationField label="Endpoint / URL" onChange={(v) => onIntegrationFieldChange("endpoint", v)} placeholder="http://127.0.0.1:9000" value={integrationForm.endpoint} />
            <IntegrationField label="Access Key" onChange={(v) => onIntegrationFieldChange("access_key", v)} placeholder="minioadmin" value={integrationForm.access_key} />
            <IntegrationField label="Secret Key" onChange={(v) => onIntegrationFieldChange("secret_key", v)} placeholder="minioadmin" type="password" value={integrationForm.secret_key} />
            <IntegrationField label="Bucket" onChange={(v) => onIntegrationFieldChange("bucket", v)} placeholder="vision-demo" value={integrationForm.bucket} />
            <IntegrationField label="Input Prefix" onChange={(v) => onIntegrationFieldChange("input_prefix", v)} placeholder="input/" value={integrationForm.input_prefix} />
            <IntegrationField label="Output Prefix" onChange={(v) => onIntegrationFieldChange("output_prefix", v)} placeholder="output/" value={integrationForm.output_prefix} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              className="rounded-xl bg-brandBlue px-5 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={!supportedUseCase || isConnectingIntegration}
              onClick={() => onIntegrationConnect()}
              type="button"
            >
              {isConnectingIntegration ? "Connecting\u2026" : integrationOverview.connected ? "Reconnect MinIO" : "Connect"}
            </button>
            {integrationOverview.connected && (
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${integrationStatusClasses(integrationOverview.processing ? "processing" : "completed")}`}>
                {integrationOverview.processing ? "Connected \u2022 Processing" : "Connected"}
              </span>
            )}
            {!integrationOverview.connected && supportedUseCase && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Not Connected
              </span>
            )}
            {connection && (
              <span className="text-sm text-slate-500">
                {connection.bucket} \u2022 {connection.input_prefix} \u2192 {connection.output_prefix}
              </span>
            )}
          </div>

          {(integrationError || integrationOverview.message) && (
            <div className={`mt-4 rounded-2xl border px-4 py-4 text-sm font-medium ${integrationError ? "border-red-200 bg-red-50 text-red-700" : "border-brandBlue/15 bg-brandBlue/[0.03] text-slate-700"}`}>
              {integrationError || integrationOverview.message}
            </div>
          )}
          {connection && (
            <div className="mt-4 text-xs uppercase tracking-[0.18em] text-slate-400">
              Provider: {connection.provider} \u2022 Mode: {activeMode} \u2022 Credentials: {connection.credential_mode}
            </div>
          )}
        </div>
      </section>

      {/* Auto / Manual panel */}
      {isAutoMode ? (
        <IntegrationAutoPanel connection={connection} isConnected={integrationOverview.connected} isProcessing={integrationOverview.processing} useCaseLabel={useCaseLabel} />
      ) : (
        <IntegrationManualPanel
          connection={connection}
          disabled={!supportedUseCase || !integrationOverview.connected}
          fetchCount={integrationFetchCount}
          fetchedVideos={integrationFetchedVideos}
          isFetching={isFetchingIntegrationVideos}
          isProcessing={isProcessingIntegrationVideos}
          fetchMessage={integrationFetchMessage}
          processMessage={integrationProcessMessage}
          selectedVideos={selectedIntegrationVideos}
          useCaseLabel={useCaseLabel}
          onFetchCountChange={onIntegrationFetchCountChange}
          onFetchVideos={onIntegrationFetchVideos}
          onProcessSelected={onIntegrationProcessSelected}
          onSelectionChange={onIntegrationSelectionChange}
        />
      )}

      {/* Summary metrics */}
      <section className="grid gap-4 md:grid-cols-3">
        <IntegrationMetricCard
          helper={isAutoMode ? "Videos discovered in the MinIO input prefix." : "Total videos currently available in the use-case-specific MinIO input prefix."}
          label="Available Inputs"
          value={integrationOverview.summary?.input_videos ?? 0}
        />
        <IntegrationMetricCard helper="Queued or in-flight runs for the current use case." label="Queued / Processing" value={integrationOverview.summary?.processing_runs ?? 0} />
        <IntegrationMetricCard
          helper={integrationOverview.processing ? "Pipeline is actively processing." : "Last batch complete or awaiting new inputs."}
          label="Recent Runs"
          value={recentRuns.length}
        />
      </section>

      {/* Recent runs table */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Recent Runs</h3>
            <p className="mt-1 text-sm text-slate-500">MinIO-backed {useCaseLabel} runs — input key, output key, status, and timestamps.</p>
          </div>
          {integrationOverview.last_sync_at && (
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Last sync: {formatIntegrationTime(integrationOverview.last_sync_at)}</span>
          )}
        </div>
        {recentRuns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            {integrationOverview.connected ? `No ${useCaseLabel} runs yet. Fetch input videos or let Auto mode discover new ones.` : "Connect to MinIO to see recent processing runs."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Input Object</th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Output Object</th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Updated</th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {recentRuns.map((run) => (
                  <Fragment key={run.id}>
                    <tr key={run.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 text-sm text-slate-700">
                        <div className="font-medium text-slate-800">{run.input_key.split("/").pop()}</div>
                        <div className="mt-1 break-all text-xs text-slate-500">{run.input_key}</div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">
                        {run.output_key ? (
                          <><div className="font-medium text-slate-800">{run.output_key.split("/").pop()}</div><div className="mt-1 break-all text-xs text-slate-500">{run.output_key}</div></>
                        ) : <span className="text-slate-400">Pending</span>}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${integrationStatusClasses(run.status)}`}>{formatIntegrationStatus(run.status)}</span>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-500">{formatIntegrationTime(run.updated_at)}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-3">
                          {run.output_url ? <a className="text-sm font-semibold text-brandBlue hover:underline" href={resolveBackendUrl(run.output_url)} onClick={() => console.log("Run output_url:", resolveBackendUrl(run.output_url))} rel="noreferrer" target="_blank">Open Output</a>
                            : run.input_url ? <a className="text-sm font-semibold text-brandBlue hover:underline" href={resolveBackendUrl(run.input_url)} rel="noreferrer" target="_blank">Open Input</a>
                            : <span className="text-sm text-slate-400">Unavailable</span>}
                          <button className="text-sm font-semibold text-brandBlue hover:underline disabled:cursor-not-allowed disabled:text-slate-400" disabled={!run.metrics || Object.keys(run.metrics).length === 0} onClick={() => onToggleRunAnalysis(run.id)} type="button">
                            Output Analysis
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedRunId === run.id && (
                      <tr className="bg-slate-50/80">
                        <td className="px-5 pb-5 pt-0" colSpan={5}>
                          <RunAnalysisPanel run={run} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────

function DashboardTab({ activeUseCase, latestMetrics, jobHistory }) {
  const dashboardConfig = getDashboardConfig(activeUseCase.id);
  const latestCompliance = latestMetrics?.avg_compliance_rate ?? null;
  const isLowCompliance = activeUseCase.id === "ppe-detection" && latestCompliance !== null && latestCompliance < 80;

  const metricCards = useMemo(
    () =>
      dashboardConfig.metrics.map((metric) => {
        const liveValue = resolveMetricLiveValue(metric, latestMetrics);
        const hasLiveValue = liveValue !== null && liveValue !== undefined && liveValue !== "";
        return {
          title: metric.title,
          value: hasLiveValue ? formatMetricValue(liveValue, metric) : metric.fallbackValue,
          accent: metric.accent ?? "blue",
          statusLabel:
            dashboardConfig.kpiTagMode === "none"
              ? ""
              : dashboardConfig.kpiTagMode === "live"
                ? "Live KPI"
                : hasLiveValue
                  ? "Live KPI"
                  : "Demo KPI",
        };
      }),
    [dashboardConfig.kpiTagMode, dashboardConfig.metrics, latestMetrics],
  );

  const chartCards = useMemo(
    () =>
      dashboardConfig.charts.map((chart) => ({
        ...chart,
        data: buildChartData(jobHistory, chart),
      })),
    [dashboardConfig.charts, jobHistory],
  );

  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-2xl border border-brandBlue/10 bg-brandBlue/[0.02] p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brandBlue">{activeUseCase.category}</div>
        <p className="mt-2 text-sm leading-6 text-slate-600">{activeUseCase.backstory}</p>
      </div>

      {activeUseCase.id === "ppe-detection" && isLowCompliance && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
          <svg className="h-5 w-5 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
          <div>
            <p className="text-sm font-semibold text-red-700">Low PPE Compliance Alert</p>
            <p className="text-xs text-red-600">Compliance rate is {latestCompliance.toFixed(1)}% — below the 80% safety threshold. Immediate supervisor review required.</p>
          </div>
        </div>
      )}

      <section className={`grid gap-5 ${metricCards.length <= 3 ? "grid-cols-3" : metricCards.length <= 4 ? "grid-cols-4" : "grid-cols-3"}`}>
        {metricCards.slice(0, 6).map((card) => (
          <MetricCard key={card.title} title={card.title} value={card.value} accent={card.accent} statusLabel={card.statusLabel} />
        ))}
      </section>

      <section className="grid grid-cols-2 gap-6">
        {chartCards.map((chart) => (
          <ChartCard key={chart.title} chart={chart} />
        ))}
      </section>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getDashboardConfig(useCaseId) {
  const configs = {
    "object-counting": {
      kpiTagMode: "none",
      metrics: [
        { key: "total_objects", title: "Total Count Today", fallbackValue: "1,248", accent: "blue" },
        { key: "current_rate_per_min", title: "Current Rate", fallbackValue: "24 / min", accent: "blue", unit: " / min" },
        { key: "peak_volume_window", title: "Peak Volume Hour", fallbackValue: "14:00 - 15:00", accent: "blue" },
        { key: "target_progress_pct", title: "Target Progress", fallbackValue: "78%", accent: "blue", format: "percent" },
      ],
      charts: [
        {
          title: "Objects Counted by Hour",
          description: "Hourly volume across the monitored checkpoint.",
          type: "bar",
          labelKey: "label",
          valueKey: "count",
          color: BRAND_BLUE,
          fallbackData: [
            { label: "09:00", count: 180 },
            { label: "10:00", count: 210 },
            { label: "11:00", count: 190 },
            { label: "12:00", count: 170 },
            { label: "13:00", count: 230 },
            { label: "14:00", count: 268 },
          ],
        },
        {
          title: "Cumulative Progress vs Target",
          description: "Recent run-to-run throughput performance.",
          type: "line",
          labelKey: "label",
          valueKey: "count",
          metricKey: "total_objects",
          goalValue: 1600,
          color: BRAND_RED,
          fallbackData: [
            { label: "09:00", count: 180 },
            { label: "10:00", count: 390 },
            { label: "11:00", count: 580 },
            { label: "12:00", count: 750 },
            { label: "13:00", count: 980 },
            { label: "14:00", count: 1248 },
          ],
        },
      ],
    },
    "region-alerts": {
      metrics: [
        { key: "active_intrusions", title: "Active Intrusion - Camera 03", fallbackValue: "1", accent: "red" },
        { key: "total_intrusions", title: "Total Breaches Today", fallbackValue: "12", accent: "red" },
        { key: "most_vulnerable_zone", title: "Highest Risk Zone", fallbackValue: "Loading Gate", accent: "blue" },
        { key: "time_since_last_breach", title: "Time Since Last Breach", fallbackValue: "18 min", accent: "blue" },
      ],
      charts: [
        {
          title: "Breaches by Zone",
          description: "Alert volume by zone and camera location.",
          type: "bar",
          labelKey: "label",
          valueKey: "count",
          color: BRAND_RED,
          forceFallback: true,
          tooltipLabel: "Breaches",
          fallbackData: [
            { label: "Loading Gate / Cam 03", count: 5 },
            { label: "Server Bay / Cam 01", count: 3 },
            { label: "Perimeter A / Cam 07", count: 2 },
            { label: "Storage Aisle / Cam 05", count: 2 },
          ],
        },
        {
          title: "Breach Frequency Over Last 24 Hours",
          description: "Breach frequency over last 24 hours.",
          type: "line",
          labelKey: "label",
          valueKey: "count",
          color: BRAND_RED,
          forceFallback: true,
          tooltipLabel: "Breaches",
          fallbackData: [
            { label: "6:00 AM", count: 2 },
            { label: "10:00 AM", count: 4 },
            { label: "2:00 PM", count: 5 },
            { label: "6:00 PM", count: 1 },
          ],
        },
      ],
    },
    "queue-management": {
      metrics: [
        { key: "current_queue_length", title: "Current Queue Length", fallbackValue: "8", accent: "blue" },
        { key: "average_wait_time_min", title: "Average Wait Time", fallbackValue: "6.4 min", accent: "blue", unit: " min" },
        { key: "max_queue_length", title: "Maximum Queue Today", fallbackValue: "15", accent: "blue" },
        { key: "service_abandonment", title: "Service Abandonment", fallbackValue: "3", accent: "red" },
      ],
      charts: [
        {
          title: "Queue Length Over Time",
          description: "Observed queue build-up through the service window.",
          type: "line",
          labelKey: "label",
          valueKey: "count",
          metricKey: "current_queue_length",
          color: BRAND_BLUE,
          fallbackData: [
            { label: "10:00", count: 3 },
            { label: "10:30", count: 5 },
            { label: "11:00", count: 8 },
            { label: "11:30", count: 7 },
            { label: "12:00", count: 10 },
          ],
        },
        {
          title: "Wait Time by Counter",
          description: "Service pressure by queue cluster.",
          type: "bar",
          labelKey: "label",
          valueKey: "count",
          color: BRAND_RED,
          fallbackData: [
            { label: "Counter 1", count: 4.3 },
            { label: "Counter 2", count: 6.1 },
            { label: "Counter 3", count: 7.4 },
            { label: "Counter 4", count: 5.2 },
          ],
        },
      ],
    },
    "speed-estimation": {
      metrics: [
        { key: "total_vehicles", title: "Total Vehicles Scanned", fallbackValue: "184", accent: "blue" },
        { key: "avg_speed_kmh", title: "Average Speed", fallbackValue: "47.8 km/h", accent: "blue", unit: " km/h" },
        { key: "speeding_violations", title: "Speeding Violations", fallbackValue: "14", accent: "red" },
        { key: "max_speed_kmh", title: "Max Speed Detected", fallbackValue: "82 km/h", accent: "red", unit: " km/h" },
      ],
      charts: [
        {
          title: "Average Speed Trend",
          description: "Average traffic speed throughout the day",
          type: "line",
          labelKey: "label",
          valueKey: "count",
          metricKey: "avg_speed_kmh",
          color: BRAND_BLUE,
          fallbackData: [
            { label: "09:00", count: 41 },
            { label: "11:00", count: 46 },
            { label: "13:00", count: 49 },
            { label: "15:00", count: 48 },
          ],
        },
        {
          title: "Speeding Violations by Segment",
          description: "Hot spots where violations are clustering.",
          type: "bar",
          labelKey: "label",
          valueKey: "count",
          color: BRAND_RED,
          fallbackData: [
            { label: "North Gate", count: 3 },
            { label: "Main Stretch", count: 6 },
            { label: "Dock Road", count: 4 },
            { label: "Exit Ramp", count: 1 },
          ],
        },
      ],
    },
    "fire-detection": {
      metrics: [
        { key: "total_incidents", title: "Incidents This Week", fallbackValue: "12", accent: "red" },
        { key: "highest_location", title: "Top Alert Location", fallbackValue: "Warehouse / Cam 02", accent: "blue" },
        { key: "threat_confidence", title: "Threat Confidence", fallbackValue: "94%", accent: "blue" },
        { key: "risk_level", title: "Risk Level", fallbackValue: "High", accent: "red" },
      ],
      charts: [
        {
          title: "Incidents by Weekday",
          description: "Alert counts by weekday across Warehouse, Lobby, and Server Bay.",
          type: "bar",
          labelKey: "label",
          valueKey: "count",
          color: BRAND_RED,
          forceFallback: true,
          fallbackData: [
            { label: "Mon", count: 1 },
            { label: "Tue", count: 2 },
            { label: "Wed", count: 1 },
            { label: "Thu", count: 3 },
            { label: "Fri", count: 2 },
            { label: "Sat", count: 2 },
            { label: "Sun", count: 1 },
          ],
        },
        {
          title: "Threat Confidence Levels",
          description: "Confidence levels across active alert locations.",
          type: "bar",
          labelKey: "label",
          valueKey: "count",
          color: BRAND_BLUE,
          forceFallback: true,
          valueFormatter: (value) => `${value}%`,
          fallbackData: [
            { label: "Warehouse / Cam 02", count: 94 },
            { label: "Lobby / Cam 01", count: 88 },
            { label: "Server Bay / Cam 04", count: 91 },
          ],
        },
      ],
    },
    "class-wise-object-counting": {
      kpiTagMode: "none",
      metrics: [
        { key: "total_vehicles", title: "Total Vehicles", fallbackValue: "312", accent: "blue" },
        {
          key: "dominant_class",
          title: "Dominant Class",
          fallbackValue: "Cars",
          accent: "blue",
          getLiveValue: (metrics) => {
            const classes = [
              { label: "Cars", value: metrics.cars ?? 0 },
              { label: "Trucks", value: metrics.trucks ?? 0 },
              { label: "Buses", value: metrics.buses ?? 0 },
              { label: "Bikes", value: metrics.motorcycles ?? 0 },
            ];
            return classes.sort((a, b) => b.value - a.value)[0]?.label;
          },
        },
        { key: "motorcycles", title: "Two-Wheeler Count", fallbackValue: "58", accent: "blue" },
        {
          key: "commercial_private_ratio",
          title: "Commercial vs Private Ratio",
          fallbackValue: "38% / 62%",
          accent: "blue",
          getLiveValue: (metrics) => {
            const total = metrics.total_vehicles ?? 0;
            if (!total) return null;
            const commercial = (metrics.trucks ?? 0) + (metrics.buses ?? 0);
            const privateCount = (metrics.cars ?? 0) + (metrics.motorcycles ?? 0);
            return `${Math.round((commercial / total) * 100)}% / ${Math.round((privateCount / total) * 100)}%`;
          },
        },
      ],
      charts: [
        {
          title: "Traffic Volume by Hour",
          description: "Tracked vehicle counts throughout the shift.",
          type: "line",
          labelKey: "label",
          valueKey: "count",
          color: BRAND_BLUE,
          fallbackData: [
            { label: "09:00", count: 65 },
            { label: "11:00", count: 85 },
            { label: "13:00", count: 110 },
            { label: "15:00", count: 52 },
          ],
        },
      ],
    },
    "object-tracking": {
      metrics: [
        { key: "total_tracked", title: "Active Assets Tracked", fallbackValue: "11", accent: "blue" },
        { key: "path_intersections", title: "Path Intersections", fallbackValue: "4", accent: "red" },
        { key: "idle_assets", title: "Idle Assets", fallbackValue: "2", accent: "blue" },
        { key: "out_of_bounds", title: "Out of Bounds", fallbackValue: "1", accent: "red" },
      ],
      charts: [
        {
          title: "Asset Volume Over Time",
          description: "Tracked object counts throughout the shift",
          type: "bar",
          labelKey: "label",
          valueKey: "count",
          color: BRAND_RED,
          fallbackData: [
            { label: "09:00", count: 3 },
            { label: "11:00", count: 4 },
            { label: "13:00", count: 2 },
            { label: "15:00", count: 2 },
          ],
        },
      ],
    },
    "ppe-detection": {
      metrics: [
        { key: "avg_compliance_rate", title: "Overall Safety Score", fallbackValue: "92%", accent: "blue", format: "percent" },
        { key: "total_violations", title: "Active Violations", fallbackValue: "6", accent: "red" },
        { key: "highest_risk_zone", title: "Highest Risk Zone", fallbackValue: "Assembly Line B", accent: "red" },
        { key: "missing_helmets", title: "Missing Helmets", fallbackValue: "4", accent: "red" },
      ],
      charts: [
        {
          title: "Violations Over Time",
          description: "Helmet vs vest violations over the current shift.",
          type: "stackedBar",
          labelKey: "label",
          stackKeys: ["helmet", "vest"],
          stackColors: [BRAND_RED, BRAND_BLUE],
          forceFallback: true,
          fallbackData: [
            { label: "6:00 AM", helmet: 1, vest: 0 },
            { label: "9:00 AM", helmet: 1, vest: 1 },
            { label: "12:00 PM", helmet: 0, vest: 1 },
            { label: "3:00 PM", helmet: 2, vest: 0 },
          ],
        },
        {
          title: "Violations by Zone",
          description: "Helmet vs vest violations by monitored zone.",
          type: "stackedBar",
          labelKey: "label",
          stackKeys: ["helmet", "vest"],
          stackColors: [BRAND_RED, BRAND_BLUE],
          forceFallback: true,
          fallbackData: [
            { label: "Assembly Line B", helmet: 2, vest: 1 },
            { label: "Loading Dock", helmet: 1, vest: 1 },
            { label: "Warehouse Gate", helmet: 1, vest: 0 },
          ],
        },
      ],
    },
  };

  return configs[useCaseId] ?? {
    metrics: [{ key: "frames_analyzed", title: "Frames Analyzed", fallbackValue: "0", accent: "blue" }],
    charts: [
      {
        title: "Run History",
        description: "Recent analysis history.",
        type: "bar",
        labelKey: "label",
        valueKey: "count",
        color: BRAND_BLUE,
        fallbackData: [{ label: "Run 1", count: 0 }],
      },
      {
        title: "Status Trend",
        description: "Recent status trend.",
        type: "line",
        labelKey: "label",
        valueKey: "count",
        color: BRAND_RED,
        fallbackData: [{ label: "Run 1", count: 0 }],
      },
    ],
  };
}

function formatMetricValue(value, metric) {
  if (metric.computeValue) return metric.computeValue(value);
  if (typeof value === "string") return value;
  if (metric.format === "percent") return `${Number(value).toFixed(1)}%`;
  if (metric.format === "percentNormalized") return `${Math.round(Number(value) * 100)}%`;
  if (metric.unit) return `${Number(value).toFixed(metric.unit.includes("km/h") || metric.unit.includes("min") ? 1 : 0)}${metric.unit}`;
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
  return String(value);
}

function buildChartData(jobHistory, chart) {
  if (chart.forceFallback) return chart.fallbackData;
  const completed = jobHistory.filter((job) => job.status === "completed" && job.metrics);
  if (chart.metricKey && completed.length > 0) {
    const liveData = completed
      .slice(0, 8)
      .reverse()
      .map((job) => ({
        [chart.labelKey]: formatDashboardTimestamp(job.created_at),
        [chart.valueKey]: Number(job.metrics?.[chart.metricKey] ?? 0),
      }));
    if (liveData.some((point) => point[chart.valueKey] > 0)) return liveData;
  }
  return chart.fallbackData;
}

function resolveMetricLiveValue(metric, latestMetrics) {
  if (!latestMetrics) return null;
  if (metric.getLiveValue) return metric.getLiveValue(latestMetrics);
  return latestMetrics[metric.key];
}

function formatDashboardTimestamp(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "12:00 PM";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatPlaygroundDetection(detection) {
  if (detection.helmet || detection.vest || detection.shoes) {
    return `${detection.class} | Helmet: ${detection.helmet ?? "?"} | Vest: ${detection.vest ?? "?"} | Shoes: ${detection.shoes ?? "?"}`;
  }
  if (detection.zone_status) {
    return `${detection.class} | Zone: ${detection.zone_status}`;
  }
  if (["vehicles scanned", "avg speed km/h", "max speed km/h", "speeding violations"].includes(detection.class)) {
    return `${detection.class}: ${detection.confidence}`;
  }
  return `${detection.class} (${Math.round(detection.confidence * 100)}%)`;
}

// ── Shared Components ────────────────────────────────────────────────────

function SidebarLink({ active = false, label, onClick }) {
  return (
    <button
      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${active ? "border-brandBlue bg-brandBlue text-white" : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50"}`}
      onClick={onClick} type="button"
    >
      <span>{label}</span>
      {active && <span className="h-2 w-2 rounded-full bg-brandRed" />}
    </button>
  );
}

function UseCaseCard({ item, onClick }) {
  return (
    <button
      className="group rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-panel transition hover:-translate-y-1 hover:border-brandBlue/35"
      onClick={onClick} type="button"
    >
      <div className="relative h-48 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        <Image alt={`${item.title} use case preview`} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" fill priority={item.id === "ppe-detection"} sizes="(min-width: 1280px) 28vw, 100vw" src={item.image} />
      </div>
      <div className="mt-5 flex items-center gap-3">
        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.accent }} />
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{item.category}</div>
      </div>
      <h2 className="mt-3 text-xl font-semibold text-slate-900">{item.title}</h2>
      <p className="mt-3 min-h-[3rem] text-sm leading-6 text-slate-500">{item.description}</p>
    </button>
  );
}

function ChartCard({ chart }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel">
      <h3 className="text-lg font-semibold text-slate-900">{chart.title}</h3>
      <p className="mt-1 text-sm text-slate-500">{chart.description}</p>
      <div className="mt-6 h-72">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === "line" ? (
            <LineChart data={chart.data}>
              <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" />
              <XAxis dataKey={chart.labelKey} stroke="#64748B" tick={{ fontSize: 12 }} />
              <YAxis stroke="#64748B" tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => [chart.valueFormatter ? chart.valueFormatter(value) : value, chart.tooltipLabel ?? chart.title]} />
              {typeof chart.goalValue === "number" && (
                <ReferenceLine
                  y={chart.goalValue}
                  stroke="#94A3B8"
                  strokeDasharray="6 6"
                  label={{ value: `Goal: ${chart.goalValue.toLocaleString()}`, fill: "#64748B", fontSize: 12, position: "insideTopRight" }}
                />
              )}
              <Line type="monotone" dataKey={chart.valueKey} stroke={chart.color} strokeWidth={3} dot={{ fill: chart.color, r: 4 }} />
            </LineChart>
          ) : chart.type === "stackedBar" ? (
            <BarChart data={chart.data}>
              <CartesianGrid stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey={chart.labelKey} stroke="#64748B" tick={{ fontSize: 12 }} />
              <YAxis stroke="#64748B" tick={{ fontSize: 12 }} />
              <Tooltip />
              {(chart.stackKeys ?? []).map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="violations"
                  fill={(chart.stackColors?.[index]) ?? chart.color ?? BRAND_BLUE}
                  radius={index === (chart.stackKeys?.length ?? 0) - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          ) : (
            <BarChart data={chart.data}>
              <CartesianGrid stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey={chart.labelKey} stroke="#64748B" tick={{ fontSize: 12 }} />
              <YAxis stroke="#64748B" tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => [chart.valueFormatter ? chart.valueFormatter(value) : value, chart.tooltipLabel ?? chart.title]} />
              <Bar dataKey={chart.valueKey} fill={chart.color} radius={[6, 6, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MetricCard({ accent = "blue", title, value, statusLabel = "Demo KPI" }) {
  const accentClasses =
    accent === "red"
      ? "border-brandRed/20 bg-brandRed/5 text-brandRed"
      : "border-brandBlue/15 bg-brandBlue/[0.03] text-brandBlue";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-panel">
      {statusLabel ? (
        <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${accentClasses}`}>
          {statusLabel}
        </div>
      ) : null}
      <div className="mt-4 text-sm font-medium text-slate-500">{title}</div>
      <div className={`mt-2 text-4xl font-semibold tracking-tight ${accent === "red" ? "text-brandRed" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}
