"""WebSocket message models."""
from datetime import datetime

from pydantic import BaseModel


class WebSocketStatusUpdate(BaseModel):
    """WebSocket status update message."""

    type: str = "status_update"
    machine_id: int
    status: str  # 'active' or 'unreachable'
    is_alive: bool
    response_time: float | None = None
    last_seen: datetime
