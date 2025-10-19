"""PingStatus service for database operations."""
from asyncpg import Pool

from ..models import PingStatusCreate


class PingStatusService:
    """Service for ping status database operations."""

    def __init__(self, db_pool: Pool):
        """Initialize service with database pool."""
        self.db_pool = db_pool

    async def create_ping_status(self, ping_data: PingStatusCreate) -> int:
        """
        Create a new ping status record.

        Args:
            ping_data: Ping status data

        Returns:
            ID of created record
        """
        async with self.db_pool.acquire() as conn:
            record_id = await conn.fetchval(
                """
                INSERT INTO ping_status
                    (machine_id, is_alive, response_time, consecutive_failures, next_check_interval)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
                """,
                ping_data.machine_id,
                ping_data.is_alive,
                ping_data.response_time,
                ping_data.consecutive_failures,
                ping_data.next_check_interval,
            )
            return record_id

    async def update_machine_status_on_failure(
        self, machine_id: int, consecutive_failures: int
    ) -> None:
        """
        Update machine status when failure threshold is reached.

        Args:
            machine_id: Machine ID
            consecutive_failures: Number of consecutive failures
        """
        async with self.db_pool.acquire() as conn:
            # Check if we've reached failure threshold
            from ..config import settings

            if consecutive_failures >= settings.failure_threshold:
                # Update machine status to unreachable
                await conn.execute(
                    """
                    UPDATE machines
                    SET status = 'unreachable',
                        last_seen = CURRENT_TIMESTAMP
                    WHERE id = $1
                    """,
                    machine_id,
                )

                # Create failure log
                machine = await conn.fetchrow(
                    "SELECT hostname, ip_address, mac_address FROM machines WHERE id = $1",
                    machine_id,
                )

                if machine:
                    await conn.execute(
                        """
                        INSERT INTO failure_logs (machine_id, hostname, ip_address, mac_address)
                        VALUES ($1, $2, $3, $4)
                        """,
                        machine_id,
                        machine["hostname"],
                        machine["ip_address"],
                        machine["mac_address"],
                    )

    async def update_machine_status_on_recovery(self, machine_id: int) -> None:
        """
        Update machine status when it recovers from failure.

        Args:
            machine_id: Machine ID
        """
        async with self.db_pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE machines
                SET status = 'active',
                    last_seen = CURRENT_TIMESTAMP
                WHERE id = $1
                """,
                machine_id,
            )

    async def update_machine_last_seen(self, machine_id: int) -> None:
        """
        Update machine's last_seen timestamp on successful ping.

        Args:
            machine_id: Machine ID
        """
        async with self.db_pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE machines
                SET last_seen = CURRENT_TIMESTAMP
                WHERE id = $1
                """,
                machine_id,
            )
