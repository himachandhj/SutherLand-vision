import json
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.core.config import settings
from app.models.training_job import create_training_job
from app.schemas.training_schema import DatasetReadyPayload, TrainingPlanRequest


READY_FOR_TRAINING = "ready_for_training"
READY_WITH_WARNINGS = "ready_with_warnings"
BLOCKED = "blocked"
TRAINABLE_DATASET_STATUSES = {READY_FOR_TRAINING, READY_WITH_WARNINGS}
MOCK_DATASET_READY_STATUSES = {READY_FOR_TRAINING, READY_WITH_WARNINGS, BLOCKED}
SUPPORTED_USE_CASE_IDS = {
    "fire-detection",
    "ppe-detection",
    "region-alerts",
    "crack-detection",
    "unsafe-behavior-detection",
    "speed-estimation",
    "object-tracking",
    "class-wise-object-counting",
}
SUPPORTED_TASK_TYPE = "object_detection"
DEFAULT_GOAL = "catch_more_real_issues"
DEFAULT_RUN_DEPTH = "recommended"
DEFAULT_STOP_RULE = "stop_when_it_stops_improving"

BASE_DIR = Path(__file__).resolve().parents[2]
ROOT_DEFAULT_MODEL_PATH = BASE_DIR / "best.pt"
LOCAL_FIRE_MODEL_PATH = BASE_DIR / "models" / "fire_smoke" / "best.pt"
LOCAL_PPE_MODEL_PATH = BASE_DIR / "models" / "ppe" / "best.pt"
LOCAL_CRACK_MODEL_PATH = BASE_DIR / "models" / "crack_detection" / "best.pt"
LOCAL_UNSAFE_BEHAVIOR_MODEL_PATH = BASE_DIR / "models" / "unsafe_behavior" / "smoking_best.pt"
LOCAL_REGION_ALERTS_MODEL_PATH = ROOT_DEFAULT_MODEL_PATH
RUNS_DIR = BASE_DIR / "runs" / "detect"
YOLO_NANO_MODEL_PATH = BASE_DIR / "yolov8n.pt"
YOLO_MEDIUM_MODEL_PATH = BASE_DIR / "yolov8m.pt"

GLOBAL_BASE_MODEL_ALIASES = {
    "current_model": "current_custom",
    "current_custom": "current_custom",
    "yolo_pretrained": "yolo_nano",
    "yolo_nano": "yolo_nano",
    "yolo_medium": "yolo_medium",
}

USE_CASE_BASE_MODEL_ALIASES = {
    "fire-detection": {
        "fire-fast": "yolo_nano",
        "fire-balanced": "current_custom",
        "fire-watch": "yolo_medium",
    },
    "crack-detection": {
        "crack-current": "current_custom",
        "crack-fast": "yolo_nano",
        "crack-accurate": "yolo_medium",
    },
    "unsafe-behavior-detection": {
        "unsafe-current": "current_custom",
        "unsafe-fast": "yolo_nano",
        "unsafe-accurate": "yolo_medium",
    },
    "ppe-detection": {
        "ppe-fast": "yolo_nano",
        "ppe-balanced": "current_custom",
        "ppe-accurate": "yolo_medium",
    },
    "region-alerts": {
        "region-fast": "yolo_nano",
        "region-balanced": "current_custom",
        "region-guard": "yolo_medium",
    },
    "speed-estimation": {
        "speed-fast": "yolo_nano",
        "speed-balanced": "current_custom",
        "speed-accurate": "yolo_medium",
        "speed-precision": "yolo_medium",
    },
    "object-tracking": {
        "tracking-fast": "yolo_nano",
        "track-fast": "yolo_nano",
        "object-tracking-fast": "yolo_nano",
        "tracking-balanced": "current_custom",
        "track-balanced": "current_custom",
        "object-tracking-balanced": "current_custom",
        "tracking-identity-focus": "yolo_medium",
        "track-identity": "yolo_medium",
        "object-tracking-identity-focus": "yolo_medium",
    },
    "class-wise-object-counting": {
        "counting-fast": "yolo_nano",
        "count-fast": "yolo_nano",
        "class-wise-counting-fast": "yolo_nano",
        "class-wise-object-counting-fast": "yolo_nano",
        "counting-balanced": "current_custom",
        "count-balanced": "current_custom",
        "class-wise-counting-balanced": "current_custom",
        "class-wise-object-counting-balanced": "current_custom",
        "counting-accurate": "yolo_medium",
        "count-accurate": "yolo_medium",
        "class-wise-counting-accurate": "yolo_medium",
        "class-wise-object-counting-accurate": "yolo_medium",
    },
}

