"""
Use case registry — maps use case IDs to processor functions and metadata.
"""

from __future__ import annotations

import importlib
from typing import Any, Callable


# Each entry: (module_path, function_name, display_name, category, description, default_model)
_REGISTRY: dict[str, dict[str, Any]] = {
    "object-counting": {
        "module": "use_cases.object_counting",
        "function": "process_video",
        "title": "Object Counting",
        "category": "Operations Intelligence",
        "description": "Count objects crossing a checkpoint to monitor throughput, production volume, and movement across a line of interest.",
        "default_model": "yolov8n.pt",
        "metrics_keys": ["total_objects", "current_rate_per_min", "peak_volume_window", "target_progress_pct"],
    },
    "region-alerts": {
        "module": "use_cases.zone_intrusion",
        "function": "process_video",
        "title": "Region Alerts",
        "category": "Security & Surveillance",
        "description": "Detect unauthorized entry into monitored zones and trigger alerts for restricted or hazardous areas.",
        "default_model": "yolov8n.pt",
        "metrics_keys": ["total_intrusions", "unique_intruders", "peak_zone_occupancy", "frames_analyzed"],
    },
    "queue-management": {
        "module": "use_cases.queue_management",
        "function": "process_video",
        "title": "Queue Management",
        "category": "Customer Experience",
        "description": "Monitor queue build-up, wait times, and abandonment risk at service counters, gates, and checkout points.",
        "default_model": "yolov8n.pt",
        "metrics_keys": ["current_queue_length", "average_wait_time_min", "max_queue_length", "service_abandonment"],
    },
    "class-wise-object-counting": {
        "module": "use_cases.vehicle_counting",
        "function": "process_video",
        "title": "Class-Wise Object Counting",
        "category": "Traffic Intelligence",
        "description": "Count and separate object classes such as cars, trucks, buses, and bikes for traffic composition analysis.",
        "default_model": "yolov8n.pt",
        "metrics_keys": ["total_vehicles", "cars", "trucks", "buses", "motorcycles", "frames_analyzed"],
    },
    "ppe-detection": {
        "module": "use_cases.ppe_detection",
        "function": "process_video",
        "title": "PPE Detection",
        "category": "Safety & Compliance",
        "description": "Detect hardhats, safety vests, and shoes on workers from CCTV footage.",
        "default_model": "yolov8n.pt",
        "metrics_keys": ["total_workers", "total_violations", "frames_analyzed", "avg_compliance_rate"],
    },
    "fire-detection": {
        "module": "use_cases.fire_smoke",
        "function": "process_video",
        "title": "Fire Detection",
        "category": "Safety & Compliance",
        "description": "Early detection of fire and smoke from surveillance feeds to reduce emergency response time.",
        "default_model": "yolov8n.pt",
        "metrics_keys": ["total_fire_events", "total_smoke_events", "frames_analyzed", "max_severity", "fire_frame_percentage"],
    },
    "speed-estimation": {
        "module": "use_cases.speed_estimation",
        "function": "process_video",
        "title": "Speed Estimation",
        "category": "Traffic Intelligence",
        "description": "Estimate vehicle speeds at intersections and roads for traffic enforcement and monitoring.",
        "default_model": "yolov8n.pt",
        "metrics_keys": ["total_vehicles", "avg_speed_kmh", "max_speed_kmh", "speeding_violations"],
    },
    "crack-detection": {
        "module": "use_cases.crack_detection",
        "function": "process_video",
        "title": "Crack Detection",
        "category": "Safety & Compliance",
        "description": "Detect cracks on concrete, roads, bridges, pavements, and construction surfaces.",
        "default_model": "models/crack_detection/best.pt",
        "metrics_keys": ["crack_detections", "frames_analyzed", "frames_with_cracks", "crack_rate_pct", "max_confidence", "avg_confidence"],
    },
    "unsafe-behavior-detection": {
        "module": "use_cases.unsafe_behavior_detection",
        "function": "process_video",
        "title": "Unsafe Behavior Detection",
        "category": "Safety & Compliance",
        "description": "Detect smoking with a fine-tuned model and infer phone usage from person and cell phone detections.",
        "default_model": "models/unsafe_behavior/smoking_best.pt",
        "metrics_keys": [
            "total_unsafe_events",
            "smoking_events",
            "phone_usage_events",
            "frames_analyzed",
            "frames_with_unsafe_behavior",
            "unsafe_rate_pct",
            "max_confidence",
            "avg_confidence",
        ],
    },
    "object-tracking": {
        "module": "use_cases.object_tracking",
        "function": "process_video",
        "title": "Object Tracking",
        "category": "Security & Surveillance",
        "description": "Track and monitor objects or individuals across video frames for security and loss prevention.",
        "default_model": "yolov8n.pt",
        "metrics_keys": ["total_tracked", "unique_objects", "frames_analyzed", "avg_track_duration"],
    },
}


def get_registry() -> dict[str, dict[str, Any]]:
    """Return the full use case registry."""
    return _REGISTRY.copy()


USE_CASE_REGISTRY = _REGISTRY


def get_processor(use_case_id: str) -> Callable | None:
    """Dynamically import and return the processor function for a use case."""
    entry = _REGISTRY.get(use_case_id)
    if not entry:
        return None

    try:
        module = importlib.import_module(entry["module"])
        return getattr(module, entry["function"])
    except (ImportError, AttributeError) as e:
        print(f"[registry] Failed to load processor for '{use_case_id}': {e}")
        return None


def get_metadata(use_case_id: str) -> dict[str, Any] | None:
    """Return metadata (title, category, description, etc.) for a use case."""
    return _REGISTRY.get(use_case_id)


def list_use_cases() -> list[dict[str, Any]]:
    """Return all use cases as a list with their IDs."""
    return [{"id": uid, **meta} for uid, meta in _REGISTRY.items()]
