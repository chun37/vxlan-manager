"""Network-related validators for IP and MAC addresses."""
import ipaddress
import re


def validate_ip_address(ip: str) -> str:
    """
    Validate IP address format (IPv4 or IPv6).

    Args:
        ip: IP address string

    Returns:
        Validated IP address string

    Raises:
        ValueError: If IP address format is invalid
    """
    try:
        # Try to parse as IPv4 or IPv6
        ipaddress.ip_address(ip)
        return ip
    except ValueError as e:
        raise ValueError(f"Invalid IP address format: {ip}") from e


def validate_mac_address(mac: str) -> str:
    """
    Validate MAC address format.

    Accepts formats: 00:11:22:33:44:55, 00-11-22-33-44-55

    Args:
        mac: MAC address string

    Returns:
        Validated MAC address in lowercase with colon separator

    Raises:
        ValueError: If MAC address format is invalid
    """
    pattern = r"^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$"
    if not re.match(pattern, mac):
        raise ValueError(f"Invalid MAC address format: {mac}")

    # Normalize to lowercase with colon separator
    return mac.lower().replace("-", ":")