USE_CASE_TRAINING_CONFIG = {
    "fire-detection": {
        "custom_model_path": LOCAL_FIRE_MODEL_PATH,
        "custom_model_source": "models/fire_smoke/best.pt",
        "mock_dataset_version": "mock_fire_v1",
        "mock_dataset_uri": "minio://vision-demo/fire/input",
        "mock_dataset_name": "Mock Fire Detection Dataset",
        "allow_runs_fallback": False,
    },
    "crack-detection": {
        "custom_model_path": LOCAL_CRACK_MODEL_PATH,
        "custom_model_source": "models/crack_detection/best.pt",
        "mock_dataset_version": "mock_crack_detection_v1",
        "mock_dataset_uri": "minio://vision-demo/crack/input",
        "mock_dataset_name": "Mock Crack Detection Dataset",
        "allow_runs_fallback": False,
    },
    "unsafe-behavior-detection": {
        "custom_model_path": LOCAL_UNSAFE_BEHAVIOR_MODEL_PATH,
        "custom_model_source": "models/unsafe_behavior/smoking_best.pt",
        "mock_dataset_version": "mock_unsafe_behavior_v1",
        "mock_dataset_uri": "minio://vision-demo/unsafe_behavior/input",
        "mock_dataset_name": "Mock Unsafe Behavior Dataset",
        "allow_runs_fallback": False,
    },
    "ppe-detection": {
        "custom_model_path": LOCAL_PPE_MODEL_PATH,
        "custom_model_source": "models/ppe/best.pt",
        "mock_dataset_version": "mock_ppe_v1",
        "mock_dataset_uri": "minio://vision-demo/ppe/input",
        "mock_dataset_name": "Mock PPE Detection Dataset",
        "allow_runs_fallback": False,
    },
    "region-alerts": {
        "custom_model_path": LOCAL_REGION_ALERTS_MODEL_PATH,
        "custom_model_source": "best.pt",
        "mock_dataset_version": "mock_region_alerts_v1",
        "mock_dataset_uri": "minio://vision-demo/region-alerts/input",
        "mock_dataset_name": "Mock Region Alerts Dataset",
        "allow_runs_fallback": False,
    },
    "speed-estimation": {
        "custom_model_path": BASE_DIR / "models" / "speed_estimation" / "best.pt",
        "custom_model_source": "models/speed_estimation/best.pt",
        "mock_dataset_version": "mock_speed_estimation_v1",
        "mock_dataset_uri": "minio://vision-demo/speed-estimation/input",
        "mock_dataset_name": "Mock Speed Estimation Dataset",
        "allow_runs_fallback": False,
    },
    "object-tracking": {
        "custom_model_path": BASE_DIR / "models" / "object_tracking" / "best.pt",
        "custom_model_source": "models/object_tracking/best.pt",
        "mock_dataset_version": "mock_object_tracking_v1",
        "mock_dataset_uri": "minio://vision-demo/object-tracking/input",
        "mock_dataset_name": "Mock Object Tracking Dataset",
        "allow_runs_fallback": False,
    },
    "class-wise-object-counting": {
        "custom_model_path": BASE_DIR / "models" / "class_wise_object_counting" / "best.pt",
        "custom_model_source": "models/class_wise_object_counting/best.pt",
        "mock_dataset_version": "mock_class_wise_object_counting_v1",
        "mock_dataset_uri": "minio://vision-demo/class-wise-object-counting/input",
        "mock_dataset_name": "Mock Class-wise Object Counting Dataset",
        "allow_runs_fallback": False,
    },
}

GOAL_ALIASES = {
    "best-accuracy": "catch_more_real_issues",
    "catch_more_real_issues": "catch_more_real_issues",
    "fewer-false-alarms": "reduce_noisy_alerts",
    "reduce_noisy_alerts": "reduce_noisy_alerts",
    "balanced-tradeoff": "keep_it_balanced",
    "keep_it_balanced": "keep_it_balanced",
    "faster-inference": "make_it_faster",
    "make_it_faster": "make_it_faster",
    "smaller-model": "keep_it_smaller",
    "keep_it_smaller": "keep_it_smaller",
}

RUN_DEPTH_ALIASES = {
    "quick-tune": "quick_check",
    "quick_check": "quick_check",
    "balanced": "recommended",
    "recommended": "recommended",
    "deep-optimization": "deep_tune",
    "deep_tune": "deep_tune",
}

STOP_RULE_ALIASES = {
    "auto-stop": "stop_when_it_stops_improving",
    "stop_when_it_stops_improving": "stop_when_it_stops_improving",
    "time-budget": "stop_after_set_time",
    "stop_after_set_time": "stop_after_set_time",
    "epochs": "stop_after_set_rounds",
    "stop_after_set_rounds": "stop_after_set_rounds",
}

