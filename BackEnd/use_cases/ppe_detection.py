"""
PPE Detection — Use Case Adapter
=================================
Wraps the root ppe_detection.py engine with the standard use-case interface
so the generic registry / analyze-use-case endpoint can dispatch to it.

Standard interface:
    process_video(*, input_path, output_path, model_path, device, show, **kwargs)
    → {"output_video": str, "metrics": dict}
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Ensure the BackEnd root is on sys.path so we can import the root ppe_detection module.
_BACKEND_ROOT = str(Path(__file__).resolve().parents[1])
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

import ppe_detection as _engine  # noqa: E402  (root-level module)

BASE_DIR = Path(__file__).resolve().parents[1]


def process_video(
    *,
    input_path: str,
    output_path: str | None = None,
    model_path: str = "yolov8n.pt",
    device: str | None = None,
    show: bool = False,
    conf: float = 0.40,
    ppe_conf: float = 0.30,
    **kwargs,
) -> dict:
    """
    Standard use-case interface for PPE Detection.

    Accepts the generic parameters dispatched by the registry and forwards
    them to the accuracy-first PPE engine.

    Returns:
        {
            "output_video": str,
            "metrics": {
                "total_workers": int,
                "total_violations": int,
                "frames_analyzed": int,
                "avg_compliance_rate": float,
            }
        }
    """
    # Resolve model path — prefer yolov8n.pt if it lives in BackEnd root
    resolved_model = model_path
    if not os.path.isfile(resolved_model):
        candidate = BASE_DIR / "yolov8n.pt"
        if candidate.exists():
            resolved_model = str(candidate)

    # Look for optional dedicated PPE YOLO model (ppe.pt)
    ppe_model_path: str | None = None
    ppe_candidate = BASE_DIR / "ppe.pt"
    if ppe_candidate.exists():
        ppe_model_path = str(ppe_candidate)

    return _engine.process_video(
        input_path=input_path,
        output_path=output_path,
        model_path=resolved_model,
        ppe_model_path=ppe_model_path,
        conf=conf,
        ppe_conf=ppe_conf,
        device=device,
        show=show,
    )
