const locations = ["Warehouse A", "Warehouse B", "Warehouse C"];
const zones = ["Receiving Bay", "Storage Bay", "Loading Dock", "Dispatch Area", "Forklift Bay", "Packaging Zone"];
const cameras = Array.from({ length: 15 }, (_, index) => `CAM_${String(index + 1).padStart(3, "0")}`);

function timestampFor(index) {
  const base = new Date("2025-04-01T06:00:00");
  base.setDate((index % 28) + 1);
  base.setHours(6 + ((index * 3) % 16), (index * 7) % 60, 0, 0);
  return base.toISOString();
}

function shiftForHour(hour) {
  if (hour >= 6 && hour < 14) return "Morning Shift";
  if (hour >= 14 && hour < 22) return "Swing Shift";
  return "Night Shift";
}

function createRows(length, mapper) {
  return Array.from({ length }, (_, index) => mapper(index));
}

export const dashboardData = {
  "object-counting": createRows(56, (index) => {
    const objectTypes = ["Box", "Pallet", "Crate", "Package"];
    const statusCycle = ["Normal", "Normal", "Over Count", "Normal", "Under Count"];
    const expected = 18 + (index % 10);
    const status = statusCycle[index % statusCycle.length];
    const delta = status === "Over Count" ? 2 + (index % 4) : status === "Under Count" ? -(1 + (index % 3)) : 0;
    const actual = expected + delta;
    return {
      id: `OC-${index + 1}`,
      timestamp: timestampFor(index),
      location: locations[index % locations.length],
      zone: zones[index % zones.length],
      cameraId: cameras[index % cameras.length],
      objectType: objectTypes[index % objectTypes.length],
      objectCount: actual,
      expectedCount: expected,
      countDifference: delta,
      confidenceScore: 0.84 + ((index % 10) * 0.012),
      status,
      inputId: `INP-${1000 + index}`,
    };
  }),
  "region-alerts": createRows(50, (index) => {
    const incidentZones = [
      { zone: "Forklift Bay", zone_type: "Hazardous" },
      { zone: "Loading Dock", zone_type: "Restricted" },
      { zone: "Dispatch Area", zone_type: "Restricted" },
      { zone: "Storage Bay", zone_type: "Cold Storage" },
      { zone: "Receiving Bay", zone_type: "Restricted" },
      { zone: "Packaging Zone", zone_type: "Restricted" },
      { zone: "Forklift Bay", zone_type: "Hazardous" },
      { zone: "Forklift Bay", zone_type: "Hazardous" },
      { zone: "Loading Dock", zone_type: "Restricted" },
      { zone: "Storage Bay", zone_type: "Cold Storage" },
    ];
    const alertCycle = [
      "Hazard Zone Breach",
      "Unauthorized Entry",
      "Loitering",
      "After-Hours Entry",
      "Repeated Intrusion",
      "Crowding in Restricted Zone",
      "Unauthorized Entry",
      "Hazard Zone Breach",
      "Loitering",
      "Repeated Intrusion",
    ];
    const shiftStartHours = [7, 10, 15, 18, 23, 2];
    const zoneConfig = incidentZones[index % incidentZones.length];
    const alert_type = alertCycle[index % alertCycle.length];
    const entry = new Date("2025-04-22T00:00:00");
    entry.setDate(22 + (index % 7));
    entry.setHours(shiftStartHours[index % shiftStartHours.length], (index * 11) % 60, 0, 0);
    const shift = shiftForHour(entry.getHours());
    const duration_sec =
      alert_type === "Loitering"
        ? 210 + (index % 6) * 38
        : alert_type === "Repeated Intrusion"
          ? 130 + (index % 5) * 24
          : alert_type === "Crowding in Restricted Zone"
            ? 95 + (index % 4) * 20
            : alert_type === "After-Hours Entry"
              ? 75 + (index % 4) * 18
              : alert_type === "Hazard Zone Breach"
                ? 160 + (index % 5) * 42
                : 24 + (index % 5) * 12;
    const severity =
      zoneConfig.zone === "Forklift Bay" || alert_type === "Hazard Zone Breach" || duration_sec >= 240
        ? "High"
        : duration_sec >= 90 || alert_type === "Loitering" || alert_type === "Repeated Intrusion"
          ? "Medium"
          : "Low";
    return {
      id: `RA-${String(index + 1).padStart(3, "0")}`,
      camera_id: cameras[(index * 2) % cameras.length],
      zone: zoneConfig.zone,
      zone_type: zoneConfig.zone_type,
      entry_time: entry.toISOString(),
      shift,
      duration_sec,
      alert_type,
      severity,
    };
  }),
  "queue-management": createRows(52, (index) => {
    const ts = new Date(timestampFor(index));
    const maxLimit = 10 + (index % 3) * 2;
    const queueLength = 4 + (index % 9) + (index % 4 === 0 ? 5 : 0);
    const breached = queueLength > maxLimit ? "Yes" : "No";
    const wait = 80 + (index % 12) * 18;
    return {
      id: `QM-${index + 1}`,
      timestamp: ts.toISOString(),
      location: locations[index % locations.length],
      zone: zones[index % zones.length],
      cameraId: cameras[index % cameras.length],
      counterId: `CTR_${String((index % 6) + 1).padStart(2, "0")}`,
      queueLength,
      maxQueueLimit: maxLimit,
      estimatedWaitSec: wait,
      isBreached: breached,
      excessCount: Math.max(queueLength - maxLimit, 0),
      staffCount: (index % 5) + 1,
      status: breached === "Yes" ? "Alert" : "Normal",
    };
  }),
  "speed-estimation": createRows(50, (index) => {
    const objectTypes = ["Forklift", "Truck", "Person"];
    const speedLimits = [5, 10, 15];
    const detectedSpeed = speedLimits[index % 3] + (index % 6) + (index % 5 === 0 ? 6 : 0);
    const overspeed = detectedSpeed > speedLimits[index % 3] ? "Yes" : "No";
    return {
      id: `SE-${index + 1}`,
      timestamp: timestampFor(index),
      location: locations[index % locations.length],
      zone: zones[index % zones.length],
      cameraId: cameras[index % cameras.length],
      objectId: `OBJ-${2000 + index}`,
      objectType: objectTypes[index % objectTypes.length],
      detectedSpeedKmh: detectedSpeed,
      speedLimitKmh: speedLimits[index % speedLimits.length],
      isOverspeeding: overspeed,
      excessSpeed: Math.max(detectedSpeed - speedLimits[index % speedLimits.length], 0),
      confidence: 0.82 + ((index % 8) * 0.015),
      status: overspeed === "Yes" ? "Violation" : "Normal",
    };
  }),
  "fire-detection": createRows(50, (index) => {
    const alertPatterns = [
      { alert_type: "smoke_only", zone: "Forklift Bay" },
      { alert_type: "smoke_only", zone: "Forklift Bay" },
      { alert_type: "fire_and_smoke", zone: "Forklift Bay" },
      { alert_type: "smoke_only", zone: "Forklift Bay" },
      { alert_type: "fire_and_smoke", zone: "Loading Dock" },
      { alert_type: "smoke_only", zone: "Storage Bay" },
      { alert_type: "no_alert", zone: "Packaging Zone" },
      { alert_type: "smoke_only", zone: "Receiving Bay" },
      { alert_type: "fire_and_smoke", zone: "Dispatch Area" },
      { alert_type: "smoke_only", zone: "Forklift Bay" },
    ];
    const pattern = alertPatterns[index % alertPatterns.length];
    const ts = new Date("2025-04-22T06:00:00");
    ts.setDate(22 + (index % 7));
    ts.setHours([6, 8, 11, 14, 16, 19, 22, 1, 4, 13][index % 10], (index * 13) % 60, 0, 0);
    const hasFire = pattern.alert_type === "fire_and_smoke";
    const hasSmoke = pattern.alert_type === "smoke_only" || pattern.alert_type === "fire_and_smoke";
    const fps = 30;
    const firstDetection = pattern.alert_type === "no_alert" ? 0 : pattern.alert_type === "smoke_only" ? 12 + (index % 8) * 7 : 20 + (index % 7) * 9;
    const severity = hasFire ? "High" : hasSmoke ? "Medium" : "None";
    const status = hasFire || hasSmoke ? "Alert" : "Safe";
    const fireFramePct = hasFire ? Number((7 + (index % 6) * 3.5).toFixed(1)) : 0;
    const smokeFramePct = hasSmoke ? Number((12 + (index % 9) * 4.2).toFixed(1)) : 0;
    return {
      id: `FD-${String(index + 1).padStart(3, "0")}`,
      input_id: `FIRE-VID-${String(index + 1).padStart(4, "0")}`,
      camera_id: cameras[(index * 3) % cameras.length],
      location: locations[index % locations.length],
      facility: ["Plant 1", "Plant 2", "Warehouse Annex"][index % 3],
      zone: pattern.zone,
      timestamp: ts.toISOString(),
      shift: shiftForHour(ts.getHours()),
      fire_detected: hasFire ? "Yes" : "No",
      smoke_detected: hasSmoke ? "Yes" : "No",
      alert_type: pattern.alert_type,
      severity,
      status,
      confidence_score: pattern.alert_type === "no_alert" ? 0.18 : Number((0.72 + ((index % 9) * 0.027)).toFixed(2)),
      first_alert_frame: firstDetection * fps,
      fps,
      first_detection_sec: firstDetection,
      fire_frame_pct: fireFramePct,
      smoke_frame_pct: smokeFramePct,
      output_video: pattern.alert_type === "no_alert" ? "" : `minio://warehouse/fire/output_${String(index + 1).padStart(3, "0")}.mp4`,
    };
  }),
  "class-wise-counting": createRows(55, (index) => {
    const classes = ["Truck", "Forklift", "Bike", "Box", "Pallet"];
    const statusCycle = ["Normal", "Over Count", "Normal", "Under Count", "Normal"];
    const expected = 8 + (index % 7);
    const status = statusCycle[index % statusCycle.length];
    const diff = status === "Over Count" ? 2 : status === "Under Count" ? -2 : 0;
    const count = expected + diff;
    const total = count + 4 + (index % 5);
    return {
      id: `CW-${index + 1}`,
      timestamp: timestampFor(index),
      location: locations[index % locations.length],
      zone: zones[index % zones.length],
      cameraId: cameras[index % cameras.length],
      className: classes[index % classes.length],
      classCount: count,
      expectedCount: expected,
      difference: diff,
      totalInFrame: total,
      classPercent: Number(((count / total) * 100).toFixed(1)),
      confidence: 0.8 + ((index % 9) * 0.016),
      status,
    };
  }),
  "object-tracking": createRows(52, (index) => {
    const objectTypes = ["Pallet", "Forklift", "Box", "Truck"];
    const entry = new Date(timestampFor(index));
    const duration = 400 + (index % 10) * 180;
    const exit = new Date(entry.getTime() + duration * 1000);
    const anomaly = duration > 1500 ? "Yes" : "No";
    const nextZone = zones[(index + 1) % zones.length];
    return {
      id: `OT-${index + 1}`,
      timestamp: entry.toISOString(),
      location: locations[index % locations.length],
      zone: zones[index % zones.length],
      cameraId: cameras[index % cameras.length],
      objectId: `TRK-${3000 + index}`,
      objectType: objectTypes[index % objectTypes.length],
      entryTime: entry.toISOString(),
      exitTime: exit.toISOString(),
      durationInZoneSec: duration,
      nextZone,
      pathSequence: `${zones[index % zones.length]} → ${nextZone}`,
      isAnomaly: anomaly,
      status: anomaly === "Yes" ? "Alert" : "Normal",
    };
  }),
  "ppe-detection": createRows(54, (index) => {
    const ts = new Date(timestampFor(index));
    const helmet = index % 4 === 0 ? "No" : "Yes";
    const vest = index % 5 === 0 ? "No" : "Yes";
    const gloves = index % 6 === 0 ? "No" : "Yes";
    const boots = index % 7 === 0 ? "No" : "Yes";
    const violations = [];
    if (helmet === "No") violations.push("Missing Helmet");
    if (vest === "No") violations.push("Missing Vest");
    if (gloves === "No") violations.push("Missing Gloves");
    if (boots === "No") violations.push("Missing Boots");
    return {
      id: `PPE-${index + 1}`,
      timestamp: ts.toISOString(),
      location: locations[index % locations.length],
      zone: zones[index % zones.length],
      cameraId: cameras[index % cameras.length],
      shift: shiftForHour(ts.getHours()),
      personId: `WRK-${4000 + index}`,
      helmet,
      vest,
      gloves,
      boots,
      violationType: violations[0] ?? "Compliant",
      confidence: 0.86 + ((index % 7) * 0.014),
      status: violations.length ? "Violation" : "Compliant",
    };
  }),
};

export const dashboardInfo = {
  "object-counting": "Monitors production-oriented object counts against expected throughput to surface over-count and under-count deviations by zone and camera.",
  "region-alerts": "Shows where restricted-zone violations are happening, when they peak, how serious they are, and which incidents supervisors or security should action first.",
  "queue-management": "Measures queue build-up, staffing impact, breach thresholds, and wait time trends across operational counters and service zones.",
  "speed-estimation": "Estimates movement speed against configured limits to identify overspeeding objects, hotspots, and high-risk zones over time.",
  "fire-detection": "A focused safety view showing where fire and smoke alerts are appearing, how quickly they are detected, and which cameras need the closest attention.",
  "class-wise-counting": "Breaks counts down by tracked class to compare actual versus expected activity and reveal which cameras and zones see the highest class mix.",
  "object-tracking": "Tracks object movements, time spent in zones, path sequences, and anomaly rates to reveal congestion and movement inefficiencies.",
  "ppe-detection": "Measures compliance across workers and shifts, surfacing PPE violations, zone-level risk, and compliance trends over time.",
};

export const globalKeys = {
  location: "location",
  zone: "zone",
  cameraId: "cameraId",
  timestamp: "timestamp",
};
