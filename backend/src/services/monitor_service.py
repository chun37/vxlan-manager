"""Machine monitoring service with background tasks."""
import asyncio
from dataclasses import dataclass
from datetime import datetime
from typing import Dict

from asyncpg import Pool

from ..config import settings
from ..models import PingStatusCreate, WebSocketStatusUpdate
from .backoff import calculate_backoff
from .ping_status_service import PingStatusService
from .ping_utils import ping_host
from .websocket_service import ws_manager


@dataclass
class MachineMonitor:
    """Machine monitoring state."""

    machine_id: int
    ip_address: str
    consecutive_failures: int = 0
    next_check_interval: int = 60
    last_check: datetime | None = None
    is_alive: bool | None = None


class MachineMonitorManager:
    """Manages all machine monitoring tasks."""

    def __init__(self, db_pool: Pool):
        """Initialize monitor manager."""
        self.db_pool = db_pool
        self.monitors: Dict[int, asyncio.Task] = {}
        self.monitor_states: Dict[int, MachineMonitor] = {}
        self.ping_status_service = PingStatusService(db_pool)

    async def start_monitoring(self, machine_id: int, ip_address: str) -> None:
        """
        Start monitoring a machine.

        Args:
            machine_id: Machine ID
            ip_address: Machine IP address
        """
        if machine_id in self.monitors:
            print(f"Already monitoring machine {machine_id}")
            return

        # Create monitor state
        monitor_state = MachineMonitor(
            machine_id=machine_id,
            ip_address=ip_address,
        )
        self.monitor_states[machine_id] = monitor_state

        # Create long-running task
        task = asyncio.create_task(self._monitor_machine(monitor_state))
        self.monitors[machine_id] = task

        print(f"Started monitoring {ip_address} (machine {machine_id})")

    async def stop_monitoring(self, machine_id: int) -> None:
        """
        Stop monitoring a machine.

        Args:
            machine_id: Machine ID
        """
        if machine_id not in self.monitors:
            return

        # Cancel task
        task = self.monitors[machine_id]
        task.cancel()

        try:
            await task
        except asyncio.CancelledError:
            pass

        # Cleanup
        del self.monitors[machine_id]
        del self.monitor_states[machine_id]

        print(f"Stopped monitoring machine {machine_id}")

    async def shutdown(self) -> None:
        """Gracefully shutdown all monitoring tasks."""
        print(f"Shutting down {len(self.monitors)} monitor tasks...")

        # Cancel all tasks
        for task in self.monitors.values():
            task.cancel()

        # Wait for all tasks to complete
        if self.monitors:
            await asyncio.gather(
                *self.monitors.values(),
                return_exceptions=True,
            )

        self.monitors.clear()
        self.monitor_states.clear()
        print("All monitors shut down")

    def get_status(self, machine_id: int) -> MachineMonitor | None:
        """Get machine monitoring status."""
        return self.monitor_states.get(machine_id)

    def get_all_statuses(self) -> Dict[int, MachineMonitor]:
        """Get all machine monitoring statuses."""
        return self.monitor_states.copy()

    async def _monitor_machine(self, monitor: MachineMonitor) -> None:
        """
        Long-running monitoring task for a single machine.

        Args:
            monitor: Machine monitor state
        """
        while True:
            try:
                # Execute ping
                is_alive, response_time = await ping_host(monitor.ip_address)

                # Update monitor state
                monitor.last_check = datetime.utcnow()
                monitor.is_alive = is_alive

                if is_alive:
                    # Success - reset failure count
                    was_down = monitor.consecutive_failures >= settings.failure_threshold

                    monitor.consecutive_failures = 0
                    monitor.next_check_interval = settings.min_check_interval

                    # If machine was down and now recovered, update status
                    if was_down:
                        await self.ping_status_service.update_machine_status_on_recovery(
                            monitor.machine_id
                        )

                        # Broadcast recovery via WebSocket
                        await self._broadcast_status_update(
                            monitor.machine_id,
                            "active",
                            is_alive,
                            response_time,
                            monitor.last_check,
                        )
                else:
                    # Failure - increment count and apply backoff
                    monitor.consecutive_failures += 1
                    monitor.next_check_interval = calculate_backoff(
                        monitor.consecutive_failures
                    )

                    # If threshold reached, update status to unreachable
                    if monitor.consecutive_failures == settings.failure_threshold:
                        await self.ping_status_service.update_machine_status_on_failure(
                            monitor.machine_id, monitor.consecutive_failures
                        )

                        # Broadcast failure via WebSocket
                        await self._broadcast_status_update(
                            monitor.machine_id,
                            "unreachable",
                            is_alive,
                            response_time,
                            monitor.last_check,
                        )

                # Record ping status
                ping_data = PingStatusCreate(
                    machine_id=monitor.machine_id,
                    is_alive=is_alive,
                    response_time=response_time,
                    consecutive_failures=monitor.consecutive_failures,
                    next_check_interval=monitor.next_check_interval,
                )
                await self.ping_status_service.create_ping_status(ping_data)

                # Sleep until next check
                await asyncio.sleep(monitor.next_check_interval)

            except asyncio.CancelledError:
                print(f"Monitor for {monitor.ip_address} cancelled")
                break
            except Exception as e:
                print(f"Error monitoring {monitor.ip_address}: {e}")
                await asyncio.sleep(60)  # Retry after 1 minute on error

    async def _broadcast_status_update(
        self,
        machine_id: int,
        status: str,
        is_alive: bool,
        response_time: float | None,
        last_seen: datetime,
    ) -> None:
        """
        Broadcast machine status update via WebSocket.

        Args:
            machine_id: Machine ID
            status: Machine status ('active' or 'unreachable')
            is_alive: Ping result
            response_time: Ping response time in ms
            last_seen: Last seen timestamp
        """
        message = WebSocketStatusUpdate(
            machine_id=machine_id,
            status=status,
            is_alive=is_alive,
            response_time=response_time,
            last_seen=last_seen,
        )

        await ws_manager.broadcast(message.model_dump(mode="json"))


# Global monitor manager instance (will be initialized in main.py)
monitor_manager: MachineMonitorManager | None = None
