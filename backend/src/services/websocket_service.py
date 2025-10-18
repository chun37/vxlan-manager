"""WebSocket connection manager for real-time status updates."""
import json
from typing import Set

from fastapi import WebSocket


class WebSocketManager:
    """Manages WebSocket connections and broadcasts messages."""

    def __init__(self):
        """Initialize connection manager."""
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        """
        Accept and register a new WebSocket connection.

        Args:
            websocket: WebSocket connection to register
        """
        await websocket.accept()
        self.active_connections.add(websocket)
        print(f"WebSocket connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket) -> None:
        """
        Remove a WebSocket connection.

        Args:
            websocket: WebSocket connection to remove
        """
        self.active_connections.discard(websocket)
        print(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict) -> None:
        """
        Broadcast a message to all connected clients.

        Args:
            message: Dictionary message to broadcast (will be JSON-encoded)
        """
        if not self.active_connections:
            return

        message_json = json.dumps(message)
        disconnected = set()

        for connection in self.active_connections:
            try:
                await connection.send_text(message_json)
            except Exception as e:
                print(f"Error sending to WebSocket: {e}")
                disconnected.add(connection)

        # Remove failed connections
        for conn in disconnected:
            self.disconnect(conn)


# Global WebSocket manager instance
ws_manager = WebSocketManager()
