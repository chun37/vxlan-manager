"""Database connection pool management."""
import asyncio
import logging

import asyncpg
from asyncpg import Pool

from ..config import settings

logger = logging.getLogger(__name__)

# Global connection pool
_pool: Pool | None = None


async def get_pool() -> Pool:
    """
    Get or create database connection pool.

    Implements retry logic to handle cases where the database
    is not immediately available (e.g., during container startup).
    """
    global _pool
    if _pool is None:
        # Extract connection parameters from DATABASE_URL
        # Format: postgresql+asyncpg://user:password@host:port/database
        url = settings.database_url.replace("+asyncpg", "")

        # Retry configuration
        max_retries = 5
        retry_delay = 2  # seconds

        for attempt in range(max_retries):
            try:
                _pool = await asyncpg.create_pool(
                    url,
                    min_size=10,
                    max_size=50,
                    command_timeout=60,
                    max_inactive_connection_lifetime=300,
                )
                logger.info("Database connection pool created successfully")
                break
            except (ConnectionRefusedError, OSError, asyncpg.PostgresError) as e:
                if attempt < max_retries - 1:
                    logger.warning(
                        f"Database connection attempt {attempt + 1}/{max_retries} failed: {e}. "
                        f"Retrying in {retry_delay} seconds..."
                    )
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                else:
                    logger.error(f"Failed to connect to database after {max_retries} attempts")
                    raise
    return _pool


async def close_pool() -> None:
    """Close database connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
