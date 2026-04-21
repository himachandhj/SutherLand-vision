import fireDetectionCover from "../FireDetection.webp";
import objectTrackingCover from "../ObjectTracking.webp";
import ppeDetectionImage from "../PPE_Detection.png";
import queueIntelligenceImage from "../Queue_Intelligence.png";
import restrictedAreaCover from "../RestrictedArea.webp";
import speedEstimationCover from "../SpeedEstimation.jpeg";
import trafficVisibilityImage from "../Traffic_visibility .png";

export const BRAND_BLUE = "#27235C";
export const BRAND_RED = "#DE1B54";
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export const resolveBackendUrl = (value) => {
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return `${API_BASE_URL}${value}`;
};

export const useCases = [
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

export const integrationSupportedUseCases = new Set([
  "ppe-detection",
  "region-alerts",
  "fire-detection",
  "speed-estimation",
  "queue-management",
  "class-wise-object-counting",
  "object-tracking",
]);

export const integrationPrefixDefaults = {
  "ppe-detection": { input_prefix: "ppe/input/", output_prefix: "ppe/output/" },
  "region-alerts": { input_prefix: "region/input/", output_prefix: "region/output/" },
  "fire-detection": { input_prefix: "fire/input/", output_prefix: "fire/output/" },
  "speed-estimation": { input_prefix: "speed/input/", output_prefix: "speed/output/" },
  "queue-management": { input_prefix: "queue/input/", output_prefix: "queue/output/" },
  "class-wise-object-counting": { input_prefix: "counting/input/", output_prefix: "counting/output/" },
  "object-tracking": { input_prefix: "tracking/input/", output_prefix: "tracking/output/" },
};

export function getIntegrationDefaults(useCaseId) {
  return integrationPrefixDefaults[useCaseId] ?? { input_prefix: "input/", output_prefix: "output/" };
}

export const categoryDetails = [
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
];

export const sampleMediaByUseCase = {
  "ppe-detection": [
    { id: "ppe-sample-1", label: "PPE_TEST1.png", src: `${API_BASE_URL}/static/sample-images/PPE_TEST1.png`, type: "image" },
  ],
  "fire-detection": [
    { id: "fire-sample-1", label: "FireDetection_Test.webp", src: `${API_BASE_URL}/static/sample-images/FireDetection_Test.webp`, type: "image" },
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

export const tabs = ["Model Playground", "Integration", "Fine-Tuning", "Dashboard"];
export const tabParamToLabel = { playground: "Model Playground", integration: "Integration", "fine-tuning": "Fine-Tuning", dashboard: "Dashboard" };
export const tabLabelToParam = { "Model Playground": "playground", Integration: "integration", "Fine-Tuning": "fine-tuning", Dashboard: "dashboard" };

export const sectionParamToLabel = Object.fromEntries(categoryDetails.map((category) => [category.param, category.label]));
export const sectionLabelToParam = Object.fromEntries(categoryDetails.map((category) => [category.label, category.param]));

export const useCaseToAnalyticsDashboardSlug = {
  "region-alerts": "region-alerts",
  "queue-management": "queue-management",
  "speed-estimation": "speed-estimation",
  "fire-detection": "fire-detection",
  "class-wise-object-counting": "class-wise-counting",
  "object-tracking": "object-tracking",
  "ppe-detection": "ppe-detection",
};
