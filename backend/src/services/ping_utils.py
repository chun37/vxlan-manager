"""Ping utility functions using icmplib."""
import asyncio

from icmplib import async_ping
from icmplib.models import Host

from ..config import settings

# Global semaphore for controlling concurrent ping operations
PING_SEMAPHORE = asyncio.Semaphore(settings.max_parallel_pings)


async def ping_host(address: str, timeout: int | None = None) -> tuple[bool, float | None]:
    """
    Execute ICMP ping to a host.

    Args:
        address: IP address or hostname to ping
        timeout: Timeout in seconds (default: from settings)

    Returns:
        Tuple of (is_alive, response_time_ms)
        - is_alive: True if host responded, False otherwise
        - response_time_ms: Response time in milliseconds, None if failed
    """
    if timeout is None:
        timeout = settings.ping_timeout

    try:
        async with PING_SEMAPHORE:
            host: Host = await async_ping(
                address,
                count=1,
                timeout=timeout,
                privileged=True,  # Requires CAP_NET_RAW capability
            )

            if host.is_alive:
                # Convert RTT to milliseconds
                response_time = host.avg_rtt if host.avg_rtt is not None else None
                return True, response_time
            else:
                return False, None

    except Exception as e:
        # Log error and treat as down
        print(f"Error pinging {address}: {e}")
        return False, None
