export const goalOptions = [
  {
    value: "best-accuracy",
    label: "Catch more real issues",
    helper: "Push for the strongest result, even if training takes a little longer.",
  },
  {
    value: "fewer-false-alarms",
    label: "Reduce noisy alerts",
    helper: "Cut down false warnings so teams trust the system more.",
  },
  {
    value: "balanced-tradeoff",
    label: "Keep it balanced",
    helper: "Aim for a good mix of quality, speed, and model size.",
  },
  {
    value: "faster-inference",
    label: "Make it faster",
    helper: "Favor quicker results when response time matters most.",
  },
  {
    value: "smaller-model",
    label: "Keep it smaller",
    helper: "Prepare a lighter version for easier rollout on smaller devices.",
  },
];

export const trainingModeOptions = [
  {
    value: "quick-tune",
    label: "Quick check",
    helper: "Fastest path to a first improved version using safe defaults.",
  },
  {
    value: "balanced",
    label: "Recommended",
    helper: "Best choice for most teams. Better quality without a long wait.",
  },
  {
    value: "deep-optimization",
    label: "Deep tune",
    helper: "Spend more time to search for a stronger result.",
  },
];

export const stopConditionOptions = [
  {
    value: "auto-stop",
    label: "Stop when it stops improving",
  },
  {
    value: "time-budget",
    label: "Stop after a set time",
  },
  {
    value: "epochs",
    label: "Stop after a set number of rounds",
  },
];

export const DEFAULT_ADVANCED_SETTINGS = {
  epochs: "40",
  batchSize: "16",
  imageSize: "960",
  learningRate: "cosine",
  earlyStopping: "8",
  validationSplit: "20",
  testSplit: "10",
  checkpointFrequency: "5",
  optimizer: "auto",
  exportFormats: "onnx, torchscript",
  thresholdTuning: true,
  classRebalance: true,
  augmentationProfile: "balanced",
  experimentTag: "site-adaptation-v1",
  notes: "",
};

const sharedChecklist = [
  "Bring 1 to 3 representative camera angles from the real site.",
  "Mix easy scenes with hard scenes such as glare, occlusion, and low light.",
  "If data is unlabeled, start assisted labeling before training.",
  "We will standardize formats and prepare YOLO-compatible splits automatically.",
];

const sharedFormats = [
  "ZIP of images",
  "ZIP of video clips",
  "YOLO labels",
  "CVAT / Label Studio export",
  "Mixed raw CCTV frames",
];

