from typing import Any

from pydantic import BaseModel, Field


class MinioConnectRequest(BaseModel):
    endpoint: str
    access_key: str
    secret_key: str
    bucket: str
    input_prefix: str = "input/"
    output_prefix: str = "output/"
    use_case_id: str = "ppe-detection"
    processing_mode: str = "manual"


class MinioConnectionDetails(BaseModel):
    provider: str = "MinIO"
    endpoint: str
    bucket: str
    input_prefix: str
    output_prefix: str
    use_case_id: str
    credential_mode: str = "direct"
    processing_mode: str = "manual"
    connected_at: str | None = None


class IntegrationVideoItem(BaseModel):
    object_key: str
    name: str
    size_bytes: int = 0
    last_modified: str | None = None
    status: str = "available"
    preview_url: str | None = None
    output_key: str | None = None
    source_input_key: str | None = None
    updated_at: str | None = None


class IntegrationRunItem(BaseModel):
    id: int
    provider: str
    use_case_id: str
    bucket: str
    input_key: str
    output_key: str
    status: str
    message: str
    metrics: dict[str, Any] = Field(default_factory=dict)
    created_at: str
    updated_at: str
    input_url: str | None = None
    output_url: str | None = None


class MinioIntegrationOverviewResponse(BaseModel):
    connected: bool = False
    processing: bool = False
    message: str = ""
    last_sync_at: str | None = None
    connection: MinioConnectionDetails | None = None
    recent_runs: list[IntegrationRunItem] = Field(default_factory=list)
    input_videos: list[IntegrationVideoItem] = Field(default_factory=list)
    output_videos: list[IntegrationVideoItem] = Field(default_factory=list)
    summary: dict[str, int] = Field(default_factory=dict)


class MinioUploadItem(BaseModel):
    filename: str
    object_key: str
    output_key: str
    status: str
    message: str


class MinioUploadResponse(BaseModel):
    uploaded_files: list[MinioUploadItem] = Field(default_factory=list)
    accepted_count: int = 0
    queued_count: int = 0
    overview: MinioIntegrationOverviewResponse
