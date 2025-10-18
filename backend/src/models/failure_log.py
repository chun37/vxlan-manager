"""FailureLog Pydantic models."""
from datetime import datetime

from pydantic import BaseModel, field_validator

from ..validators import validate_ip_address, validate_mac_address


class FailureLogCreate(BaseModel):
    """Model for creating a new failure log record."""

    machine_id: int
    hostname: str
    ip_address: str
    mac_address: str

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, v: str) -> str:
        """Validate IP address format."""
        return validate_ip_address(v)

    @field_validator("mac_address")
    @classmethod
    def validate_mac(cls, v: str) -> str:
        """Validate MAC address format."""
        return validate_mac_address(v)


class FailureLogInDB(FailureLogCreate):
    """FailureLog model as stored in database."""

    id: int
    failure_detected_at: datetime

    class Config:
        """Pydantic config."""

        from_attributes = True
