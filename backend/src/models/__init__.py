"""Pydantic models package."""
from .failure_log import FailureLogCreate, FailureLogInDB
from .machine import MachineCreate, MachineInDB, MachineResponse, MachineUpdate
from .ping_status import PingStatusCreate, PingStatusInDB
from .websocket import WebSocketStatusUpdate

__all__ = [
    "MachineCreate",
    "MachineUpdate",
    "MachineInDB",
    "MachineResponse",
    "PingStatusCreate",
    "PingStatusInDB",
    "FailureLogCreate",
    "FailureLogInDB",
    "WebSocketStatusUpdate",
]
