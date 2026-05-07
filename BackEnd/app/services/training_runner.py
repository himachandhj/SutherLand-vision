import json
import shutil
import subprocess
import sys
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import unquote, urlparse

from app.core.config import settings
from app.core.minio_integration import MinioConnectionConfig, create_client
from app.models.training_job import get_training_job, update_training_job_status
from app.services.fine_tuning import LABEL_EXTENSIONS, SUPPORTED_MEDIA_EXTENSIONS


BACKEND_DIR = Path(__file__).resolve().parents[2]
DATA_YAML_PATHS = {
    "fire-detection": BACKEND_DIR / "data" / "fire_detection" / "data.yaml",
    "ppe-detection": BACKEND_DIR / "data" / "ppe_detection" / "data.yaml",
    "crack-detection": BACKEND_DIR / "data" / "crack_detection" / "data.yaml",
    "unsafe-behavior-detection": BACKEND_DIR / "data" / "unsafe_behavior" / "data.yaml",
    "region-alerts": BACKEND_DIR / "data" / "region_alerts" / "data.yaml",
    "speed-estimation": BACKEND_DIR / "data" / "speed_estimation" / "data.yaml",
    "object-tracking": BACKEND_DIR / "data" / "object_tracking" / "data.yaml",
    "class-wise-object-counting": BACKEND_DIR / "data" / "class_wise_object_counting" / "data.yaml",
}
OUTPUT_PROJECT_DIR = BACKEND_DIR / "runs" / "fine_tuning"
RUNTIME_DATASET_DIR = BACKEND_DIR / "data" / "fine_tuning_runtime"
SUPPORTED_STEP5_USE_CASES = {"fire-detection", "ppe-detection", "crack-detection", "unsafe-behavior-detection", "region-alerts", "speed-estimation", "object-tracking", "class-wise-object-counting"}
TRAINABLE_SNAPSHOT_STATUSES = {"ready_for_training", "ready_with_warnings"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
USE_CASE_DEFAULT_CLASS_NAMES = {
    "fire-detection": ["fire", "smoke"],
    "ppe-detection": ["helmet", "gloves", "vest", "boots", "goggles", "none", "person", "no_helmet", "no_goggle", "no_gloves", "no_boots"],
    "crack-detection": ["crack"],
    "unsafe-behavior-detection": ["smoking", "phone_usage"],
    "region-alerts": ["person", "car", "truck", "bus", "motorcycle", "bicycle", "forklift", "bulldozer", "crane", "excavator"],
    "speed-estimation": ["person", "car", "truck", "bus", "motorcycle", "bicycle", "forklift", "bulldozer", "crane", "excavator"],
    "object-tracking": ["person", "car", "truck", "bus", "motorcycle", "bicycle", "forklift", "bulldozer", "crane", "excavator"],
    "class-wise-object-counting": ["person", "car", "truck", "bus", "motorcycle", "bicycle", "forklift", "bulldozer", "crane", "excavator"],
}


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
    dataset_resolution = resolve_training_data_yaml(job)
    data_yaml_path = dataset_resolution["data_yaml_path"]
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
        if use_case_id == "crack-detection":
            raise TrainingRunError(
                "Crack Detection training dataset not found at data/crack_detection/data.yaml",
                status_code=500,
            )
        if use_case_id == "unsafe-behavior-detection":
            raise TrainingRunError(
                "Unsafe Behavior training dataset not found at data/unsafe_behavior/data.yaml",
                status_code=500,
            )
        raise TrainingRunError(
            f"Training dataset config not found for {use_case_id}: {display_path(data_yaml_path)}",
            status_code=500,
        )

    print(
        "Step 5 training start:",
        json.dumps(
            {
                "training_job_id": job_id,
                "use_case_id": use_case_id,
                "dataset_source": dataset_resolution["source_type"],
                "data_yaml_path": display_path(data_yaml_path),
                "fallback_used": bool(dataset_resolution["fallback_used"]),
                "fallback_reason": dataset_resolution["fallback_reason"] or "",
            }
        ),
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

    completed_job["data_yaml_path_used"] = display_path(data_yaml_path)
    completed_job["dataset_source"] = str(dataset_resolution["source_type"])
    completed_job["fallback_used"] = bool(dataset_resolution["fallback_used"])
    completed_job["fallback_reason"] = str(dataset_resolution["fallback_reason"] or "")
    return completed_job


def resolve_data_yaml_path(use_case_id: str) -> Path:
    data_yaml_path = DATA_YAML_PATHS.get(use_case_id)
    if data_yaml_path is None:
        raise TrainingRunError(f"Unsupported use case for training execution: {use_case_id}", status_code=400)
    return data_yaml_path


def resolve_training_data_yaml(job: dict[str, Any]) -> dict[str, Any]:
    use_case_id = str(job.get("use_case_id") or "").strip()
    dataset_snapshot = job.get("dataset_snapshot") or {}
    local_fallback_path = resolve_data_yaml_path(use_case_id)

    if dataset_snapshot:
        snapshot_status = str(dataset_snapshot.get("status") or "").strip().lower()
        if snapshot_status in TRAINABLE_SNAPSHOT_STATUSES:
            direct_data_yaml_path = resolve_snapshot_local_data_yaml_path(dataset_snapshot)
            if direct_data_yaml_path is not None and direct_data_yaml_path.is_file():
                return {
                    "data_yaml_path": direct_data_yaml_path,
                    "source_type": "dataset_snapshot",
                    "fallback_used": False,
                    "fallback_reason": "",
                }
            try:
                materialized_path = materialize_dataset_snapshot(dataset_snapshot, use_case_id)
                return {
                    "data_yaml_path": materialized_path,
                    "source_type": "dataset_snapshot",
                    "fallback_used": False,
                    "fallback_reason": "",
                }
            except TrainingRunError as error:
                if local_fallback_path.is_file():
                    return {
                        "data_yaml_path": local_fallback_path,
                        "source_type": "local_fallback",
                        "fallback_used": True,
                        "fallback_reason": error.message,
                    }
                raise
        if local_fallback_path.is_file():
            return {
                "data_yaml_path": local_fallback_path,
                "source_type": "local_fallback",
                "fallback_used": True,
                "fallback_reason": f"Dataset snapshot status is not trainable: {snapshot_status or 'unknown'}",
            }
        raise TrainingRunError(
            f"Dataset snapshot exists but is not trainable (status: {snapshot_status or 'unknown'}), and no local fallback dataset was found.",
            status_code=400,
        )

    if local_fallback_path.is_file():
        return {
            "data_yaml_path": local_fallback_path,
            "source_type": "local_fallback",
            "fallback_used": False,
            "fallback_reason": "",
        }

    raise TrainingRunError(
        f"No dataset snapshot was saved for this job and no fallback dataset config exists for {use_case_id}.",
        status_code=500,
    )


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


def resolve_snapshot_local_data_yaml_path(dataset_snapshot: dict[str, Any]) -> Path | None:
    for raw_value in [
        dataset_snapshot.get("prepared_dataset_uri"),
        dataset_snapshot.get("prepared_dataset_manifest_uri"),
    ]:
        path = resolve_local_path(raw_value)
        if path is None:
            continue
        if path.is_file() and path.name == "data.yaml":
            return path
        if path.is_dir():
            candidate = path / "data.yaml"
            if candidate.is_file():
                return candidate
    return None


def resolve_local_path(raw_value: Any) -> Path | None:
    value = str(raw_value or "").strip()
    if not value or value.startswith("minio://"):
        return None
    if value.startswith("file://"):
        parsed = urlparse(value)
        path = Path(unquote(parsed.path))
    else:
        path = Path(value)
    if not path.is_absolute():
        path = (BACKEND_DIR / path).resolve()
    return path


def parse_minio_uri(uri: str) -> tuple[str, str]:
    parsed = urlparse(uri)
    if parsed.scheme != "minio" or not parsed.netloc:
        raise TrainingRunError(f"Unsupported MinIO URI: {uri}", status_code=500)
    return parsed.netloc, parsed.path.lstrip("/")


def materialize_dataset_snapshot(dataset_snapshot: dict[str, Any], use_case_id: str) -> Path:
    dataset_version_id = str(dataset_snapshot.get("dataset_version_id") or "").strip()
    if not dataset_version_id:
        raise TrainingRunError(
            "Dataset snapshot exists but could not be materialized for YOLO training: dataset_version_id is missing.",
            status_code=500,
        )

    manifest = load_dataset_manifest(dataset_snapshot)
    annotation_format = str(
        dataset_snapshot.get("annotation_format") or manifest.get("annotation_format") or "unknown"
    ).strip().lower()
    if annotation_format != "yolo":
        raise TrainingRunError(
            f"Dataset snapshot exists but could not be materialized for YOLO training: annotation format '{annotation_format}' is not supported yet.",
            status_code=500,
        )

    supported_files = manifest.get("supported_files") or []
    if not isinstance(supported_files, list) or not supported_files:
        raise TrainingRunError(
            "Dataset snapshot exists but could not be materialized for YOLO training: manifest does not include file-level supported_files.",
            status_code=500,
        )

    runtime_root = RUNTIME_DATASET_DIR / dataset_version_id
    if runtime_root.exists():
        shutil.rmtree(runtime_root)
    for relative_dir in [
        "images/train",
        "images/val",
        "images/test",
        "labels/train",
        "labels/val",
        "labels/test",
    ]:
        (runtime_root / relative_dir).mkdir(parents=True, exist_ok=True)

    media_items = sorted(
        [
            item
            for item in supported_files
            if str(item.get("suffix") or "").lower() in IMAGE_EXTENSIONS
        ],
        key=lambda item: str(item.get("object_key") or ""),
    )
    if not media_items:
        raise TrainingRunError(
            "Dataset snapshot exists but could not be materialized for YOLO training: no supported image files were found in the manifest.",
            status_code=500,
        )

    label_items_by_stem: dict[str, dict[str, Any]] = {}
    for item in supported_files:
        suffix = str(item.get("suffix") or "").lower()
        if suffix != ".txt":
            continue
        stem = PurePosixPath(str(item.get("object_key") or "")).stem
        label_items_by_stem.setdefault(stem, item)

    bucket, _ = resolve_manifest_bucket_prefix(dataset_snapshot, manifest)
    client = create_client(
        MinioConnectionConfig(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            bucket=bucket,
            input_prefix="",
            output_prefix=settings.minio_output_prefix,
            secure=settings.minio_secure,
        ).normalized()
    )

    split_items = assign_split_items(media_items, dataset_snapshot.get("split_summary") or manifest.get("split_summary") or {})
    for split_name, items in split_items.items():
        for item in items:
            object_key = str(item.get("object_key") or "")
            file_name = PurePosixPath(object_key).name
            image_target = runtime_root / "images" / split_name / file_name
            image_target.write_bytes(read_minio_object_bytes(client, bucket, object_key))

            stem = PurePosixPath(object_key).stem
            label_target = runtime_root / "labels" / split_name / f"{stem}.txt"
            label_item = label_items_by_stem.get(stem)
            if label_item is None:
                label_target.write_text("", encoding="utf-8")
            else:
                label_target.write_bytes(read_minio_object_bytes(client, bucket, str(label_item.get("object_key") or "")))

    class_names = resolve_runtime_class_names(use_case_id, dataset_snapshot, manifest)
    data_yaml_path = runtime_root / "data.yaml"
    data_yaml_path.write_text(
        build_runtime_data_yaml(runtime_root, class_names, include_test=bool(split_items["test"])),
        encoding="utf-8",
    )
    return data_yaml_path


def load_dataset_manifest(dataset_snapshot: dict[str, Any]) -> dict[str, Any]:
    manifest_uri = str(dataset_snapshot.get("prepared_dataset_manifest_uri") or "").strip()
    if not manifest_uri:
        raise TrainingRunError(
            "Dataset snapshot exists but could not be materialized for YOLO training: prepared_dataset_manifest_uri is missing.",
            status_code=500,
        )

    local_manifest_path = resolve_local_path(manifest_uri)
    if local_manifest_path is not None:
        if not local_manifest_path.is_file():
            raise TrainingRunError(
                f"Dataset snapshot exists but the local manifest file was not found: {local_manifest_path}",
                status_code=500,
            )
        try:
            return json.loads(local_manifest_path.read_text(encoding="utf-8"))
        except Exception as error:
            raise TrainingRunError(
                f"Dataset snapshot exists but the local manifest could not be parsed: {error}",
                status_code=500,
            ) from error

    bucket, object_key = parse_minio_uri(manifest_uri)
    client = create_client(
        MinioConnectionConfig(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            bucket=bucket,
            input_prefix="",
            output_prefix=settings.minio_output_prefix,
            secure=settings.minio_secure,
        ).normalized()
    )
    try:
        return json.loads(read_minio_object_bytes(client, bucket, object_key).decode("utf-8"))
    except Exception as error:
        raise TrainingRunError(
            f"Dataset snapshot exists but could not be materialized for YOLO training: manifest download failed ({error}).",
            status_code=500,
        ) from error


def resolve_manifest_bucket_prefix(dataset_snapshot: dict[str, Any], manifest: dict[str, Any]) -> tuple[str, str]:
    manifest_minio = manifest.get("minio") or {}
    bucket = str(manifest_minio.get("bucket") or "").strip()
    prefix = str(manifest_minio.get("prefix") or "").strip()
    if bucket:
        return bucket, prefix

    prepared_dataset_uri = str(dataset_snapshot.get("prepared_dataset_uri") or "").strip()
    if prepared_dataset_uri.startswith("minio://"):
        return parse_minio_uri(prepared_dataset_uri)

    raise TrainingRunError(
        "Dataset snapshot exists but could not be materialized for YOLO training: MinIO bucket/prefix metadata is missing.",
        status_code=500,
    )


def read_minio_object_bytes(client: Any, bucket: str, object_key: str) -> bytes:
    response = client.get_object(bucket, object_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def assign_split_items(media_items: list[dict[str, Any]], split_summary: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    items = list(media_items)
    total = len(items)
    if total == 0:
        return {"train": [], "val": [], "test": []}

    train_target = max(0, int(split_summary.get("train") or 0))
    val_target = max(0, int(split_summary.get("val") or 0))
    test_target = max(0, int(split_summary.get("test") or 0))

    if train_target + val_target + test_target <= 0:
        train_target = total

    if total == 1:
        return {"train": items[:1], "val": items[:1], "test": []}

    if val_target <= 0:
        derived_val = max(1, min(total - 1, round(total * 0.2)))
        return {
            "train": items[:-derived_val],
            "val": items[-derived_val:],
            "test": [],
        }

    train_count = min(train_target, total)
    remaining = total - train_count
    val_count = min(val_target, remaining)
    remaining -= val_count
    test_count = min(test_target, remaining)

    train_items = items[:train_count]
    val_items = items[train_count:train_count + val_count]
    test_items = items[train_count + val_count:train_count + val_count + test_count]

    leftovers = items[train_count + val_count + test_count:]
    train_items.extend(leftovers)

    if not train_items and val_items:
        train_items.append(val_items.pop(0))
    if not val_items:
        val_items = train_items[-1:] if train_items else items[:1]

    return {"train": train_items, "val": val_items, "test": test_items}


def resolve_runtime_class_names(use_case_id: str, dataset_snapshot: dict[str, Any], manifest: dict[str, Any]) -> list[str]:
    class_distribution = dataset_snapshot.get("class_distribution") or manifest.get("class_distribution") or {}
    if isinstance(class_distribution, dict) and class_distribution:
        non_numeric_keys = [str(key).strip() for key in class_distribution.keys() if str(key).strip() and not str(key).strip().isdigit()]
        if non_numeric_keys:
            return non_numeric_keys

    local_names = read_class_names_from_data_yaml(DATA_YAML_PATHS.get(use_case_id))
    if local_names:
        if use_case_id == "fire-detection" and "smoke" not in {name.strip().lower() for name in local_names}:
            return USE_CASE_DEFAULT_CLASS_NAMES[use_case_id]
        return local_names

    return USE_CASE_DEFAULT_CLASS_NAMES.get(use_case_id, ["object"])


def read_class_names_from_data_yaml(data_yaml_path: Path | None) -> list[str]:
    if data_yaml_path is None or not data_yaml_path.is_file():
        return []
    try:
        lines = data_yaml_path.read_text(encoding="utf-8").splitlines()
    except Exception:
        return []

    collecting = False
    names_by_index: dict[int, str] = {}
    list_names: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not collecting:
            if stripped == "names:":
                collecting = True
            continue
        if not stripped:
            continue
        if not line.startswith((" ", "\t")):
            break
        if stripped.startswith("-"):
            candidate = stripped[1:].strip().strip("\"'")
            if candidate:
                list_names.append(candidate)
            continue
        if ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key.isdigit() and value:
            names_by_index[int(key)] = value
    if names_by_index:
        return [names_by_index[index] for index in sorted(names_by_index)]
    return list_names


def build_runtime_data_yaml(runtime_root: Path, class_names: list[str], *, include_test: bool) -> str:
    lines = [
        f"path: {runtime_root.as_posix()}",
        "train: images/train",
        "val: images/val",
    ]
    if include_test:
        lines.append("test: images/test")
    lines.append("")
    lines.append("names:")
    for index, name in enumerate(class_names):
        lines.append(f"  {index}: {name}")
    return "\n".join(lines) + "\n"


def display_path(path: Path) -> str:
    try:
        return path.relative_to(BACKEND_DIR).as_posix()
    except ValueError:
        return path.as_posix()


def path_arg(path: Path) -> str:
    try:
        return path.relative_to(BACKEND_DIR).as_posix()
    except ValueError:
        return path.as_posix()


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
    data_arg = path_arg(data_yaml_path)
    project_arg = path_arg(project_dir)

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