RUN_DEPTH_RECIPES_BY_USE_CASE = {
    "fire-detection": {
        "quick_check": {
            "label": "Quick check",
            "summary": "Smallest safe phase-1 recipe with the narrowest tuning breadth and the lowest budget.",
            "dimension_budget": 1,
            "dimensions_unlocked": ["epochs"],
            "defaults": {
                "epochs": 6,
                "batch_size": 4,
                "img_size": 640,
                "optimizer": "sgd",
                "lr_schedule": "one_cycle",
                "augmentation_profile": "safe_lite",
                "freeze_depth": 10,
                "early_stopping_patience": 4,
                "checkpoint_policy": "last_only",
                "checkpoint_frequency": 0,
                "preprocessing_policy": "basic",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "deferred",
                "class_rebalance": "disabled",
                "export_formats": "onnx",
            },
        },
        "recommended": {
            "label": "Recommended",
            "summary": "Moderate phase-1 recipe with broader tuning across a few meaningful training choices.",
            "dimension_budget": 3,
            "dimensions_unlocked": ["epochs", "image_size", "augmentation_profile"],
            "defaults": {
                "epochs": 14,
                "batch_size": 4,
                "img_size": 768,
                "optimizer": "auto",
                "lr_schedule": "cosine",
                "augmentation_profile": "balanced",
                "freeze_depth": 4,
                "early_stopping_patience": 8,
                "checkpoint_policy": "periodic",
                "checkpoint_frequency": 5,
                "preprocessing_policy": "standardized",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "enabled",
                "class_rebalance": "enabled",
                "export_formats": "onnx, torchscript",
            },
        },
        "deep_tune": {
            "label": "Deep tune",
            "summary": "Broadest safe phase-1 recipe with a larger budget and more unlocked training choices.",
            "dimension_budget": 6,
            "dimensions_unlocked": [
                "epochs",
                "image_size",
                "augmentation_profile",
                "optimizer",
                "lr_schedule",
                "freeze_depth",
            ],
            "defaults": {
                "epochs": 24,
                "batch_size": 4,
                "img_size": 896,
                "optimizer": "adamw",
                "lr_schedule": "cosine",
                "augmentation_profile": "strong",
                "freeze_depth": 0,
                "early_stopping_patience": 12,
                "checkpoint_policy": "periodic_dense",
                "checkpoint_frequency": 3,
                "preprocessing_policy": "extended",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "enabled",
                "class_rebalance": "enabled",
                "export_formats": "onnx, torchscript",
            },
        },
    },
    "crack-detection": {
        "quick_check": {
            "label": "Quick check",
            "summary": "Smallest safe crack-detection recipe for a fast validation run with light augmentation and a narrow tuning budget.",
            "dimension_budget": 1,
            "dimensions_unlocked": ["epochs"],
            "defaults": {
                "epochs": 6,
                "batch_size": 2,
                "img_size": 640,
                "optimizer": "sgd",
                "lr_schedule": "one_cycle",
                "augmentation_profile": "light",
                "freeze_depth": 12,
                "early_stopping_patience": 4,
                "checkpoint_policy": "last_only",
                "checkpoint_frequency": 0,
                "preprocessing_policy": "basic",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "deferred",
                "class_rebalance": "disabled",
                "export_formats": "onnx",
            },
        },
        "recommended": {
            "label": "Recommended",
            "summary": "Moderate crack-detection recipe with balanced augmentation and a broader training budget for most inspection surfaces.",
            "dimension_budget": 3,
            "dimensions_unlocked": ["epochs", "image_size", "augmentation_profile"],
            "defaults": {
                "epochs": 14,
                "batch_size": 4,
                "img_size": 768,
                "optimizer": "auto",
                "lr_schedule": "cosine",
                "augmentation_profile": "balanced",
                "freeze_depth": 6,
                "early_stopping_patience": 8,
                "checkpoint_policy": "periodic",
                "checkpoint_frequency": 5,
                "preprocessing_policy": "standardized",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "enabled",
                "class_rebalance": "enabled",
                "export_formats": "onnx, torchscript",
            },
        },
        "deep_tune": {
            "label": "Deep tune",
            "summary": "Broadest safe crack-detection recipe with stronger augmentation, larger image size, and more unlocked training choices.",
            "dimension_budget": 6,
            "dimensions_unlocked": [
                "epochs",
                "image_size",
                "augmentation_profile",
                "optimizer",
                "lr_schedule",
                "freeze_depth",
            ],
            "defaults": {
                "epochs": 24,
                "batch_size": 4,
                "img_size": 896,
                "optimizer": "adamw",
                "lr_schedule": "cosine",
                "augmentation_profile": "stronger",
                "freeze_depth": 0,
                "early_stopping_patience": 12,
                "checkpoint_policy": "periodic_dense",
                "checkpoint_frequency": 3,
                "preprocessing_policy": "extended",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "enabled",
                "class_rebalance": "enabled",
                "export_formats": "onnx, torchscript",
            },
        },
    },
    "unsafe-behavior-detection": {
        "quick_check": {
            "label": "Quick check",
            "summary": "Smallest safe unsafe-behavior recipe for a quick smoking and phone-usage validation run with light augmentation and a narrow tuning budget.",
            "dimension_budget": 1,
            "dimensions_unlocked": ["epochs"],
            "defaults": {
                "epochs": 6,
                "batch_size": 2,
                "img_size": 640,
                "optimizer": "sgd",
                "lr_schedule": "one_cycle",
                "augmentation_profile": "light",
                "freeze_depth": 12,
                "early_stopping_patience": 4,
                "checkpoint_policy": "last_only",
                "checkpoint_frequency": 0,
                "preprocessing_policy": "basic",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "deferred",
                "class_rebalance": "disabled",
                "export_formats": "onnx",
            },
        },
        "recommended": {
            "label": "Recommended",
            "summary": "Moderate unsafe-behavior recipe with balanced augmentation and a broader training budget for most workplace scenes.",
            "dimension_budget": 3,
            "dimensions_unlocked": ["epochs", "image_size", "augmentation_profile"],
            "defaults": {
                "epochs": 14,
                "batch_size": 4,
                "img_size": 768,
                "optimizer": "auto",
                "lr_schedule": "cosine",
                "augmentation_profile": "balanced",
                "freeze_depth": 6,
                "early_stopping_patience": 8,
                "checkpoint_policy": "periodic",
                "checkpoint_frequency": 5,
                "preprocessing_policy": "standardized",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "enabled",
                "class_rebalance": "enabled",
                "export_formats": "onnx, torchscript",
            },
        },
        "deep_tune": {
            "label": "Deep tune",
            "summary": "Broadest safe unsafe-behavior recipe with stronger augmentation, larger image size, and more unlocked training choices for harder workplace scenes.",
            "dimension_budget": 6,
            "dimensions_unlocked": [
                "epochs",
                "image_size",
                "augmentation_profile",
                "optimizer",
                "lr_schedule",
                "freeze_depth",
            ],
            "defaults": {
                "epochs": 24,
                "batch_size": 4,
                "img_size": 896,
                "optimizer": "adamw",
                "lr_schedule": "cosine",
                "augmentation_profile": "stronger",
                "freeze_depth": 0,
                "early_stopping_patience": 12,
                "checkpoint_policy": "periodic_dense",
                "checkpoint_frequency": 3,
                "preprocessing_policy": "extended",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "enabled",
                "class_rebalance": "enabled",
                "export_formats": "onnx, torchscript",
            },
        },
    },
    "ppe-detection": {
        "quick_check": {
            "label": "Quick check",
            "summary": "Smallest safe PPE recipe for a quick validation run with light augmentation and a narrow tuning budget.",
            "dimension_budget": 1,
            "dimensions_unlocked": ["epochs"],
            "defaults": {
                "epochs": 6,
                "batch_size": 2,
                "img_size": 640,
                "optimizer": "sgd",
                "lr_schedule": "one_cycle",
                "augmentation_profile": "light",
                "freeze_depth": 12,
                "early_stopping_patience": 4,
                "checkpoint_policy": "last_only",
                "checkpoint_frequency": 0,
                "preprocessing_policy": "basic",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "deferred",
                "class_rebalance": "disabled",
                "export_formats": "onnx",
            },
        },
        "recommended": {
            "label": "Recommended",
            "summary": "Moderate PPE recipe with balanced augmentation and a broader training budget for most sites.",
            "dimension_budget": 3,
            "dimensions_unlocked": ["epochs", "image_size", "augmentation_profile"],
            "defaults": {
                "epochs": 14,
                "batch_size": 4,
                "img_size": 768,
                "optimizer": "auto",
                "lr_schedule": "cosine",
                "augmentation_profile": "balanced",
                "freeze_depth": 6,
                "early_stopping_patience": 8,
                "checkpoint_policy": "periodic",
                "checkpoint_frequency": 5,
                "preprocessing_policy": "standardized",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "enabled",
                "class_rebalance": "enabled",
                "export_formats": "onnx, torchscript",
            },
        },
        "deep_tune": {
            "label": "Deep tune",
            "summary": "Broadest safe PPE recipe with stronger augmentation, larger image size, and more unlocked training choices.",
            "dimension_budget": 6,
            "dimensions_unlocked": [
                "epochs",
                "image_size",
                "augmentation_profile",
                "optimizer",
                "lr_schedule",
                "freeze_depth",
            ],
            "defaults": {
                "epochs": 24,
                "batch_size": 8,
                "img_size": 896,
                "optimizer": "adamw",
                "lr_schedule": "cosine",
                "augmentation_profile": "stronger",
                "freeze_depth": 0,
                "early_stopping_patience": 12,
                "checkpoint_policy": "periodic_dense",
                "checkpoint_frequency": 3,
                "preprocessing_policy": "extended",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "enabled",
                "class_rebalance": "enabled",
                "export_formats": "onnx, torchscript",
            },
        },
    },
    "region-alerts": {
        "quick_check": {
            "label": "Quick check",
            "summary": "Smallest safe region recipe for a fast validation run with light augmentation and a narrow tuning budget.",
            "dimension_budget": 1,
            "dimensions_unlocked": ["epochs"],
            "defaults": {
                "epochs": 6,
                "batch_size": 2,
                "img_size": 640,
                "optimizer": "sgd",
                "lr_schedule": "one_cycle",
                "augmentation_profile": "light",
                "freeze_depth": 12,
                "early_stopping_patience": 4,
                "checkpoint_policy": "last_only",
                "checkpoint_frequency": 0,
                "preprocessing_policy": "basic",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "deferred",
                "class_rebalance": "disabled",
                "export_formats": "onnx",
            },
        },
        "recommended": {
            "label": "Recommended",
            "summary": "Moderate region recipe with balanced augmentation and a broader training budget for most camera views.",
            "dimension_budget": 3,
            "dimensions_unlocked": ["epochs", "image_size", "augmentation_profile"],
            "defaults": {
                "epochs": 14,
                "batch_size": 4,
                "img_size": 768,
                "optimizer": "auto",
                "lr_schedule": "cosine",
                "augmentation_profile": "balanced",
                "freeze_depth": 6,
                "early_stopping_patience": 8,
                "checkpoint_policy": "periodic",
                "checkpoint_frequency": 5,
                "preprocessing_policy": "standardized",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "enabled",
                "class_rebalance": "enabled",
                "export_formats": "onnx, torchscript",
            },
        },
        "deep_tune": {
            "label": "Deep tune",
            "summary": "Broadest safe region recipe with stronger augmentation, larger image size, and more unlocked training choices.",
            "dimension_budget": 6,
            "dimensions_unlocked": [
                "epochs",
                "image_size",
                "augmentation_profile",
                "optimizer",
                "lr_schedule",
                "freeze_depth",
            ],
            "defaults": {
                "epochs": 24,
                "batch_size": 8,
                "img_size": 896,
                "optimizer": "adamw",
                "lr_schedule": "cosine",
                "augmentation_profile": "stronger",
                "freeze_depth": 0,
                "early_stopping_patience": 12,
                "checkpoint_policy": "periodic_dense",
                "checkpoint_frequency": 3,
                "preprocessing_policy": "extended",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "enabled",
                "class_rebalance": "enabled",
                "export_formats": "onnx, torchscript",
            },
        },
    },
    "speed-estimation": {
        "quick_check": {
            "label": "Quick check",
            "summary": "Smallest safe speed recipe for a fast validation run with light augmentation and a narrow tuning budget.",
            "dimension_budget": 1,
            "dimensions_unlocked": ["epochs"],
            "defaults": {
                "epochs": 6,
                "batch_size": 2,
                "img_size": 640,
                "optimizer": "sgd",
                "lr_schedule": "one_cycle",
                "augmentation_profile": "light",
                "freeze_depth": 12,
                "early_stopping_patience": 4,
                "checkpoint_policy": "last_only",
                "checkpoint_frequency": 0,
                "preprocessing_policy": "basic",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "deferred",
                "class_rebalance": "disabled",
                "export_formats": "onnx",
            },
        },
        "recommended": {
            "label": "Recommended",
            "summary": "Moderate speed recipe with balanced augmentation and a broader training budget for most road scenes.",
            "dimension_budget": 3,
            "dimensions_unlocked": ["epochs", "image_size", "augmentation_profile"],
            "defaults": {
                "epochs": 14,
                "batch_size": 4,
                "img_size": 768,
                "optimizer": "auto",
                "lr_schedule": "cosine",
                "augmentation_profile": "balanced",
                "freeze_depth": 6,
                "early_stopping_patience": 8,
                "checkpoint_policy": "periodic",
                "checkpoint_frequency": 5,
                "preprocessing_policy": "standardized",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "enabled",
                "class_rebalance": "enabled",
                "export_formats": "onnx, torchscript",
            },
        },
        "deep_tune": {
            "label": "Deep tune",
            "summary": "Broadest safe speed recipe with stronger augmentation, larger image size, and more unlocked training choices.",
            "dimension_budget": 6,
            "dimensions_unlocked": [
                "epochs",
                "image_size",
                "augmentation_profile",
                "optimizer",
                "lr_schedule",
                "freeze_depth",
            ],
            "defaults": {
                "epochs": 24,
                "batch_size": 8,
                "img_size": 896,
                "optimizer": "adamw",
                "lr_schedule": "cosine",
                "augmentation_profile": "stronger",
                "freeze_depth": 0,
                "early_stopping_patience": 12,
                "checkpoint_policy": "periodic_dense",
                "checkpoint_frequency": 3,
                "preprocessing_policy": "extended",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "enabled",
                "class_rebalance": "enabled",
                "export_formats": "onnx, torchscript",
            },
        },
    },
    "object-tracking": {
        "quick_check": {
            "label": "Quick check",
            "summary": "Smallest safe object tracking recipe for a fast validation run with light augmentation and a narrow tuning budget.",
            "dimension_budget": 1,
            "dimensions_unlocked": ["epochs"],
            "defaults": {
                "epochs": 6,
                "batch_size": 2,
                "img_size": 640,
                "optimizer": "sgd",
                "lr_schedule": "one_cycle",
                "augmentation_profile": "light",
                "freeze_depth": 12,
                "early_stopping_patience": 4,
                "checkpoint_policy": "last_only",
                "checkpoint_frequency": 0,
                "preprocessing_policy": "basic",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "deferred",
                "class_rebalance": "disabled",
                "export_formats": "onnx",
            },
        },
        "recommended": {
            "label": "Recommended",
            "summary": "Moderate object tracking recipe with balanced augmentation and a broader training budget for most scenes.",
            "dimension_budget": 3,
            "dimensions_unlocked": ["epochs", "image_size", "augmentation_profile"],
            "defaults": {
                "epochs": 14,
                "batch_size": 4,
                "img_size": 768,
                "optimizer": "auto",
                "lr_schedule": "cosine",
                "augmentation_profile": "balanced",
                "freeze_depth": 6,
                "early_stopping_patience": 8,
                "checkpoint_policy": "periodic",
                "checkpoint_frequency": 5,
                "preprocessing_policy": "standardized",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "enabled",
                "class_rebalance": "enabled",
                "export_formats": "onnx, torchscript",
            },
        },
        "deep_tune": {
            "label": "Deep tune",
            "summary": "Broadest safe object tracking recipe with stronger augmentation, larger image size, and more unlocked training choices.",
            "dimension_budget": 6,
            "dimensions_unlocked": [
                "epochs",
                "image_size",
                "augmentation_profile",
                "optimizer",
                "lr_schedule",
                "freeze_depth",
            ],
            "defaults": {
                "epochs": 24,
                "batch_size": 8,
                "img_size": 896,
                "optimizer": "adamw",
                "lr_schedule": "cosine",
                "augmentation_profile": "stronger",
                "freeze_depth": 0,
                "early_stopping_patience": 12,
                "checkpoint_policy": "periodic_dense",
                "checkpoint_frequency": 3,
                "preprocessing_policy": "extended",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "enabled",
                "class_rebalance": "enabled",
                "export_formats": "onnx, torchscript",
            },
        },
    },
    "class-wise-object-counting": {
        "quick_check": {
            "label": "Quick check",
            "summary": "Smallest safe class-wise counting recipe for a fast validation run with light augmentation and a narrow tuning budget.",
            "dimension_budget": 1,
            "dimensions_unlocked": ["epochs"],
            "defaults": {
                "epochs": 6,
                "batch_size": 2,
                "img_size": 640,
                "optimizer": "sgd",
                "lr_schedule": "one_cycle",
                "augmentation_profile": "light",
                "freeze_depth": 12,
                "early_stopping_patience": 4,
                "checkpoint_policy": "last_only",
                "checkpoint_frequency": 0,
                "preprocessing_policy": "basic",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "deferred",
                "class_rebalance": "disabled",
                "export_formats": "onnx",
            },
        },
        "recommended": {
            "label": "Recommended",
            "summary": "Moderate class-wise counting recipe with balanced augmentation and a broader training budget for most camera views.",
            "dimension_budget": 3,
            "dimensions_unlocked": ["epochs", "image_size", "augmentation_profile"],
            "defaults": {
                "epochs": 14,
                "batch_size": 4,
                "img_size": 768,
                "optimizer": "auto",
                "lr_schedule": "cosine",
                "augmentation_profile": "balanced",
                "freeze_depth": 6,
                "early_stopping_patience": 8,
                "checkpoint_policy": "periodic",
                "checkpoint_frequency": 5,
                "preprocessing_policy": "standardized",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "enabled",
                "class_rebalance": "enabled",
                "export_formats": "onnx, torchscript",
            },
        },
        "deep_tune": {
            "label": "Deep tune",
            "summary": "Broadest safe class-wise counting recipe with stronger augmentation, larger image size, and more unlocked training choices.",
            "dimension_budget": 6,
            "dimensions_unlocked": [
                "epochs",
                "image_size",
                "augmentation_profile",
                "optimizer",
                "lr_schedule",
                "freeze_depth",
            ],
            "defaults": {
                "epochs": 24,
                "batch_size": 8,
                "img_size": 896,
                "optimizer": "adamw",
                "lr_schedule": "cosine",
                "augmentation_profile": "stronger",
                "freeze_depth": 0,
                "early_stopping_patience": 12,
                "checkpoint_policy": "periodic_dense",
                "checkpoint_frequency": 3,
                "preprocessing_policy": "extended",
                "validation_split": 20,
                "test_split": 10,
                "threshold_tuning": "enabled",
                "class_rebalance": "enabled",
                "export_formats": "onnx, torchscript",
            },
        },
    },
}


