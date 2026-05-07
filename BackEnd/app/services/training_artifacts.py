from pathlib import Path

from app.models.training_job import get_training_job


BASE_DIR = Path(__file__).resolve().parents[2]
RUNS_DETECT_DIR = (BASE_DIR / "runs" / "detect").resolve()
RUNS_FINE_TUNING_DIR = (BASE_DIR / "runs" / "fine_tuning").resolve()
ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg"}
ALLOWED_ARTIFACT_NAMES = {
    "results.png",
    "confusion_matrix.png",
    "F1_curve.png",
    "PR_curve.png",
    "P_curve.png",
    "R_curve.png",
    "labels.jpg",
    "labels.png",
}
ALLOWED_ARTIFACT_PREFIXES = ("train_batch", "val_batch")


class TrainingArtifactsError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def list_training_artifacts(job_id: str) -> dict[str, object]:
    job = get_training_job(job_id)
    if job is None:
        raise TrainingArtifactsError("Training job not found.", status_code=404)

    train_dir = resolve_train_dir(job.get("output_model_path") or "")
    if train_dir is None:
        return {
            "training_job_id": job_id,
            "train_dir": "",
            "artifacts": [],
        }

    artifacts = [
        {"name": file_path.name, "type": "image"}
        for file_path in sorted(train_dir.iterdir())
        if file_path.is_file() and is_allowed_artifact_name(file_path.name)
    ]

    return {
        "training_job_id": job_id,
        "train_dir": train_dir.relative_to(BASE_DIR).as_posix(),
        "artifacts": artifacts,
    }


def get_training_artifact_file(job_id: str, filename: str) -> Path:
    job = get_training_job(job_id)
    if job is None:
        raise TrainingArtifactsError("Training job not found.", status_code=404)

    train_dir = resolve_train_dir(job.get("output_model_path") or "")
    if train_dir is None:
        raise TrainingArtifactsError("Training artifacts are not available for this job.", status_code=404)

    if Path(filename).name != filename or not is_allowed_artifact_name(filename):
        raise TrainingArtifactsError("Artifact file is not allowed.", status_code=404)

    artifact_path = (train_dir / filename).resolve()
    if artifact_path.parent != train_dir or not artifact_path.is_file():
        raise TrainingArtifactsError("Artifact file not found.", status_code=404)

    return artifact_path


def resolve_train_dir(output_model_path: str) -> Path | None:
    if not output_model_path:
        return None

    output_path = (BASE_DIR / output_model_path).resolve()
    try:
        train_dir = output_path.parent.parent.resolve()
    except IndexError:
        return None

    if not is_allowed_train_dir(train_dir):
        return None
    if not train_dir.exists() or not train_dir.is_dir():
        return None

    return train_dir


def is_allowed_artifact_name(filename: str) -> bool:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_IMAGE_EXTENSIONS:
        return False
    if filename in ALLOWED_ARTIFACT_NAMES:
        return True
    return filename.startswith(ALLOWED_ARTIFACT_PREFIXES)


def is_allowed_train_dir(train_dir: Path) -> bool:
    allowed_roots = (RUNS_DETECT_DIR, RUNS_FINE_TUNING_DIR)
    for root in allowed_roots:
        if train_dir == root or root in train_dir.parents:
            return True
    return False
