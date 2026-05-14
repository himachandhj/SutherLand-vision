import crackDetectionCover from "../CrackDetection.webp";
import fireDetectionCover from "../FireDetection.webp";
import objectTrackingCover from "../ObjectTracking.webp";
import ppeDetectionImage from "../PPE_Detection.png";
import queueIntelligenceImage from "../Queue_Intelligence.png";
import restrictedAreaCover from "../RestrictedArea.webp";
import speedEstimationCover from "../SpeedEstimation.jpeg";
import trafficVisibilityImage from "../Traffic_visibility .png";
import unsafeBehaviorDetectionCover from "../UnsafeBehaviorDetection.webp";

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
    cardTitle: "Region Alerts Detection",
    cardSummary: "Alert when people or vehicles enter restricted zones.",
    cardAvailableVerticals: ["Warehouses", "Factory floors", "Security zones"],
    cardExtendableVerticals: ["Airports", "Hospitals", "Custom zone rules", "More object types"],
    description: "Monitors restricted or risky zones and raises alerts when a person or vehicle enters a defined area in warehouses, factory floors, airports, hospitals, and security zones.",
    currentDescription: "Monitors restricted or risky zones and raises alerts when a person or vehicle enters a defined area in warehouses, factory floors, airports, hospitals, and security zones.",
    extensionDescription: "With custom data and rules, it can support more object types, multiple zone rules, different alert thresholds, and site-specific intrusion policies.",
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
    title: "Vehicle Analytics",
    cardSummary: "Detect, count, and estimate speed for vehicle classes.",
    cardAvailableVerticals: ["Roads", "Parking areas", "Logistics yards"],
    cardExtendableVerticals: ["Toll gates", "Industrial roads", "Lane-wise counting", "Traffic violations"],
    description: "Detects vehicles, estimates speed, and counts vehicle classes such as cars, trucks, buses, and bikes across roads, parking areas, campuses, toll gates, and logistics yards.",
    currentDescription: "Detects vehicles, estimates speed, and counts vehicle classes such as cars, trucks, buses, and bikes across roads, parking areas, campuses, toll gates, and logistics yards.",
    extensionDescription: "With custom training data, it can support special vehicle types, lane-wise counting, traffic violations, parking analytics, and site-specific mobility insights.",
    category: "Traffic Intelligence",
    accent: BRAND_BLUE,
    image: speedEstimationCover,
    backstory: "Traffic and campus operations teams need fast visibility into average speed, peak speed, class-wise vehicle counts, and speeding violations without a dedicated radar stack.",
  },
  {
    id: "fire-detection",
    title: "Fire Detection",
    cardTitle: "Fire and Smoke Detection",
    cardSummary: "Detect fire and smoke early from CCTV or site cameras.",
    cardAvailableVerticals: ["Factories", "Warehouses", "Industrial sites"],
    cardExtendableVerticals: ["Kitchens", "Parking areas", "Gas-flame risk zones", "Overheating zones"],
    description: "Detects early fire and smoke signs from CCTV or site cameras to help safety teams respond faster in factories, warehouses, kitchens, parking areas, and industrial sites.",
    currentDescription: "Detects early fire and smoke signs from CCTV or site cameras to help safety teams respond faster in factories, warehouses, kitchens, parking areas, and industrial sites.",
    extensionDescription: "With client-specific training data, it can be improved to detect sparks, overheating zones, gas-flame risks, and other emergency hazards.",
    category: "Safety & Compliance",
    accent: BRAND_RED,
    image: fireDetectionCover,
    backstory: "Facilities teams need earlier warning than traditional systems can provide. This view surfaces fire and smoke-like activity directly from camera footage.",
  },
  {
    id: "crack-detection",
    title: "Defect Detection",
    cardSummary: "Detect visible surface defects for inspection workflows.",
    cardAvailableVerticals: ["Roads", "Walls", "Floors"],
    cardExtendableVerticals: ["Bridges", "Potholes", "Corrosion", "Leakage detection"],
    description: "Detect surface defects such as cracks, spalling, rust stains, delamination, efflorescence, exposed reinforcement, or structural damage on roads, floors, walls, bridges, and industrial surfaces.",
    currentDescription: "Detect surface defects such as cracks, spalling, rust stains, delamination, efflorescence, exposed reinforcement, or structural damage on roads, floors, walls, bridges, and industrial surfaces.",
    extensionDescription: "With domain-specific data, it can be trained for potholes, corrosion, leakage, surface wear, structural defects, and industry-specific inspection needs.",
    category: "Safety & Compliance",
    accent: BRAND_RED,
    image: crackDetectionCover,
    backstory: "Construction and infrastructure teams can use this to identify visible cracks and surface defects across inspection surfaces before they become larger maintenance risks.",
  },
  {
    id: "unsafe-behavior-detection",
    title: "Unsafe Behavior Detection",
    cardSummary: "Detect unsafe actions in monitored workplace areas.",
    cardAvailableVerticals: ["Factories", "Warehouses", "Safety zones"],
    cardExtendableVerticals: ["Clean rooms", "Construction sites", "Sleeping/eating/running", "Policy violations"],
    description: "Detects unsafe actions such as smoking or mobile phone usage in monitored workplace areas like factories, construction sites, warehouses, clean rooms, and safety-sensitive zones.",
    currentDescription: "Detects unsafe actions such as smoking or mobile phone usage in monitored workplace areas like factories, construction sites, warehouses, clean rooms, and safety-sensitive zones.",
    extensionDescription: "With custom training data, it can detect site-specific unsafe behaviors such as sleeping, eating, running, fighting, restricted actions, or policy violations.",
    category: "Safety & Compliance",
    accent: BRAND_RED,
    image: unsafeBehaviorDetectionCover,
    backstory: "Safety teams can use this to surface smoking and mobile phone usage in monitored areas where distractions or unsafe behavior need quick review.",
  },
  {
    id: "class-wise-object-counting",
    title: "Class-Wise Object Counting",
    description: "Separate counts by class such as cars, trucks, buses, and bikes to understand traffic composition.",
    category: "Traffic Intelligence",
    accent: BRAND_BLUE,
    image: trafficVisibilityImage,
    backstory: "Mobility and logistics teams care about what mix of vehicles uses a road or yard, not just the total. This view highlights class distribution at a glance.",
    hidden: true,
    deprecated: true,
    deprecationNote: "Class-wise counting is now included in Vehicle Analytics under Speed Estimation.",
  },
  {
    id: "object-tracking",
    title: "Object Tracking",
    cardSummary: "Track movement paths of people, vehicles, or equipment.",
    cardAvailableVerticals: ["Surveillance", "Warehouses", "Traffic monitoring"],
    cardExtendableVerticals: ["Retail analytics", "Campus security", "Crowded scenes", "New object types"],
    description: "Tracks people, vehicles, or equipment across video frames to understand movement paths, activity, and asset flow in surveillance, retail, warehouses, traffic, and campuses.",
    currentDescription: "Tracks people, vehicles, or equipment across video frames to understand movement paths, activity, and asset flow in surveillance, retail, warehouses, traffic, and campuses.",
    extensionDescription: "With fine-tuning, it can track new object types, improve performance in crowded scenes, and adapt to client-specific camera angles or environments.",
    category: "Security & Surveillance",
    accent: "#7C3AED",
    image: objectTrackingCover,
    backstory: "Operations and security teams need to follow objects through the frame to understand movement patterns, idle assets, and near misses.",
  },
  {
    id: "ppe-detection",
    title: "PPE Detection",
    cardSummary: "Check safety gear compliance for workers.",
    cardAvailableVerticals: ["Construction", "Factories", "Warehouses"],
    cardExtendableVerticals: ["Mines", "Maintenance zones", "Custom PPE rules", "New safety equipment"],
    description: "Checks whether workers are wearing safety gear such as helmets, vests, gloves, boots, or goggles across construction sites, factories, warehouses, mines, and maintenance zones.",
    currentDescription: "Checks whether workers are wearing safety gear such as helmets, vests, gloves, boots, or goggles across construction sites, factories, warehouses, mines, and maintenance zones.",
    extensionDescription: "With fine-tuning, it can support company-specific PPE rules, new safety equipment, different uniforms, and site-specific compliance policies.",
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
  "crack-detection",
  "unsafe-behavior-detection",
  "speed-estimation",
  "queue-management",
  "class-wise-object-counting",
  "object-tracking",
]);

export const visibleUseCases = useCases.filter((useCase) => !useCase.hidden);

export const integrationPrefixDefaults = {
  "ppe-detection": { input_prefix: "ppe/input/", output_prefix: "ppe/output/" },
  "region-alerts": { input_prefix: "region/input/", output_prefix: "region/output/" },
  "fire-detection": { input_prefix: "fire/input/", output_prefix: "fire/output/" },
  "crack-detection": { input_prefix: "crack/input/", output_prefix: "crack/output/" },
  "unsafe-behavior-detection": { input_prefix: "unsafe_behavior/input/", output_prefix: "unsafe_behavior/output/" },
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
  "crack-detection": "crack-detection",
  "unsafe-behavior-detection": "unsafe-behavior-detection",
  "region-alerts": "region-alerts",
  "queue-management": "queue-management",
  "speed-estimation": "speed-estimation",
  "fire-detection": "fire-detection",
  "class-wise-object-counting": "class-wise-counting",
  "object-tracking": "object-tracking",
  "ppe-detection": "ppe-detection",
};