class TrainingPlanError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def create_training_plan(session_id: str, request: TrainingPlanRequest) -> dict[str, Any]:
    dataset_payload = fetch_dataset_ready_payload(session_id, use_case_hint=request.use_case_id)
    validate_dataset_payload(dataset_payload)

    plan_config = build_training_plan_config(request, dataset_payload)
    effective_settings = plan_config["effective_training_settings"]
    model_resolution = plan_config["model_resolution"]

    job = create_training_job(
        session_id=session_id,
        dataset_version_id=dataset_payload.dataset_version_id,
        use_case_id=dataset_payload.use_case_id,
        task_type=dataset_payload.task_type,
        base_model=plan_config["normalized"]["base_model"],
        model_path=model_resolution["resolved_model_path"],
        epochs=effective_settings["epochs"],
        batch_size=effective_settings["batch_size"],
        img_size=effective_settings["img_size"],
        status="queued",
        plan_config=plan_config,
        dataset_snapshot=dataset_payload.model_dump(),
    )
    return job


def fetch_dataset_ready_payload(session_id: str, *, use_case_hint: str | None = None) -> DatasetReadyPayload:
    if settings.fine_tuning_use_mock_dataset_ready_payload:
        return build_mock_dataset_ready_payload(session_id, use_case_hint=use_case_hint)

    safe_session_id = quote(session_id, safe="")
    base_url = settings.fine_tuning_internal_base_url.rstrip("/")
    url = f"{base_url}/api/fine-tuning/{safe_session_id}/prepare-dataset-ready-payload"
    payload = json.dumps({}).encode("utf-8")
    request = Request(
        url,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/json"},
    )

    try:
        with urlopen(request, timeout=20) as response:
            raw_body = response.read().decode("utf-8")
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise TrainingPlanError(
            f"Dataset readiness service returned {error.code}: {detail or error.reason}",
            status_code=502,
        ) from error
    except URLError as error:
        raise TrainingPlanError(
            f"Dataset readiness service is unavailable: {error.reason}",
            status_code=502,
        ) from error
    except TimeoutError as error:
        raise TrainingPlanError("Dataset readiness service timed out.", status_code=502) from error

    try:
        data = json.loads(raw_body)
        return DatasetReadyPayload.model_validate(data)
    except Exception as error:
        raise TrainingPlanError("Dataset readiness response is invalid.", status_code=502) from error


