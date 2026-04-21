from pydantic import BaseModel, Field


class FineTuningDatasetRegisterRequest(BaseModel):
    name: str = Field(..., min_length=1)
    source_type: str = "minio"
    minio_bucket: str | None = None
    minio_prefix: str = ""
    media_type: str | None = None
    auto_select: bool = True


class FineTuningDatasetSelectRequest(BaseModel):
    dataset_id: int


class FineTuningLabelStatusRequest(BaseModel):
    label_status: str


class FineTuningDatasetReadyPayload(BaseModel):
    workspace_id: str
    dataset_id: int
    use_case_id: str
    dataset_name: str
    label_status: str
    readiness_score: int | None = None
    prepared_dataset_uri: str
    classes: list[str] = Field(default_factory=list)
    accepted_formats: list[str] = Field(default_factory=list)
    status: str
