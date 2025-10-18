"""Database connection pool management."""
import asyncpg
from asyncpg import Pool

from ..config import settings

# Global connection pool
_pool: Pool | None = None


async def get_pool() -> Pool:
    """Get or create database connection pool."""
    global _pool
    if _pool is None:
        # Extract connection parameters from DATABASE_URL
        # Format: postgresql+asyncpg://user:password@host:port/database
        url = settings.database_url.replace("+asyncpg", "")

        _pool = await asyncpg.create_pool(
            url,
            min_size=10,
            max_size=50,
            command_timeout=60,
            max_inactive_connection_lifetime=300,
        )
    return _pool


async def close_pool() -> None:
    """Close database connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