def build_mock_dataset_ready_payload(session_id: str, *, use_case_hint: str | None = None) -> DatasetReadyPayload:
    status = settings.fine_tuning_mock_dataset_ready_status
    if status not in MOCK_DATASET_READY_STATUSES:
        raise TrainingPlanError(
            "Invalid mock dataset readiness status. Use ready_for_training, ready_with_warnings, or blocked.",
            status_code=500,
        )

    use_case_id = infer_mock_use_case_id(session_id, use_case_hint=use_case_hint)
    use_case_config = USE_CASE_TRAINING_CONFIG[use_case_id]
    safe_session_id = quote(session_id, safe="")
    return DatasetReadyPayload.model_validate(
        {
            "dataset_version_id": (
                f"mock_{safe_session_id}_v1"
                if use_case_id == "fire-detection"
                else use_case_config["mock_dataset_version"]
            ),
            "use_case_id": use_case_id,
            "task_type": SUPPORTED_TASK_TYPE,
            "prepared_dataset_uri": use_case_config["mock_dataset_uri"],
            "prepared_dataset_manifest_uri": (
                "minio://vision-demo/fine_tuning/manifests/"
                f"{use_case_config['mock_dataset_version'] if use_case_id != 'fire-detection' else f'mock_{safe_session_id}_v1'}.json"
            ),
            "status": status,
            "session_id": session_id,
            "dataset_name": use_case_config["mock_dataset_name"],
            "mock_payload": True,
            "annotation_format": "yolo",
            "class_distribution": {
                "smoking": 0,
                "phone_usage": 0,
            } if use_case_id == "unsafe-behavior-detection" else {},
        }
    )


