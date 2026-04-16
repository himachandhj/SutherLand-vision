"""
Pre-built computer vision use case processors for Sutherland Hub.

Each module exposes a `process_video(...)` function with a common interface:
    - input_path: str
    - output_path: str
    - model_path: str (YOLO model)
    - device: str
    - show: bool

Returns a dict with:
    - output_video: str (path to processed video)
    - metrics: dict (use-case-specific KPIs)
"""

from use_cases.registry import USE_CASE_REGISTRY, get_processor
