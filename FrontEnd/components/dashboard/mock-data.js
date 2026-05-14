const locations = ["Warehouse A", "Warehouse B", "Warehouse C"];
const zones = ["Receiving Bay", "Storage Bay", "Loading Dock", "Dispatch Area", "Forklift Bay", "Packaging Zone"];
const cameras = Array.from({ length: 15 }, (_, index) => `CAM_${String(index + 1).padStart(3, "0")}`);
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

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
  "region-alerts": (() => {
    const incidentZones = [
      { zone: "Forklift Bay", zone_type: "Hazardous", location: "Warehouse B" },
      { zone: "Loading Dock", zone_type: "Restricted", location: "Warehouse A" },
      { zone: "Dispatch Area", zone_type: "Restricted", location: "Warehouse C" },
      { zone: "Storage Bay", zone_type: "Cold Storage", location: "Warehouse B" },
      { zone: "Receiving Bay", zone_type: "Restricted", location: "Warehouse A" },
      { zone: "Packaging Zone", zone_type: "Restricted", location: "Warehouse C" },
      { zone: "Forklift Bay", zone_type: "Hazardous", location: "Warehouse B" },
      { zone: "Forklift Bay", zone_type: "Hazardous", location: "Warehouse B" },
      { zone: "Loading Dock", zone_type: "Restricted", location: "Warehouse A" },
      { zone: "Storage Bay", zone_type: "Cold Storage", location: "Warehouse B" },
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
    const cameraPool = ["CAM_002", "CAM_004", "CAM_006", "CAM_008", "CAM_010", "CAM_012", "CAM_014"];

    const buildIncident = (index, overrides = {}) => {
      const zoneConfig = incidentZones[index % incidentZones.length];
      const alert_type = overrides.alert_type ?? alertCycle[index % alertCycle.length];
      const entry = new Date(overrides.entry_time ?? "2025-04-22T00:00:00");
      if (!overrides.entry_time) {
        entry.setDate(22 + (index % 7));
        entry.setHours(shiftStartHours[index % shiftStartHours.length], (index * 11) % 60, 0, 0);
      }
      const duration_sec =
        overrides.duration_sec ??
        (alert_type === "Loitering"
          ? 210 + (index % 6) * 38
          : alert_type === "Repeated Intrusion"
            ? 130 + (index % 5) * 24
            : alert_type === "Crowding in Restricted Zone"
              ? 95 + (index % 4) * 20
              : alert_type === "After-Hours Entry"
                ? 75 + (index % 4) * 18
                : alert_type === "Hazard Zone Breach"
                  ? 160 + (index % 5) * 42
                  : 24 + (index % 5) * 12);
      const severity =
        overrides.severity ??
        (zoneConfig.zone === "Forklift Bay" || alert_type === "Hazard Zone Breach" || duration_sec >= 240
          ? "High"
          : duration_sec >= 90 || alert_type === "Loitering" || alert_type === "Repeated Intrusion"
            ? "Medium"
            : "Low");
      const status =
        overrides.status ??
        (severity === "High" || index % 9 === 0 || alert_type === "Loitering" ? "Open" : "Past");
      const exitTime = status === "Open" ? "" : new Date(entry.getTime() + duration_sec * 1000).toISOString();

      return {
        incident_id: overrides.incident_id ?? `RA-${String(index + 1).padStart(3, "0")}`,
        camera_id: overrides.camera_id ?? cameraPool[index % cameraPool.length],
        location: overrides.location ?? zoneConfig.location,
        zone: overrides.zone ?? zoneConfig.zone,
        zone_type: overrides.zone_type ?? zoneConfig.zone_type,
        shift: overrides.shift ?? shiftForHour(entry.getHours()),
        object_type: overrides.object_type ?? "Person",
        entry_time: entry.toISOString(),
        exit_time: overrides.exit_time ?? exitTime,
        duration_sec,
        alert_type,
        severity,
        status,
        confidence_score: overrides.confidence_score ?? Number((0.82 + ((index % 8) * 0.018)).toFixed(2)),
        tracked_object_id: overrides.tracked_object_id ?? `TRK-${String(700 + index).padStart(4, "0")}`,
        input_reference: overrides.input_reference ?? `minio://region/input/alert_${String(index + 1).padStart(3, "0")}.mp4`,
        output_reference: overrides.output_reference ?? `minio://region/output/alert_${String(index + 1).padStart(3, "0")}.mp4`,
        is_latest_demo_incident: overrides.is_latest_demo_incident ?? false,
      };
    };

    const baseline = createRows(48, (index) => buildIncident(index));
    const latestDemoIncidents = [
      buildIncident(48, {
        incident_id: "RA-049",
        camera_id: "CAM_014",
        location: "Warehouse B",
        zone: "Forklift Bay",
        zone_type: "Hazardous",
        shift: "Swing Shift",
        entry_time: "2025-04-29T18:42:00.000Z",
        duration_sec: 286,
        alert_type: "Hazard Zone Breach",
        severity: "High",
        status: "Open",
        confidence_score: 0.96,
        tracked_object_id: "TRK-8123",
        input_reference: "minio://region/input/sample_forklift_bay_alert.mp4",
        output_reference: "minio://region/output/sample_forklift_bay_alert.mp4",
        is_latest_demo_incident: true,
      }),
      buildIncident(49, {
        incident_id: "RA-050",
        camera_id: "CAM_006",
        location: "Warehouse A",
        zone: "Loading Dock",
        zone_type: "Restricted",
        shift: "Night Shift",
        entry_time: "2025-04-29T23:08:00.000Z",
        duration_sec: 164,
        alert_type: "Unauthorized Entry",
        severity: "Medium",
        status: "Open",
        confidence_score: 0.91,
        tracked_object_id: "TRK-8124",
        input_reference: "minio://region/input/sample_loading_dock_alert.mp4",
        output_reference: "minio://region/output/sample_loading_dock_alert.mp4",
        is_latest_demo_incident: true,
      }),
    ];

    return [...baseline, ...latestDemoIncidents];
  })(),
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
  "speed-estimation": createRows(52, (index) => {
    const zoneProfiles = [
      { zone: "Forklift Bay", speedLimit: 5, location: "Warehouse A", objectTypes: ["forklift", "person"], bias: "high" },
      { zone: "Dispatch Area", speedLimit: 10, location: "Warehouse B", objectTypes: ["truck", "car", "bus"], bias: "medium-high" },
      { zone: "Loading Dock", speedLimit: 8, location: "Warehouse C", objectTypes: ["truck", "forklift", "car"], bias: "medium" },
      { zone: "Storage Bay", speedLimit: 6, location: "Warehouse A", objectTypes: ["forklift", "bicycle", "person"], bias: "medium" },
      { zone: "Receiving Bay", speedLimit: 12, location: "Warehouse B", objectTypes: ["truck", "car", "bicycle"], bias: "low" },
      { zone: "Packaging Zone", speedLimit: 7, location: "Warehouse C", objectTypes: ["forklift", "person", "bicycle"], bias: "low-medium" },
    ];
    const profile = zoneProfiles[index % zoneProfiles.length];
    const objectType = profile.objectTypes[index % profile.objectTypes.length];
    const simulated = new Date("2025-04-01T06:00:00");
    simulated.setDate(1 + (index % 26));
    simulated.setHours([6, 8, 10, 12, 14, 16, 18, 20, 22, 5][index % 10], (index * 9) % 60, 0, 0);

    const speedDelta =
      profile.bias === "high"
        ? [4, 6, 8, 3, 7][index % 5]
        : profile.bias === "medium-high"
          ? [2, 5, 7, 3, 6][index % 5]
          : profile.bias === "medium"
            ? [1, 3, 4, 0, 5][index % 5]
            : profile.bias === "low-medium"
              ? [0, 2, 3, 1, 0][index % 5]
              : [-1, 1, 0, 2, -2][index % 5];
    const detectedSpeed = Math.max(profile.speedLimit + speedDelta, objectType === "person" ? 3 : 4);
    const excessSpeed = Math.max(detectedSpeed - profile.speedLimit, 0);
    const isOverspeeding = excessSpeed > 0 ? "Yes" : "No";

    return {
      input_id: 7000 + index,
      camera_id: cameras[(index * 2) % cameras.length],
      location: profile.location,
      zone: profile.zone,
      zone_speed_limit_kmh: profile.speedLimit,
      minio_video_link: `minio://vision-demo/speed/input/speed_run_${String(index + 1).padStart(3, "0")}.mp4`,
      load_time_sec: Number((4.2 + ((index % 6) * 0.7)).toFixed(1)),
      simulated_timestamp: simulated.toISOString(),
      output_id: 9000 + index,
      object_id: `TRK-${3000 + index}`,
      object_type: objectType,
      detected_speed_kmh: detectedSpeed,
      speed_limit_kmh: profile.speedLimit,
      is_overspeeding: isOverspeeding,
      excess_speed_kmh: excessSpeed,
      confidence_score: Number((0.8 + ((index % 7) * 0.02)).toFixed(2)),
      status: isOverspeeding === "Yes" ? "Violation" : "Normal",
    };
  }),
  "fire-detection": (() => {
    const alertPatterns = [
      { alert_type: "smoke_only", zone: "Forklift Bay", facility: "Plant 2", location: "Warehouse B" },
      { alert_type: "smoke_only", zone: "Forklift Bay", facility: "Plant 2", location: "Warehouse B" },
      { alert_type: "fire_and_smoke", zone: "Forklift Bay", facility: "Plant 2", location: "Warehouse B" },
      { alert_type: "fire_only", zone: "Loading Dock", facility: "Plant 1", location: "Warehouse A" },
      { alert_type: "smoke_only", zone: "Forklift Bay", facility: "Plant 2", location: "Warehouse B" },
      { alert_type: "fire_and_smoke", zone: "Loading Dock", facility: "Plant 1", location: "Warehouse A" },
      { alert_type: "smoke_only", zone: "Storage Bay", facility: "Plant 2", location: "Warehouse B" },
      { alert_type: "no_alert", zone: "Packaging Zone", facility: "Warehouse Annex", location: "Warehouse C" },
      { alert_type: "smoke_only", zone: "Receiving Bay", facility: "Plant 1", location: "Warehouse A" },
      { alert_type: "fire_and_smoke", zone: "Dispatch Area", facility: "Warehouse Annex", location: "Warehouse C" },
      { alert_type: "fire_only", zone: "Storage Bay", facility: "Plant 2", location: "Warehouse B" },
      { alert_type: "smoke_only", zone: "Forklift Bay", facility: "Plant 2", location: "Warehouse B" },
    ];
    const cameraPool = ["CAM_003", "CAM_006", "CAM_009", "CAM_012", "CAM_015"];

    const buildSummary = (index, overrides = {}) => {
      const pattern = alertPatterns[index % alertPatterns.length];
      const ts = new Date(overrides.simulated_timestamp ?? "2025-04-22T06:00:00");
      if (!overrides.simulated_timestamp) {
        ts.setDate(22 + (index % 7));
        ts.setHours([6, 8, 11, 14, 16, 19, 22, 1, 4, 13][index % 10], (index * 13) % 60, 0, 0);
      }
      const alertType = overrides.alert_type ?? pattern.alert_type;
      const hasFire = alertType === "fire_and_smoke" || alertType === "fire_only";
      const hasSmoke = alertType === "smoke_only" || alertType === "fire_and_smoke";
      const severity =
        overrides.severity ??
        (alertType === "fire_and_smoke" || alertType === "fire_only"
          ? "high"
          : alertType === "smoke_only"
            ? "medium"
            : "none");

      return {
        input_id: overrides.input_id ?? `FIRE-VID-${String(index + 1).padStart(4, "0")}`,
        camera_id: overrides.camera_id ?? cameraPool[index % cameraPool.length],
        location: overrides.location ?? pattern.location,
        facility: overrides.facility ?? pattern.facility,
        zone: overrides.zone ?? pattern.zone,
        shift: overrides.shift ?? shiftForHour(ts.getHours()),
        alert_type: alertType,
        severity,
        confidence_score: overrides.confidence_score ?? (alertType === "no_alert" ? 0.19 : Number((0.73 + ((index % 9) * 0.024)).toFixed(2))),
        fire_detected: overrides.fire_detected ?? (hasFire ? "Yes" : "No"),
        smoke_detected: overrides.smoke_detected ?? (hasSmoke ? "Yes" : "No"),
        total_fire_events: overrides.total_fire_events ?? (hasFire ? 1 + (index % 3) : 0),
        total_smoke_events: overrides.total_smoke_events ?? (hasSmoke ? 2 + (index % 4) : 0),
        output_video_url: overrides.output_video_url ?? (alertType === "no_alert" ? "" : `minio://warehouse/fire/output_${String(index + 1).padStart(3, "0")}.mp4`),
        simulated_timestamp: ts.toISOString(),
        is_latest_demo_alert: overrides.is_latest_demo_alert ?? false,
      };
    };

    const baseline = createRows(48, (index) => buildSummary(index));
    const latestDemoAlerts = [
      buildSummary(48, {
        input_id: "FIRE-VID-0049",
        camera_id: "CAM_012",
        location: "Warehouse B",
        facility: "Plant 2",
        zone: "Forklift Bay",
        shift: "Swing Shift",
        alert_type: "smoke_only",
        severity: "medium",
        confidence_score: 0.93,
        total_fire_events: 0,
        total_smoke_events: 4,
        output_video_url: "minio://warehouse/fire/sample_forklift_smoke_alert.mp4",
        simulated_timestamp: "2025-04-29T18:18:00.000Z",
        is_latest_demo_alert: true,
      }),
      buildSummary(49, {
        input_id: "FIRE-VID-0050",
        camera_id: "CAM_006",
        location: "Warehouse A",
        facility: "Plant 1",
        zone: "Loading Dock",
        shift: "Night Shift",
        alert_type: "fire_and_smoke",
        severity: "high",
        confidence_score: 0.97,
        total_fire_events: 3,
        total_smoke_events: 5,
        output_video_url: "minio://warehouse/fire/sample_loading_dock_fire_alert.mp4",
        simulated_timestamp: "2025-04-29T23:26:00.000Z",
        is_latest_demo_alert: true,
      }),
    ];

    return [...baseline, ...latestDemoAlerts];
  })(),
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
  "ppe-detection": createRows(216, (index) => {
    const morningHours = [6, 7, 8, 9, 10, 11, 12, 13];
    const afternoonHours = [14, 15, 16, 17, 18, 19, 20, 21];
    const nightHours = [22, 23, 0, 1, 2, 3, 4, 5];
    const zoneProfiles = [
      { zone: "Forklift Bay", location: "Warehouse A", camera: cameras[0], shift: "Afternoon", vestBias: "high", helmetBias: "low" },
      { zone: "Loading Dock", location: "Warehouse B", camera: cameras[4], shift: "Morning", vestBias: "medium", helmetBias: "high" },
      { zone: "Dispatch Area", location: "Warehouse C", camera: cameras[8], shift: "Morning", vestBias: "low", helmetBias: "low" },
      { zone: "Storage Bay", location: "Warehouse A", camera: cameras[2], shift: "Night", vestBias: "medium", helmetBias: "medium" },
      { zone: "Receiving Bay", location: "Warehouse B", camera: cameras[6], shift: "Morning", vestBias: "low", helmetBias: "low" },
      { zone: "Packaging Zone", location: "Warehouse C", camera: cameras[10], shift: "Afternoon", vestBias: "medium", helmetBias: "medium" },
    ];
    const profile = zoneProfiles[index % zoneProfiles.length];
    const shiftCycle = [profile.shift, profile.shift, profile.shift === "Morning" ? "Afternoon" : "Night"];
    const shift = shiftCycle[index % shiftCycle.length];
    const processedAt = new Date("2025-05-01T00:00:00");
    processedAt.setDate(1 + (index % 28));
    const hours = shift === "Morning" ? morningHours : shift === "Afternoon" ? afternoonHours : nightHours;
    processedAt.setHours(hours[index % hours.length], (index * 11) % 60, 0, 0);

    let helmet = "OK";
    let vest = "OK";
    const combinedViolation = profile.zone === "Forklift Bay" && shift !== "Morning" && index % 11 === 0;
    const helmetOnlyViolation = (profile.zone === "Loading Dock" && index % 5 === 0) || (profile.helmetBias === "medium" && index % 19 === 0);
    const vestOnlyViolation = (profile.vestBias === "high" && index % 4 === 0) || (profile.zone === "Packaging Zone" && index % 7 === 0);

    if (combinedViolation || vestOnlyViolation) {
      vest = "MISSING";
    }
    if (combinedViolation || helmetOnlyViolation) {
      helmet = "MISSING";
    }
    if (profile.zone === "Dispatch Area" && index % 9 !== 0) {
      helmet = "OK";
      vest = "OK";
    }
    if (index % 17 === 0 && helmet !== "MISSING") {
      helmet = "UNKNOWN";
    }
    if (index % 23 === 0 && vest !== "MISSING") {
      vest = "UNKNOWN";
    }

    const missingItems = [];
    if (helmet === "MISSING") missingItems.push("Helmet");
    if (vest === "MISSING") missingItems.push("Vest");
    const complianceStatus = missingItems.length > 0 ? "FAIL" : "PASS";
    const firstSeenSec = 6 + (index % 9) * 6;
    const durationSec = complianceStatus === "FAIL" ? 66 + (index % 6) * 22 : 28 + (index % 5) * 11;
    const lastSeenSec = firstSeenSec + durationSec;

    return {
      input_id: 9100 + index,
      camera_id: profile.camera,
      location: profile.location,
      zone: profile.zone,
      shift,
      tracked_worker_id: `WRK-${String(700 + index).padStart(4, "0")}`,
      helmet,
      vest,
      compliance_status: complianceStatus,
      missing_items: missingItems,
      frames_observed: durationSec * 6,
      first_seen_sec: firstSeenSec,
      last_seen_sec: lastSeenSec,
      duration_sec: durationSec,
      processed_at: processedAt.toISOString(),
      confidence_score: Number((0.86 + ((index % 9) * 0.012)).toFixed(2)),
      output_video_url: `${API_BASE_URL}/static/PPE_VIDEO1.mp4`,
    };
  }),
};