def validate_dataset_payload(dataset_payload: DatasetReadyPayload) -> None:
    if dataset_payload.use_case_id == "unsafe-behavior-detection" and dataset_payload.status != READY_FOR_TRAINING:
        raise TrainingPlanError(
            f"Unsafe behavior detection training plan requires dataset status {READY_FOR_TRAINING}. Current status: {dataset_payload.status}",
            status_code=400,
        )

    if dataset_payload.status not in TRAINABLE_DATASET_STATUSES:
        raise TrainingPlanError(
            f"Dataset is not ready for training. Current status: {dataset_payload.status}",
            status_code=400,
        )

    if dataset_payload.use_case_id not in SUPPORTED_USE_CASE_IDS:
        raise TrainingPlanError(
            "Training plan currently supports only fire-detection, ppe-detection, region-alerts, crack-detection, unsafe-behavior-detection, speed-estimation, object-tracking, and class-wise-object-counting.",
            status_code=400,
        )

    if dataset_payload.task_type != SUPPORTED_TASK_TYPE:
        raise TrainingPlanError(
            f"Training plan currently supports only {SUPPORTED_TASK_TYPE}.",
            status_code=400,
        )


def build_training_plan_config(request: TrainingPlanRequest, dataset_payload: DatasetReadyPayload) -> dict[str, Any]:
    normalized_base_model = normalize_base_model(request.base_model, dataset_payload.use_case_id)
    normalized_goal = normalize_goal(request.goal)
    normalized_run_depth = normalize_run_depth(request.run_depth)
    normalized_stop_rule = normalize_stop_rule(request.stop_rule)

    recipe = get_run_depth_recipe(dataset_payload.use_case_id, normalized_run_depth)
    advanced_settings = request.advanced_settings or {}
    model_resolution = resolve_model_path(normalized_base_model, dataset_payload.use_case_id)

    effective_settings = {
        "epochs": coerce_int(request.epochs, advanced_settings.get("epochs"), default=recipe["defaults"]["epochs"]),
        "batch_size": coerce_int(
            request.batch_size,
            advanced_settings.get("batch_size"),
            advanced_settings.get("batchSize"),
            default=recipe["defaults"]["batch_size"],
        ),
        "img_size": coerce_int(
            request.img_size,
            advanced_settings.get("img_size"),
            advanced_settings.get("imageSize"),
            default=recipe["defaults"]["img_size"],
        ),
        "optimizer": read_setting(advanced_settings, "optimizer", default=recipe["defaults"]["optimizer"]),
        "lr_schedule": read_setting(
            advanced_settings,
            "learning_rate_strategy",
            "learningRateStrategy",
            default=recipe["defaults"]["lr_schedule"],
        ),
        "augmentation_profile": read_setting(
            advanced_settings,
            "augmentation_profile",
            "augmentationProfile",
            default=recipe["defaults"]["augmentation_profile"],
        ),
        "freeze_depth": coerce_int(
            advanced_settings.get("freeze_depth"),
            advanced_settings.get("freezeDepth"),
            default=recipe["defaults"]["freeze_depth"],
        ),
        "early_stopping_patience": coerce_int(
            advanced_settings.get("early_stopping_patience"),
            advanced_settings.get("earlyStoppingPatience"),
            default=recipe["defaults"]["early_stopping_patience"],
        ),
        "checkpoint_policy": recipe["defaults"]["checkpoint_policy"],
        "checkpoint_frequency": coerce_int(
            advanced_settings.get("checkpoint_frequency"),
            advanced_settings.get("checkpointFrequency"),
            default=recipe["defaults"]["checkpoint_frequency"],
        ),
        "preprocessing_policy": recipe["defaults"]["preprocessing_policy"],
        "validation_split": coerce_int(
            advanced_settings.get("validation_split"),
            advanced_settings.get("validationSplit"),
            default=recipe["defaults"]["validation_split"],
        ),
        "test_split": coerce_int(
            advanced_settings.get("test_split"),
            advanced_settings.get("testSplit"),
            default=recipe["defaults"]["test_split"],
        ),
        "threshold_tuning": read_setting(
            advanced_settings,
            "threshold_tuning",
            "thresholdTuning",
            default=recipe["defaults"]["threshold_tuning"],
        ),
        "class_rebalance": read_setting(
            advanced_settings,
            "class_rebalance",
            "classRebalance",
            default=recipe["defaults"]["class_rebalance"],
        ),
        "export_formats": read_setting(
            advanced_settings,
            "export_formats",
            "exportFormats",
            default=recipe["defaults"]["export_formats"],
        ),
        "experiment_tag": first_non_empty(
            request.experiment_tag,
            advanced_settings.get("experiment_tag"),
            advanced_settings.get("experimentTag"),
        ),
        "notes": first_non_empty(request.notes, advanced_settings.get("notes")),
    }

    return {
        "schema_version": "phase1_training_plan_v1",
        "use_case_id": dataset_payload.use_case_id,
        "task_type": dataset_payload.task_type,
        "annotation_format": getattr(dataset_payload, "annotation_format", "yolo"),
        "classes": (
            ["smoking", "phone_usage"]
            if dataset_payload.use_case_id == "unsafe-behavior-detection"
            else ["crack"]
            if dataset_payload.use_case_id == "crack-detection"
            else []
        ),
        "dataset_version_id": dataset_payload.dataset_version_id,
        "data_fingerprint": getattr(dataset_payload, "data_fingerprint", ""),
        "use_case_note": (
            "Phone usage inference still uses rule-based person-phone association in production unless a later rollout explicitly replaces that logic."
            if dataset_payload.use_case_id == "unsafe-behavior-detection"
            else ""
        ),
        "requested": {
            "use_case_id": request.use_case_id or dataset_payload.use_case_id,
            "base_model": request.base_model,
            "goal": request.goal,
            "run_depth": request.run_depth,
            "stop_rule": request.stop_rule,
            "task_type": dataset_payload.task_type,
        },
        "normalized": {
            "use_case_id": dataset_payload.use_case_id,
            "base_model": normalized_base_model,
            "starting_model": normalized_base_model,
            "goal": normalized_goal,
            "run_depth": normalized_run_depth,
            "stop_rule": normalized_stop_rule,
            "task_type": dataset_payload.task_type,
        },
        "model_resolution": model_resolution,
        "starting_model": {
            "requested_starting_model": request.base_model,
            "normalized_starting_model": normalized_base_model,
            "resolved_model_path": model_resolution["resolved_model_path"],
            "fallback_used": bool(model_resolution.get("fallback_used")),
            "fallback_reason": model_resolution.get("fallback_reason"),
        },
        "run_depth_recipe": {
            "label": recipe["label"],
            "summary": recipe["summary"],
            "dimension_budget": recipe["dimension_budget"],
            "dimensions_unlocked": recipe["dimensions_unlocked"],
        },
        "effective_training_settings": effective_settings,
        "advanced_settings_raw": advanced_settings,
        "extension_settings": request.extension_settings or {},
    }