const useCaseConfigs = {
  "ppe-detection": {
    heroTitle: "Improve this PPE model with your own site data",
    heroSummary:
      "Start from the current PPE model, add examples from your factory or warehouse, and let the platform learn your helmets, vests, lighting, and camera angles.",
    supportedFormats: sharedFormats,
    datasetChecklist: sharedChecklist,
    baseModels: [
      { value: "ppe-fast", label: "PPE Fast", tradeoff: "Faster", helper: "Good for quick pilots and edge devices." },
      { value: "ppe-balanced", label: "PPE Balanced", tradeoff: "Recommended", helper: "Best overall tradeoff for most industrial sites." },
      { value: "ppe-accurate", label: "PPE Accurate", tradeoff: "Highest accuracy", helper: "Stronger recall for hard hats and vests under difficult conditions." },
    ],
    recommendedBaseModelId: "ppe-balanced",
    recommendedGoalId: "fewer-false-alarms",
    recommendedTrainingModeId: "balanced",
    extensionTitle: "Site-specific safety context",
    extensionDescription: "Capture operating conditions that often change PPE performance, such as camera height, work zones, and which safety items are mandatory.",
    extensionDefaults: {
      cameraProfile: "factory-floor",
      lightingProfile: "mixed-indoor",
      policyFocus: "helmet-vest",
      notes: "",
    },
  },
  "region-alerts": {
    heroTitle: "Adapt region alerts to your real zones",
    heroSummary:
      "Use footage from your site to make restricted-zone alerts more reliable. The platform can check your data, keep zone context in view, and compare a better version before you replace anything.",
    supportedFormats: sharedFormats,
    datasetChecklist: sharedChecklist,
    baseModels: [
      { value: "region-fast", label: "Region Fast", tradeoff: "Faster", helper: "Lower latency for quick alerting in simpler scenes." },
      { value: "region-balanced", label: "Region Balanced", tradeoff: "Recommended", helper: "Best default for entrances, aisles, and hazard zones." },
      { value: "region-guard", label: "Region Guard", tradeoff: "Highest accuracy", helper: "More robust around overlap, occlusion, and crowded zones." },
    ],
    recommendedBaseModelId: "region-balanced",
    recommendedGoalId: "fewer-false-alarms",
    recommendedTrainingModeId: "balanced",
    extensionTitle: "Zone configuration context",
    extensionDescription: "Prepare the UI for polygon packs, dwell rules, and entry / exit preferences that will be needed when the backend arrives.",
    extensionDefaults: {
      zonePack: "primary-security-zones",
      alertDwellSeconds: "2.5",
      directionMode: "any-entry",
      bufferFrames: "6",
    },
  },
  "fire-detection": {
    heroTitle: "Tune fire and smoke detection for your environment",
    heroSummary:
      "Bring footage from your cameras, flame sources, smoke conditions, and lighting. We will guide data checks, training, comparison, and go-live decisions without touching the current model until you choose.",
    supportedFormats: sharedFormats,
    datasetChecklist: sharedChecklist,
    baseModels: [
      { value: "fire-fast", label: "Fire Fast", tradeoff: "Faster", helper: "Lower runtime cost for broad early-warning coverage." },
      { value: "fire-balanced", label: "Fire Balanced", tradeoff: "Recommended", helper: "Strong default for flame and smoke monitoring." },
      { value: "fire-watch", label: "Fire Watch", tradeoff: "Highest accuracy", helper: "Improved sensitivity for early smoke cues and hard scenes." },
    ],
    recommendedBaseModelId: "fire-balanced",
    recommendedGoalId: "best-accuracy",
    recommendedTrainingModeId: "balanced",
    extensionTitle: "Scene-specific guidance",
    extensionDescription: "Keep room for smoke density preferences, nuisance sources, and shift-specific conditions without making the default experience technical.",
    extensionDefaults: {
      cameraProfile: "ceiling-mounted",
      lightingProfile: "mixed-indoor",
      policyFocus: "smoke-first-alerting",
      notes: "",
    },
  },
  "speed-estimation": {
    heroTitle: "Tune speed estimation for your camera geometry",
    heroSummary:
      "Speed estimation needs both strong detection and scene calibration. This guided flow keeps the experience simple, while leaving room for things like frame rate, reference distance, and lane setup.",
    supportedFormats: [...sharedFormats, "Calibration sheet / reference notes"],
    datasetChecklist: [...sharedChecklist, "Include at least one clip with a known distance or calibration reference."],
    baseModels: [
      { value: "speed-fast", label: "Speed Fast", tradeoff: "Faster", helper: "Quick feedback for broad traffic monitoring." },
      { value: "speed-balanced", label: "Speed Balanced", tradeoff: "Recommended", helper: "Good accuracy with manageable calibration overhead." },
      { value: "speed-precision", label: "Speed Precision", tradeoff: "Highest accuracy", helper: "Best when overspeeding decisions need tighter error tolerance." },
    ],
    recommendedBaseModelId: "speed-balanced",
    recommendedGoalId: "balanced-tradeoff",
    recommendedTrainingModeId: "balanced",
    extensionTitle: "Calibration settings",
    extensionDescription: "Reserve space for use-case-specific fields such as FPS, meters-per-pixel, reference distance, lane setup, and acceptable speed error tolerance.",
    extensionDefaults: {
      calibrationFps: "25",
      referenceDistanceMeters: "20",
      metersPerPixel: "0.06",
      laneProfile: "two-way-road",
      speedToleranceKmh: "3",
    },
  },
  "queue-management": {
    heroTitle: "Tune queue understanding for your service counters",
    heroSummary:
      "Adapt the model to your counters, customer flow, and camera angle so queue length, waiting time, and queue alerts are more reliable in your environment.",
    supportedFormats: sharedFormats,
    datasetChecklist: [...sharedChecklist, "Include normal and peak traffic periods so staffing patterns are represented."],
    baseModels: [
      { value: "queue-fast", label: "Queue Fast", tradeoff: "Faster", helper: "Useful when you need quick operational feedback." },
      { value: "queue-balanced", label: "Queue Balanced", tradeoff: "Recommended", helper: "Best default for retail, service desks, and gates." },
      { value: "queue-service", label: "Queue Service Focus", tradeoff: "Highest accuracy", helper: "Better when customer density and waiting time accuracy matter most." },
    ],
    recommendedBaseModelId: "queue-balanced",
    recommendedGoalId: "balanced-tradeoff",
    recommendedTrainingModeId: "balanced",
    extensionTitle: "Queue-specific settings",
    extensionDescription: "Keep room for counter definitions, service-rate assumptions, breach thresholds, and customer flow settings that will eventually be backend-driven.",
    extensionDefaults: {
      counterLayout: "single-line-multi-counter",
      serviceRatePerMinute: "7",
      breachBufferCount: "3",
      customerFocus: "all-customers",
    },
  },
  "class-wise-object-counting": {
    heroTitle: "Adapt class-wise counting to your traffic mix",
    heroSummary:
      "Fine-tune the detector on your road or yard conditions so counts by class stay reliable across camera positions, lighting, and traffic mix.",
    supportedFormats: sharedFormats,
    datasetChecklist: [...sharedChecklist, "Include every important class you expect to count in production."],
    baseModels: [
      { value: "count-fast", label: "Counting Fast", tradeoff: "Faster", helper: "Good when throughput matters more than class detail." },
      { value: "count-balanced", label: "Counting Balanced", tradeoff: "Recommended", helper: "Balanced default for most roads and logistics yards." },
      { value: "count-accurate", label: "Counting Accurate", tradeoff: "Highest accuracy", helper: "Use when class separation and count quality are the priority." },
    ],
    recommendedBaseModelId: "count-balanced",
    recommendedGoalId: "best-accuracy",
    recommendedTrainingModeId: "balanced",
    extensionTitle: "Scene-specific guidance",
    extensionDescription: "Leave space for expected count baselines, camera perspective notes, and class priority rules without overcomplicating the first pass.",
    extensionDefaults: {
      cameraProfile: "roadside-fixed",
      lightingProfile: "day-night-mix",
      policyFocus: "cars-trucks-bikes",
      notes: "",
    },
  },
  "object-tracking": {
    heroTitle: "Improve tracking quality for your scene",
    heroSummary:
      "Tune for steadier tracking and cleaner path quality using footage from your actual cameras. The flow stays simple up front while still leaving room for deeper controls later.",
    supportedFormats: sharedFormats,
    datasetChecklist: [...sharedChecklist, "Include clips with occlusion, crossing paths, and long dwell behavior."],
    baseModels: [
      { value: "track-fast", label: "Tracking Fast", tradeoff: "Faster", helper: "Better for lighter workloads and shorter tracks." },
      { value: "track-balanced", label: "Tracking Balanced", tradeoff: "Recommended", helper: "Good starting point for most object tracking tasks." },
      { value: "track-identity", label: "Tracking Identity Focus", tradeoff: "Highest accuracy", helper: "Better when identity continuity matters more than runtime." },
    ],
    recommendedBaseModelId: "track-balanced",
    recommendedGoalId: "best-accuracy",
    recommendedTrainingModeId: "balanced",
    extensionTitle: "Tracking-specific settings",
    extensionDescription: "Prepare the UI for identity consistency, occlusion tolerance, lost-track settings, and path inference options without exposing all of that by default.",
    extensionDefaults: {
      identityPriority: "balanced",
      occlusionTolerance: "medium",
      lostTrackFrames: "24",
      pathMode: "zones-and-paths",
    },
  },
};

export function getFineTuningConfig(useCase) {
  return (
    useCaseConfigs[useCase.id] ?? {
      heroTitle: `Improve ${useCase.title} with your own data`,
      heroSummary:
        "Start from the current model, bring real-world data from your environment, and follow a guided path from dataset checks to model promotion.",
      supportedFormats: sharedFormats,
      datasetChecklist: sharedChecklist,
      baseModels: [
        { value: "balanced-default", label: "Balanced", tradeoff: "Recommended", helper: "Good quality, reasonable runtime, and safer defaults." },
      ],
      recommendedBaseModelId: "balanced-default",
      recommendedGoalId: "balanced-tradeoff",
      recommendedTrainingModeId: "balanced",
      extensionTitle: "Use-case-specific guidance",
      extensionDescription: "This area is ready for additional controls when the backend contract is finalized.",
      extensionDefaults: {
        cameraProfile: "general",
        lightingProfile: "mixed",
        policyFocus: "balanced",
        notes: "",
      },
    }
  );
}
