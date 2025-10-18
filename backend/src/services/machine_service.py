"""Machine service for database operations."""
from typing import Any

from asyncpg import Pool

from ..config import settings
from ..models import MachineCreate, MachineInDB, MachineResponse, MachineUpdate


class MachineService:
    """Service for machine-related database operations."""

    def __init__(self, db_pool: Pool):
        """Initialize service with database pool."""
        self.db_pool = db_pool

    async def validate_machine_limit(self) -> None:
        """
        Validate that machine count is below maximum limit.

        Raises:
            ValueError: If machine limit is reached
        """
        async with self.db_pool.acquire() as conn:
            count = await conn.fetchval("SELECT COUNT(*) FROM machines")

            if count >= settings.max_machines:
                raise ValueError(
                    f"Maximum machine limit ({settings.max_machines}) reached. "
                    "Cannot register new machines."
                )

    async def upsert_machine(
        self, ip_address: str, machine_data: MachineCreate
    ) -> tuple[MachineInDB, bool]:
        """
        Insert or update a machine by IP address.

        Args:
            ip_address: Machine IP address (unique key)
            machine_data: Machine data to insert/update

        Returns:
            Tuple of (machine, is_new)
            - machine: Machine object from database
            - is_new: True if created, False if updated

        Raises:
            ValueError: If machine limit is reached (for new machines)
        """
        async with self.db_pool.acquire() as conn:
            # Check if machine already exists
            existing = await conn.fetchrow(
                "SELECT id FROM machines WHERE ip_address = $1", ip_address
            )

            if existing is None:
                # New machine - check limit
                await self.validate_machine_limit()

                # Insert new machine
                row = await conn.fetchrow(
                    """
                    INSERT INTO machines (hostname, ip_address, mac_address, extra_data)
                    VALUES ($1, $2, $3, $4)
                    RETURNING id, hostname, ip_address, mac_address, status,
                              last_seen, registered_at, updated_at, extra_data
                    """,
                    machine_data.hostname,
                    ip_address,
                    machine_data.mac_address,
                    machine_data.extra_data,
                )
                is_new = True
            else:
                # Update existing machine
                row = await conn.fetchrow(
                    """
                    UPDATE machines
                    SET hostname = $1,
                        mac_address = $2,
                        extra_data = $3,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE ip_address = $4
                    RETURNING id, hostname, ip_address, mac_address, status,
                              last_seen, registered_at, updated_at, extra_data
                    """,
                    machine_data.hostname,
                    machine_data.mac_address,
                    machine_data.extra_data,
                    ip_address,
                )
                is_new = False

            machine = MachineInDB(**dict(row))
            return machine, is_new

    async def get_all_machines(
        self,
        status: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[MachineResponse], int]:
        """
        Get all machines with optional filtering and pagination.

        Args:
            status: Filter by status ('active' or 'unreachable'), None for all
            limit: Maximum number of machines to return
            offset: Number of machines to skip

        Returns:
            Tuple of (machines list, total count)
        """
        async with self.db_pool.acquire() as conn:
            # Build query with optional status filter
            where_clause = "WHERE m.status = $1" if status else ""
            params = [status] if status else []

            # Get total count
            count_query = f"SELECT COUNT(*) FROM machines m {where_clause}"
            total = await conn.fetchval(count_query, *params)

            # Get machines with latest ping status
            query = f"""
                SELECT
                    m.id, m.hostname, m.ip_address, m.mac_address, m.status,
                    m.last_seen, m.registered_at, m.updated_at, m.extra_data,
                    ps.is_alive, ps.response_time
                FROM machines m
                LEFT JOIN LATERAL (
                    SELECT is_alive, response_time
                    FROM ping_status
                    WHERE machine_id = m.id
                    ORDER BY checked_at DESC
                    LIMIT 1
                ) ps ON true
                {where_clause}
                ORDER BY m.registered_at DESC
                LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
            """
            params.extend([limit, offset])

            rows = await conn.fetch(query, *params)

            machines = [MachineResponse(**dict(row)) for row in rows]
            return machines, total

    async def get_machine_by_id(self, machine_id: int) -> MachineResponse | None:
        """
        Get a machine by ID with latest ping status.

        Args:
            machine_id: Machine ID

        Returns:
            Machine object or None if not found
        """
        async with self.db_pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    m.id, m.hostname, m.ip_address, m.mac_address, m.status,
                    m.last_seen, m.registered_at, m.updated_at, m.extra_data,
                    ps.is_alive, ps.response_time
                FROM machines m
                LEFT JOIN LATERAL (
                    SELECT is_alive, response_time
                    FROM ping_status
                    WHERE machine_id = m.id
                    ORDER BY checked_at DESC
                    LIMIT 1
                ) ps ON true
                WHERE m.id = $1
                """,
                machine_id,
            )

            if row is None:
                return None

            return MachineResponse(**dict(row))

    async def delete_machine(self, machine_id: int) -> bool:
        """
        Delete a machine by ID.

        Args:
            machine_id: Machine ID to delete

        Returns:
            True if deleted, False if not found
        """
        async with self.db_pool.acquire() as conn:
            # Get machine info before deletion for logging
            machine = await conn.fetchrow(
                "SELECT * FROM machines WHERE id = $1", machine_id
            )

            if machine is None:
                return False

            # If machine is unreachable, log to failure_logs before deletion
            if machine["status"] == "unreachable":
                await conn.execute(
                    """
                    INSERT INTO failure_logs (machine_id, hostname, ip_address, mac_address)
                    VALUES ($1, $2, $3, $4)
                    """,
                    machine["id"],
                    machine["hostname"],
                    machine["ip_address"],
                    machine["mac_address"],
                )

            # Delete machine (ping_status will be cascade deleted)
            await conn.execute("DELETE FROM machines WHERE id = $1", machine_id)
            return True
