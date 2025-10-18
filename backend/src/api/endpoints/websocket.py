"""WebSocket API endpoint for real-time status updates."""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ...services.websocket_service import ws_manager

router = APIRouter()


@router.websocket("/ws/status")
async def websocket_status_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time machine status updates.

    Clients connect to this endpoint to receive real-time notifications
    when machine status changes (active ⇔ unreachable).

    Message format:
    {
        "type": "status_update",
        "machine_id": 1,
        "status": "unreachable",
        "is_alive": false,
        "response_time": null,
        "last_seen": "2024-01-01T00:05:00Z"
    }
    """
    await ws_manager.connect(websocket)

    try:
        # Send connection confirmation
        await websocket.send_json({"type": "connection", "message": "Connected to status updates"})

        # Keep connection alive and listen for client messages
        while True:
            # Receive messages from client (if any)
            data = await websocket.receive_text()
            # For now, we don't process client messages
            # Status updates are server-initiated (broadcast from monitor_service)

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
        print("WebSocket client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        ws_manager.disconnect(websocket)
