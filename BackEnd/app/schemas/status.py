from pydantic import BaseModel


class StatusResponse(BaseModel):
    service: str
    message: str
