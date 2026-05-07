from typing import Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class TrainingPlanRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    use_case_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("use_case_id", "useCaseId"),
    )

    base_model: str = Field(
        default="current_model",
        validation_alias=AliasChoices("base_model", "baseModelId"),
    )
    goal: str | None = Field(default=None, validation_alias=AliasChoices("goal", "goalId"))
    run_depth: str | None = Field(
        default=None,
        validation_alias=AliasChoices("run_depth", "trainingModeId"),
    )
    stop_rule: str | None = Field(
        default=None,
        validation_alias=AliasChoices("stop_rule", "stopConditionId"),
    )
    epochs: int | None = Field(default=None, ge=1)
    batch_size: int | None = Field(
        default=None,
        ge=1,
        validation_alias=AliasChoices("batch_size", "batchSize"),
    )
    img_size: int | None = Field(
        default=None,
        ge=32,
        validation_alias=AliasChoices("img_size", "imgSize"),
    )
    advanced_settings: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("advanced_settings", "advancedSettings"),
    )
    extension_settings: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("extension_settings", "extensionSettings"),
    )
    experiment_tag: str | None = Field(
        default=None,
        validation_alias=AliasChoices("experiment_tag", "experimentTag"),
    )
    notes: str | None = None


class DatasetReadyPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    dataset_version_id: str
    use_case_id: str
    task_type: str
    prepared_dataset_uri: str
    prepared_dataset_manifest_uri: str
    status: str


class TrainingJobResponse(BaseModel):
    training_job_id: str
    status: str
    data_yaml_path_used: str = ""
    dataset_source: str = ""
    fallback_used: bool = False
    fallback_reason: str = ""


class TrainingArtifactItem(BaseModel):
    name: str
    type: str = "image"
    url: str


class TrainingArtifactsResponse(BaseModel):
    training_job_id: str
    train_dir: str = ""
    artifacts: list[TrainingArtifactItem] = Field(default_factory=list)


class ModelVersionSummary(BaseModel):
    id: str
    training_job_id: str
    use_case_id: str
    model_path: str
    version_name: str
    status: str
    created_at: str
    updated_at: str
    metadata_json: dict[str, Any] = Field(default_factory=dict)


class ActiveModelSummary(BaseModel):
    use_case_id: str
    active_model_version_id: str = ""
    active_model_path: str = ""
    updated_at: str = ""


class RolloutJobSummary(BaseModel):
    id: str
    status: str
    use_case_id: str
    output_model_path: str = ""
    plan_config: dict[str, Any] = Field(default_factory=dict)


class ModelVersionActionResponse(BaseModel):
    model_version_id: str
    status: str
    model_path: str
    version_name: str
    message: str
    use_case_id: str
    active_model_path: str = ""


class RolloutStateResponse(BaseModel):
    training_job: RolloutJobSummary
    saved_version: ModelVersionSummary | None = None
    staging_version: ModelVersionSummary | None = None
    active_model: ActiveModelSummary


class TrainingJobDetailResponse(BaseModel):
    id: str
    session_id: str
    dataset_version_id: str
    use_case_id: str
    task_type: str
    base_model: str
    model_path: str
    epochs: int
    batch_size: int
    img_size: int
    status: str
    output_model_path: str = ""
    created_at: str


class TrainingJobRecord(BaseModel):
    id: str
    session_id: str
    dataset_version_id: str
    use_case_id: str
    task_type: str
    base_model: str
    model_path: str
    epochs: int
    batch_size: int
    img_size: int
    status: str
    output_model_path: str = ""
    plan_config: dict[str, Any] = Field(default_factory=dict)
    dataset_snapshot: dict[str, Any]
    created_at: str
