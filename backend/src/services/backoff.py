"""Exponential backoff calculation for ping monitoring."""
from ..config import settings


def calculate_backoff(failure_count: int) -> int:
    """
    Calculate exponential backoff interval for ping retries.

    Schedule:
    - 0 failures: 60s
    - 1 failure:  60s (2^0 * 60)
    - 2 failures: 120s (2^1 * 60)
    - 3 failures: 240s (2^2 * 60)
    - 4 failures: 480s (2^3 * 60)
    - 5 failures: 960s (2^4 * 60)
    - 6+ failures: 3600s (max)

    Args:
        failure_count: Number of consecutive failures

    Returns:
        Next check interval in seconds
    """
    if failure_count == 0:
        return settings.min_check_interval

    interval = settings.min_check_interval * (2 ** (failure_count - 1))
    return min(interval, settings.max_check_interval)
