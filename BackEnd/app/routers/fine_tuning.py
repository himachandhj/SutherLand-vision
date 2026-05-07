from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from app.models.training_job import get_training_job
from app.schemas.training_schema import (
    ModelVersionActionResponse,
    RolloutStateResponse,
    TrainingArtifactItem,
    TrainingArtifactsResponse,
    TrainingJobDetailResponse,
    TrainingJobResponse,
    TrainingPlanRequest,
)
from app.services.training_artifacts import (
    TrainingArtifactsError,
    get_training_artifact_file,
    list_training_artifacts,
)
from app.services.model_rollout_service import (
    ModelRolloutError,
    get_rollout_state,
    keep_current_model,
    promote_model_version,
    save_candidate_version,
    stage_model_version,
)
from app.services.training_service import TrainingPlanError, create_training_plan
from app.services.training_runner import TrainingRunError, run_training_job


router = APIRouter(tags=["Fine-Tuning"])


@router.get(
    "/api/fine-tuning/{job_id}",
    response_model=TrainingJobDetailResponse,
)
def get_training_job_endpoint(job_id: str) -> TrainingJobDetailResponse:
    job = get_training_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Training job not found.")

    return TrainingJobDetailResponse(
        id=str(job["id"]),
        session_id=str(job["session_id"]),
        dataset_version_id=str(job["dataset_version_id"]),
        use_case_id=str(job["use_case_id"]),
        task_type=str(job["task_type"]),
        base_model=str(job["base_model"]),
        model_path=str(job["model_path"]),
        epochs=int(job["epochs"]),
        batch_size=int(job["batch_size"]),
        img_size=int(job["img_size"]),
        status=str(job["status"]),
        output_model_path=str(job.get("output_model_path") or ""),
        created_at=str(job["created_at"]),
    )


@router.post(
    "/api/fine-tuning/{session_id}/training-plan",
    response_model=TrainingJobResponse,
)
def create_training_plan_endpoint(
    session_id: str,
    request: TrainingPlanRequest,
) -> TrainingJobResponse:
    try:
        job = create_training_plan(session_id, request)
    except TrainingPlanError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error

    return TrainingJobResponse(
        training_job_id=str(job["id"]),
        status=str(job["status"]),
    )


@router.post(
    "/api/fine-tuning/{job_id}/run",
    response_model=TrainingJobResponse,
)
def run_training_job_endpoint(job_id: str) -> TrainingJobResponse:
    try:
        job = run_training_job(job_id)
    except TrainingRunError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error

    return TrainingJobResponse(
        training_job_id=str(job["id"]),
        status=str(job["status"]),
        data_yaml_path_used=str(job.get("data_yaml_path_used") or ""),
        dataset_source=str(job.get("dataset_source") or ""),
        fallback_used=bool(job.get("fallback_used") or False),
        fallback_reason=str(job.get("fallback_reason") or ""),
    )


@router.post(
    "/api/fine-tuning/{job_id}/save-version",
    response_model=ModelVersionActionResponse,
)
def save_candidate_version_endpoint(job_id: str) -> ModelVersionActionResponse:
    try:
        payload = save_candidate_version(job_id)
    except ModelRolloutError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error

    return ModelVersionActionResponse(**payload)


@router.post(
    "/api/fine-tuning/model-versions/{model_version_id}/stage",
    response_model=ModelVersionActionResponse,
)
def stage_model_version_endpoint(model_version_id: str) -> ModelVersionActionResponse:
    try:
        payload = stage_model_version(model_version_id)
    except ModelRolloutError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error

    return ModelVersionActionResponse(**payload)


@router.post(
    "/api/fine-tuning/model-versions/{model_version_id}/promote",
    response_model=ModelVersionActionResponse,
)
def promote_model_version_endpoint(model_version_id: str) -> ModelVersionActionResponse:
    try:
        payload = promote_model_version(model_version_id)
    except ModelRolloutError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error

    return ModelVersionActionResponse(**payload)


@router.post(
    "/api/fine-tuning/model-versions/{model_version_id}/keep-current",
    response_model=ModelVersionActionResponse,
)
def keep_current_model_endpoint(model_version_id: str) -> ModelVersionActionResponse:
    try:
        payload = keep_current_model(model_version_id)
    except ModelRolloutError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error

    return ModelVersionActionResponse(**payload)


@router.get(
    "/api/fine-tuning/{job_id}/rollout-state",
    response_model=RolloutStateResponse,
)
def get_rollout_state_endpoint(job_id: str) -> RolloutStateResponse:
    try:
        payload = get_rollout_state(job_id)
    except ModelRolloutError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error

    return RolloutStateResponse(**payload)


@router.get(
    "/api/fine-tuning/{job_id}/artifacts",
    response_model=TrainingArtifactsResponse,
)
def list_training_artifacts_endpoint(job_id: str, request: Request) -> TrainingArtifactsResponse:
    try:
        artifact_payload = list_training_artifacts(job_id)
    except TrainingArtifactsError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error

    artifacts = [
        TrainingArtifactItem(
            name=str(item["name"]),
            type=str(item.get("type") or "image"),
            url=str(
                request.url_for(
                    "get_training_artifact_file_endpoint",
                    job_id=job_id,
                    filename=str(item["name"]),
                )
            ),
        )
        for item in artifact_payload["artifacts"]
    ]

    return TrainingArtifactsResponse(
        training_job_id=str(artifact_payload["training_job_id"]),
        train_dir=str(artifact_payload["train_dir"]),
        artifacts=artifacts,
    )


@router.get("/api/fine-tuning/{job_id}/artifacts/{filename}", name="get_training_artifact_file_endpoint")
def get_training_artifact_file_endpoint(job_id: str, filename: str) -> FileResponse:
    try:
        artifact_path = get_training_artifact_file(job_id, filename)
    except TrainingArtifactsError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error

    return FileResponse(artifact_path)
