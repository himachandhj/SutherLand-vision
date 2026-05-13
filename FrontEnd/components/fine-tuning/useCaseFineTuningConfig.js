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
  "crack-detection": {
    heroTitle: "Fine-tune defect detection for your inspection surfaces",
    heroSummary:
      "Prepare defect detection for roads, concrete walls, bridges, pavements, and industrial inspection surfaces. Use representative examples that include multiple visible defect types and clean surfaces, confirm labels, and keep manual labeling available if the current model is not installed yet.",
    supportedFormats: sharedFormats,
    datasetChecklist: [
      ...sharedChecklist,
      "Include multiple defect types plus clean surfaces so the detector learns both what to detect and what to ignore.",
    ],
    baseModels: [
      { value: "crack-current", label: "Crack Current", tradeoff: "Recommended", helper: "Continue from the installed crack detector." },
      { value: "crack-fast", label: "Crack Fast", tradeoff: "Faster", helper: "Start from a lightweight YOLO model for quick checks." },
      { value: "crack-accurate", label: "Crack Accurate", tradeoff: "Highest accuracy", helper: "Start from a stronger YOLO model for harder surface conditions." },
    ],
    recommendedBaseModelId: "crack-current",
    recommendedGoalId: "best-accuracy",
    recommendedTrainingModeId: "balanced",
    extensionTitle: "Inspection guidance",
    extensionDescription: "Capture the surface types, crack scale, and camera distance that matter most for your inspection workflow.",
    extensionDefaults: {
      surfaceTypes: "concrete-road-bridge",
      crackScale: "hairline-to-visible",
      captureProfile: "close-range-inspection",
      notes: "",
    },
  },
  "unsafe-behavior-detection": {
    heroTitle: "Fine-tune unsafe behavior detection for workplace events",
    heroSummary:
      "Prepare smoking and mobile phone usage event labels from real workplace scenes. The installed smoking detector can help with smoking suggestions when available, while phone usage labels should be reviewed manually.",
    supportedFormats: sharedFormats,
    datasetChecklist: [
      ...sharedChecklist,
      "Include both smoking and phone-usage examples when possible, plus clean workplace scenes with no unsafe behavior.",
    ],
    baseModels: [
      {
        value: "unsafe-current",
        label: "Unsafe Current",
        tradeoff: "Recommended",
        helper: "Continue from the installed smoking detector. Phone usage still uses the COCO person-phone rule in inference.",
      },
      {
        value: "unsafe-fast",
        label: "Unsafe Fast",
        tradeoff: "Faster",
        helper: "Start from a lightweight YOLO model for quick checks on smoking and phone-usage labels.",
      },
      {
        value: "unsafe-accurate",
        label: "Unsafe Accurate",
        tradeoff: "Highest accuracy",
        helper: "Start from a stronger YOLO model for harder workplace scenes.",
      },
    ],
    recommendedBaseModelId: "unsafe-current",
    recommendedGoalId: "best-accuracy",
    recommendedTrainingModeId: "balanced",
    extensionTitle: "Unsafe behavior guidance",
    extensionDescription: "Use workplace scenes that clearly show smoking behavior and visible phone usage so reviewers can create precise event labels before training setup is enabled.",
    extensionDefaults: {
      targetEvents: "smoking-phone_usage",
      sceneProfile: "indoor-workplace",
      reviewPolicy: "manual-phone-review",
      notes: "",
    },
  },
  "speed-estimation": {
    heroTitle: "Tune Vehicle Analytics for your camera geometry",
    heroSummary:
      "Estimate vehicle speed and count vehicles by class with a single guided flow. Strong detection and scene calibration work together to improve both speed analytics and vehicle counting.",
    supportedFormats: [...sharedFormats, "Calibration sheet / reference notes"],
    datasetChecklist: [...sharedChecklist, "Include at least one clip with a known distance or calibration reference."],
    baseModels: [
      { value: "speed-fast", label: "Speed Fast", tradeoff: "Faster", helper: "Quick feedback for broad traffic monitoring." },
      { value: "speed-balanced", label: "Speed Balanced", tradeoff: "Recommended", helper: "Good accuracy with manageable calibration overhead." },
      { value: "speed-accurate", label: "Speed Accurate", tradeoff: "Highest accuracy", helper: "Best when overspeeding decisions need tighter error tolerance." },
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
    deprecated: true,
    hidden: true,
    heroTitle: "Adapt class-wise counting to your traffic mix",
    heroSummary:
      "Fine-tune the detector on your road or yard conditions so better detections lead to more accurate counts across camera positions, lighting, and traffic mix.",
    supportedFormats: sharedFormats,
    datasetChecklist: [...sharedChecklist, "Include every important class you expect to count in production."],
    baseModels: [
      { value: "counting-fast", label: "Counting Fast", tradeoff: "Faster", helper: "Good when throughput matters more than class detail." },
      { value: "counting-balanced", label: "Counting Balanced", tradeoff: "Recommended", helper: "Balanced default for most roads and logistics yards." },
      { value: "counting-accurate", label: "Counting Accurate", tradeoff: "Highest accuracy", helper: "Use when class separation and count quality are the priority." },
    ],
    recommendedBaseModelId: "counting-balanced",
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
    heroTitle: "Improve detector inputs for object tracking",
    heroSummary:
      "Fine-tune the detector used inside the tracking pipeline with footage from your real cameras. Better person and vehicle detections improve downstream tracking without claiming to tune IDs, re-identification, or trajectory logic.",
    supportedFormats: sharedFormats,
    datasetChecklist: [...sharedChecklist, "Include clips with occlusion, overlapping objects, and the person or vehicle classes you expect to track."],
    baseModels: [
      { value: "tracking-fast", label: "Tracking Fast", tradeoff: "Faster", helper: "Better for lighter workloads and shorter tracks." },
      { value: "tracking-balanced", label: "Tracking Balanced", tradeoff: "Recommended", helper: "Good starting point for most object tracking tasks." },
      { value: "tracking-identity-focus", label: "Tracking Identity Focus", tradeoff: "Highest accuracy", helper: "Better when identity continuity matters more than runtime." },
    ],
    recommendedBaseModelId: "tracking-balanced",
    recommendedGoalId: "best-accuracy",
    recommendedTrainingModeId: "balanced",
    extensionTitle: "Detector-focused guidance",
    extensionDescription: "Capture scene conditions that affect detector quality inside the tracking pipeline, such as target classes, crowding, and typical object distance.",
    extensionDefaults: {
      targetClasses: "person-vehicle",
      sceneDensity: "mixed",
      occlusionLevel: "medium",
      distanceProfile: "near-mid-range",
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
