"""FastAPI application entry point."""
import logging

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from .api import (
    RateLimitMiddleware,
    general_exception_handler,
    http_exception_handler,
    setup_cors,
)
from .config import settings
from .db import close_pool, get_pool

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

logger = logging.getLogger(__name__)

# Create FastAPI application
app = FastAPI(
    title="VXLAN Machine Manager API",
    description="API for managing and monitoring VXLAN network machines",
    version="1.0.0",
)

# Setup CORS
setup_cors(app)

# Add rate limiting middleware
app.add_middleware(RateLimitMiddleware, requests_per_minute=120)

# Add exception handlers
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)


@app.on_event("startup")
async def startup_event():
    """Initialize application on startup."""
    logger.info("Starting VXLAN Machine Manager API...")

    # Initialize database connection pool
    pool = await get_pool()
    logger.info("Database connection pool initialized")

    # Initialize machine monitoring manager
    from .services import monitor_service

    monitor_service.monitor_manager = monitor_service.MachineMonitorManager(pool)
    logger.info("Machine monitor manager initialized")

    # Load all machines from database and start monitoring
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, ip_address FROM machines")
        for row in rows:
            await monitor_service.monitor_manager.start_monitoring(
                row["id"], str(row["ip_address"])  # Convert IPv4Address to string
            )

    logger.info(f"Started monitoring {len(rows)} machines")
    logger.info("Application startup complete")


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources on shutdown."""
    logger.info("Shutting down VXLAN Machine Manager API...")

    # Stop all monitoring tasks
    from .services import monitor_service

    if monitor_service.monitor_manager:
        await monitor_service.monitor_manager.shutdown()
        logger.info("All monitoring tasks stopped")

    # Close database connection pool
    await close_pool()
    logger.info("Database connection pool closed")

    logger.info("Application shutdown complete")


@app.get("/health")
async def health_check():
    """
    Health check endpoint.

    Returns:
        Health status information
    """
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")

        return JSONResponse(
            status_code=200,
            content={
                "status": "healthy",
                "database": "connected",
            },
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "database": "disconnected",
                "error": str(e),
            },
        )


# Include API routers
from .api.endpoints import machines, websocket

app.include_router(machines.router, prefix="/api", tags=["machines"])
app.include_router(websocket.router, tags=["websocket"])
