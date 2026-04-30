import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from app.models.training_job import get_training_job, update_training_job_status


BACKEND_DIR = Path(__file__).resolve().parents[2]
DATA_YAML_PATHS = {
    "fire-detection": BACKEND_DIR / "data" / "fire_detection" / "data.yaml",
    "ppe-detection": BACKEND_DIR / "data" / "ppe_detection" / "data.yaml",
    "region-alerts": BACKEND_DIR / "data" / "region_alerts" / "data.yaml",
    "speed-estimation": BACKEND_DIR / "data" / "speed_estimation" / "data.yaml",
    "object-tracking": BACKEND_DIR / "data" / "object_tracking" / "data.yaml",
    "class-wise-object-counting": BACKEND_DIR / "data" / "class_wise_object_counting" / "data.yaml",
}
OUTPUT_PROJECT_DIR = BACKEND_DIR / "runs" / "fine_tuning"
SUPPORTED_STEP5_USE_CASES = {"fire-detection", "ppe-detection", "region-alerts", "speed-estimation", "object-tracking", "class-wise-object-counting"}


class TrainingRunError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def run_training_job(job_id: str) -> dict[str, Any]:
    job = get_training_job(job_id)
    if job is None:
        raise TrainingRunError("Training job not found.", status_code=404)

    if str(job.get("status")) == "running":
        raise TrainingRunError("Training job is already running.", status_code=400)

    running_job = update_training_job_status(job_id, status="running")
    if running_job is None:
        raise TrainingRunError("Training job not found.", status_code=404)

    use_case_id = str(job.get("use_case_id") or "").strip()
    task_type = str(job.get("task_type") or "").strip()
    data_yaml_path = resolve_data_yaml_path(use_case_id)
    output_model_path = build_output_model_path(use_case_id, job_id)
    run_name = build_run_name(use_case_id, job_id)

    if use_case_id not in SUPPORTED_STEP5_USE_CASES:
        update_training_job_status(job_id, status="failed")
        raise TrainingRunError(
            f"Training execution currently supports only {', '.join(sorted(SUPPORTED_STEP5_USE_CASES))}.",
            status_code=400,
        )

    if task_type != "object_detection":
        update_training_job_status(job_id, status="failed")
        raise TrainingRunError(
            f"Training execution currently supports only object_detection jobs. Found: {task_type or 'unknown'}.",
            status_code=400,
        )

    if not data_yaml_path.is_file():
        update_training_job_status(job_id, status="failed")
        raise TrainingRunError(
            f"Training dataset config not found for {use_case_id}: {data_yaml_path.relative_to(BACKEND_DIR).as_posix()}",
            status_code=500,
        )

    clear_dataset_cache_files(data_yaml_path)

    try:
        _run_yolo_training(
            model_path=str(job["model_path"]),
            data_yaml_path=data_yaml_path,
            epochs=int(job["epochs"]),
            batch_size=int(job["batch_size"]),
            img_size=int(job["img_size"]),
            project_dir=OUTPUT_PROJECT_DIR,
            run_name=run_name,
        )
    except subprocess.CalledProcessError as error:
        update_training_job_status(job_id, status="failed")
        detail = error.stderr or error.stdout or str(error)
        raise TrainingRunError(f"Training failed: {detail}", status_code=500) from error
    except FileNotFoundError as error:
        update_training_job_status(job_id, status="failed")
        raise TrainingRunError("Training failed: yolo command was not found.", status_code=500) from error

    if not (BACKEND_DIR / output_model_path).is_file():
        update_training_job_status(job_id, status="failed")
        raise TrainingRunError(
            f"Training finished but the output model was not found at {output_model_path}.",
            status_code=500,
        )

    completed_job = update_training_job_status(
        job_id,
        status="completed",
        output_model_path=output_model_path,
    )
    if completed_job is None:
        raise TrainingRunError("Training job not found after completion.", status_code=404)

    return completed_job


def resolve_data_yaml_path(use_case_id: str) -> Path:
    data_yaml_path = DATA_YAML_PATHS.get(use_case_id)
    if data_yaml_path is None:
        raise TrainingRunError(f"Unsupported use case for training execution: {use_case_id}", status_code=400)
    return data_yaml_path


def build_run_name(use_case_id: str, job_id: str) -> str:
    return f"{use_case_id}_{job_id}"


def build_output_model_path(use_case_id: str, job_id: str) -> str:
    return f"runs/fine_tuning/{build_run_name(use_case_id, job_id)}/weights/best.pt"


def clear_dataset_cache_files(data_yaml_path: Path) -> None:
    dataset_dir = (BACKEND_DIR / data_yaml_path.parent).resolve()
    if not dataset_dir.is_dir():
        return

    for cache_path in dataset_dir.rglob("*.cache"):
        if cache_path.is_file():
            cache_path.unlink(missing_ok=True)


def _run_yolo_training(
    *,
    model_path: str,
    data_yaml_path: Path,
    epochs: int,
    batch_size: int,
    img_size: int,
    project_dir: Path,
    run_name: str,
) -> None:
    data_arg = data_yaml_path.relative_to(BACKEND_DIR).as_posix()
    project_arg = project_dir.relative_to(BACKEND_DIR).as_posix()

    if shutil.which("yolo"):
        command = [
            "yolo",
            "detect",
            "train",
            f"model={model_path}",
            f"data={data_arg}",
            f"epochs={epochs}",
            f"imgsz={img_size}",
            f"batch={batch_size}",
            f"project={project_arg}",
            f"name={run_name}",
        ]
    else:
        python_script = "\n".join(
            [
                "from ultralytics import YOLO",
                f"model = YOLO({model_path!r})",
                "model.train(",
                f"    data={data_arg!r},",
                f"    epochs={epochs},",
                f"    imgsz={img_size},",
                f"    batch={batch_size},",
                f"    project={project_arg!r},",
                f"    name={run_name!r},",
                "    exist_ok=False,",
                ")",
            ]
        )
        command = [sys.executable, "-c", python_script]

    subprocess.run(
        command,
        cwd=str(BACKEND_DIR),
        check=True,
        capture_output=True,
        text=True,
    )
