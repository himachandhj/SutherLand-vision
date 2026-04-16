from fastapi import APIRouter

from app.schemas.status import StatusResponse


router = APIRouter(tags=["Status"])


@router.get("/status", response_model=StatusResponse)
def get_status() -> StatusResponse:
    return StatusResponse(
        service="Sutherland Hub API",
        message="Backend scaffold is ready for integration.",
    )
