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


class FineTuningAnnotationBox(BaseModel):
    class_name: str | None = None
    class_id: int | None = None
    x_center: float
    y_center: float
    width: float
    height: float


class FineTuningAnnotationPoint(BaseModel):
    x: float
    y: float


class FineTuningManualAnnotationRequest(BaseModel):
    media_object_key: str | None = None
    item_id: str | None = None
    file_name: str | None = None
    class_names: list[str] = Field(default_factory=list)
    annotations: list[FineTuningAnnotationBox] = Field(default_factory=list)


class FineTuningAutoLabelRequest(BaseModel):
    mode: str = "yolo"
    prompts: list[str] = Field(default_factory=list)
    item_ids: list[str] = Field(default_factory=list)
    limit: int = 12
    confidence: float = 0.25


class FineTuningAssistLabelRequest(BaseModel):
    prompts: list[str] = Field(default_factory=list)
    limit: int = 24
    confidence: float = 0.25


class FineTuningSamAssistRequest(BaseModel):
    media_object_key: str | None = None
    item_id: str | None = None
    file_name: str | None = None
    class_name: str | None = None
    point: FineTuningAnnotationPoint | None = None
    box: FineTuningAnnotationBox | None = None


class FineTuningSplitSummary(BaseModel):
    train: int = 0
    val: int = 0
    test: int = 0


class FineTuningDatasetReadyPayload(BaseModel):
    workspace_id: str
    dataset_id: str
    dataset_version_id: str
    use_case_id: str
    dataset_name: str
    label_status: str
    readiness_score: int
    prepared_dataset_uri: str
    prepared_dataset_manifest_uri: str
    annotation_format: str
    task_type: str
    split_summary: FineTuningSplitSummary = Field(default_factory=FineTuningSplitSummary)
    class_distribution: dict[str, int] = Field(default_factory=dict)
    item_count: int
    label_count: int
    warnings: list[str] = Field(default_factory=list)
    blocking_issues: list[str] = Field(default_factory=list)
    schema_version: str = "v1"
    data_fingerprint: str
    status: str
