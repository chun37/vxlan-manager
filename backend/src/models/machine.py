"""Machine Pydantic models."""
from datetime import datetime
from ipaddress import IPv4Address, IPv6Address
from typing import Any

from pydantic import BaseModel, Field, field_serializer, field_validator

from ..validators import validate_ip_address, validate_mac_address


class MachineBase(BaseModel):
    """Base machine model with common fields."""

    hostname: str = Field(..., min_length=1, max_length=255)
    mac_address: str
    extra_data: dict[str, Any] | None = None

    @field_validator("mac_address")
    @classmethod
    def validate_mac(cls, v: str) -> str:
        """Validate MAC address format."""
        return validate_mac_address(v)


class MachineCreate(MachineBase):
    """Model for creating a new machine."""

    ip_address: str | IPv4Address | IPv6Address

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, v: str | IPv4Address | IPv6Address) -> str | IPv4Address | IPv6Address:
        """Validate IP address format."""
        if isinstance(v, (IPv4Address, IPv6Address)):
            return v
        return validate_ip_address(v)

    @field_serializer("ip_address")
    def serialize_ip(self, v: str | IPv4Address | IPv6Address) -> str:
        """Serialize IP address to string for JSON output."""
        return str(v)


class MachineUpdate(BaseModel):
    """Model for updating an existing machine."""

    hostname: str | None = Field(None, min_length=1, max_length=255)
    mac_address: str | None = None
    extra_data: dict[str, Any] | None = None

    @field_validator("mac_address")
    @classmethod
    def validate_mac(cls, v: str | None) -> str | None:
        """Validate MAC address format if provided."""
        if v is not None:
            return validate_mac_address(v)
        return v


class MachineInDB(MachineBase):
    """Machine model as stored in database."""

    id: int
    ip_address: str | IPv4Address | IPv6Address
    status: str
    last_seen: datetime
    registered_at: datetime
    updated_at: datetime

    @field_serializer("ip_address")
    def serialize_ip(self, v: str | IPv4Address | IPv6Address) -> str:
        """Serialize IP address to string for JSON output."""
        return str(v)

    class Config:
        """Pydantic config."""

        from_attributes = True


class MachineResponse(MachineInDB):
    """Machine model for API responses (includes latest ping status)."""

    is_alive: bool | None = None
    response_time: float | None = None