def normalize_base_model(base_model: str | None, use_case_id: str) -> str:
    normalized_input = (base_model or "").strip()
    normalized_value = GLOBAL_BASE_MODEL_ALIASES.get(normalized_input)
    if normalized_value:
        return normalized_value
    normalized_value = USE_CASE_BASE_MODEL_ALIASES.get(use_case_id, {}).get(normalized_input)
    if normalized_value:
        return normalized_value
    raise TrainingPlanError(f"Unsupported base model: {base_model}", status_code=400)


def normalize_goal(goal: str | None) -> str:
    if not goal:
        return DEFAULT_GOAL
    normalized_value = GOAL_ALIASES.get(goal.strip())
    if normalized_value:
        return normalized_value
    return DEFAULT_GOAL


def normalize_run_depth(run_depth: str | None) -> str:
    if not run_depth:
        return DEFAULT_RUN_DEPTH
    normalized_value = RUN_DEPTH_ALIASES.get(run_depth.strip())
    if normalized_value:
        return normalized_value
    raise TrainingPlanError(f"Unsupported run depth: {run_depth}", status_code=400)


def normalize_stop_rule(stop_rule: str | None) -> str:
    if not stop_rule:
        return DEFAULT_STOP_RULE
    normalized_value = STOP_RULE_ALIASES.get(stop_rule.strip())
    if normalized_value:
        return normalized_value
    return DEFAULT_STOP_RULE


def get_run_depth_recipe(use_case_id: str, run_depth: str) -> dict[str, Any]:
    recipes = RUN_DEPTH_RECIPES_BY_USE_CASE.get(use_case_id)
    if not recipes or run_depth not in recipes:
        raise TrainingPlanError(f"Unsupported run depth recipe for {use_case_id}: {run_depth}", status_code=400)
    return recipes[run_depth]