export const dashboardInfo = {
  "crack-detection": "Monitor surface and structural defects across construction, infrastructure, manufacturing, and facility inspection areas.",
  "unsafe-behavior-detection": "Monitor smoking and mobile phone usage incidents across workplace cameras and locations.",
  "object-counting": "Monitors production-oriented object counts against expected throughput to surface over-count and under-count deviations by zone and camera.",
  "region-alerts": "Shows where restricted-zone violations are happening, when they peak, how serious they are, and which incidents supervisors or security should action first.",
  "queue-management": "Measures queue build-up, staffing impact, breach thresholds, and wait time trends across operational counters and service zones.",
  "speed-estimation": "Shows where unsafe movement is happening across industrial zones, which object types exceed configured speed limits most often, and which detections require the quickest operational follow-up.",
  "fire-detection": "A focused fire and smoke safety view showing what kind of alert is appearing, which zones are most affected, and where safety teams should focus first.",
  "class-wise-counting": "Breaks counts down by tracked class to compare actual versus expected activity and reveal which cameras and zones see the highest class mix.",
  "object-tracking": "Tracks object movements, time spent in zones, path sequences, and anomaly rates to reveal congestion and movement inefficiencies.",
  "ppe-detection": "Monitor whether workers are wearing required helmets and safety vests across workplace zones, shifts, and camera sources.",
};

export const globalKeys = {
  location: "location",
  zone: "zone",
  cameraId: "cameraId",
  timestamp: "timestamp",
};
