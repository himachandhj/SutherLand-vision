from typing import Any

from pydantic import BaseModel


class VideoJobResponse(BaseModel):
    id: int
    use_case: str
    use_case_id: str = ""
    filename: str
    status: str
    message: str
    estimated_time: str
    result_url: str
    output_url: str | None = None
    metrics: dict[str, Any] = {}
    created_at: str


class UseCaseInfo(BaseModel):
    id: str
    title: str
    category: str
    description: str
    default_model: str
    metrics_keys: list[str] = []