def resolve_model_path(base_model: str, use_case_id: str) -> dict[str, Any]:
    if base_model == "current_custom":
        return resolve_current_custom_model(use_case_id)
    if base_model == "yolo_medium":
        return resolve_yolo_medium_model()
    if base_model == "yolo_nano":
        return resolve_yolo_nano_model()
    raise TrainingPlanError(f"Unsupported base model: {base_model}", status_code=400)


def resolve_current_custom_model(use_case_id: str) -> dict[str, Any]:
    use_case_config = USE_CASE_TRAINING_CONFIG.get(use_case_id)
    if not use_case_config:
        raise TrainingPlanError(f"Unsupported use case for model resolution: {use_case_id}", status_code=400)

    custom_model_path = use_case_config["custom_model_path"]
    custom_model_source = use_case_config["custom_model_source"]
    if custom_model_path.is_file():
        return {
            "requested_model": "current_custom",
            "resolved_model_path": relative_to_backend(custom_model_path),
            "resolved_model_source": custom_model_source,
            "custom_model_detected": True,
            "fallback_used": False,
            "fallback_reason": None,
        }

    latest_training_artifact = find_latest_trained_fire_model() if use_case_config["allow_runs_fallback"] else None
    if latest_training_artifact is not None:
        return {
            "requested_model": "current_custom",
            "resolved_model_path": relative_to_backend(latest_training_artifact),
            "resolved_model_source": "runs/detect/train*/weights/best.pt",
            "custom_model_detected": True,
            "fallback_used": False,
            "fallback_reason": None,
        }

    nano_model = resolve_yolo_nano_model()
    fallback_messages = {
        "fire-detection": "No fire-specific custom model was found, so the plan falls back to YOLO nano.",
        "crack-detection": "No crack-specific custom model was found, so the plan falls back to YOLO nano.",
        "unsafe-behavior-detection": "No unsafe-behavior smoking model was found, so the plan falls back to YOLO nano.",
        "ppe-detection": "No PPE-specific custom model was found, so the plan falls back to YOLO nano.",
        "region-alerts": "No region-alerts custom model was found, so the plan falls back to YOLO nano.",
        "speed-estimation": "No speed-estimation custom model was found, so the plan falls back to YOLO nano.",
        "object-tracking": "No object-tracking custom model was found, so the plan falls back to YOLO nano.",
        "class-wise-object-counting": "No class-wise-object-counting custom model was found, so the plan falls back to YOLO nano.",
    }
    return {
        "requested_model": "current_custom",
        "resolved_model_path": nano_model["resolved_model_path"],
        "resolved_model_source": nano_model["resolved_model_source"],
        "custom_model_detected": False,
        "fallback_used": True,
        "fallback_reason": fallback_messages.get(
            use_case_id,
            "No use-case-specific custom model was found, so the plan falls back to YOLO nano.",
        ),
    }


def resolve_yolo_medium_model() -> dict[str, Any]:
    if YOLO_MEDIUM_MODEL_PATH.is_file():
        return {
            "requested_model": "yolo_medium",
            "resolved_model_path": relative_to_backend(YOLO_MEDIUM_MODEL_PATH),
            "resolved_model_source": "yolov8m.pt",
            "custom_model_detected": False,
            "fallback_used": False,
            "fallback_reason": None,
        }

    nano_model = resolve_yolo_nano_model()
    return {
        "requested_model": "yolo_medium",
        "resolved_model_path": nano_model["resolved_model_path"],
        "resolved_model_source": nano_model["resolved_model_source"],
        "custom_model_detected": False,
        "fallback_used": True,
        "fallback_reason": "YOLO medium weights are not available locally, so the plan falls back to YOLO nano.",
    }


def resolve_yolo_nano_model() -> dict[str, Any]:
    if YOLO_NANO_MODEL_PATH.is_file():
        resolved_path = relative_to_backend(YOLO_NANO_MODEL_PATH)
        resolved_source = "yolov8n.pt"
    else:
        resolved_path = "yolov8n.pt"
        resolved_source = "ultralytics/yolov8n.pt"

    return {
        "requested_model": "yolo_nano",
        "resolved_model_path": resolved_path,
        "resolved_model_source": resolved_source,
        "custom_model_detected": False,
        "fallback_used": False,
        "fallback_reason": None,
    }


def find_latest_trained_fire_model() -> Path | None:
    if not RUNS_DIR.exists():
        return None

    candidates = sorted(
        (path for path in RUNS_DIR.glob("train*/weights/best.pt") if path.is_file()),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    return candidates[0] if candidates else None


def relative_to_backend(path: Path) -> str:
    return path.relative_to(BASE_DIR).as_posix()


def infer_mock_use_case_id(session_id: str, *, use_case_hint: str | None = None) -> str:
    normalized_hint = (use_case_hint or "").strip().lower()
    if normalized_hint in SUPPORTED_USE_CASE_IDS:
        return normalized_hint

    normalized_session_id = (session_id or "").strip().lower()
    if "ppe" in normalized_session_id:
        return "ppe-detection"
    if "region" in normalized_session_id:
        return "region-alerts"
    if "speed" in normalized_session_id:
        return "speed-estimation"
    if "crack" in normalized_session_id:
        return "crack-detection"
    if "unsafe" in normalized_session_id or "smoking" in normalized_session_id or "phone" in normalized_session_id:
        return "unsafe-behavior-detection"
    if "tracking" in normalized_session_id or "track" in normalized_session_id:
        return "object-tracking"
    if "class-wise" in normalized_session_id or "classwise" in normalized_session_id or "class_wise" in normalized_session_id:
        return "class-wise-object-counting"
    return "fire-detection"


def coerce_int(*values: Any, default: int) -> int:
    for value in values:
        if value is None or value == "":
            continue
        try:
            coerced = int(value)
        except (TypeError, ValueError):
            continue
        if coerced > 0:
            return coerced
    return default


def read_setting(settings_payload: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        value = settings_payload.get(key)
        if value not in (None, ""):
            return value
    return default


def first_non_empty(*values: Any) -> Any:
    for value in values:
        if value not in (None, ""):
            return value
    return None
