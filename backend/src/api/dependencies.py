"""FastAPI dependencies for database connections."""
from asyncpg import Pool

from ..db import get_pool


async def get_db() -> Pool:
    """
    Dependency to get database connection pool.

    Returns:
        Database connection pool
    """
    return await get_pool()
