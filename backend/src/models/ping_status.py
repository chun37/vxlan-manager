"""PingStatus Pydantic models."""
from datetime import datetime

from pydantic import BaseModel, Field


class PingStatusCreate(BaseModel):
    """Model for creating a new ping status record."""

    machine_id: int
    is_alive: bool
    response_time: float | None = Field(None, ge=0)
    consecutive_failures: int = Field(0, ge=0)
    next_check_interval: int = Field(60, ge=60, le=3600)


class PingStatusInDB(PingStatusCreate):
    """PingStatus model as stored in database."""

    id: int
    checked_at: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True
