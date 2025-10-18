"""Machine management API endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from asyncpg import Pool

from ...api import get_db
from ...models import MachineCreate, MachineResponse
from ...services.machine_service import MachineService

router = APIRouter()


@router.put(
    "/machines/{ip_address}",
    response_model=MachineResponse,
    status_code=status.HTTP_200_OK,
    responses={
        200: {"description": "Machine updated successfully"},
        201: {"description": "Machine created successfully"},
        400: {"description": "Invalid request data"},
        503: {"description": "Machine limit reached"},
    },
)
async def upsert_machine(
    ip_address: str = Path(..., description="Machine IP address"),
    machine_data: MachineCreate = ...,
    db: Pool = Depends(get_db),
):
    """
    Register or update a machine.

    - **ip_address**: Unique IP address of the machine
    - **hostname**: Machine hostname
    - **mac_address**: Machine MAC address
    - **extra_data**: Optional additional data in JSON format

    Returns 201 for new machines, 200 for updates.
    """
    # Validate IP address matches path parameter
    if machine_data.ip_address != ip_address:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="IP address in body must match path parameter",
        )

    service = MachineService(db)

    try:
        machine, is_new = await service.upsert_machine(ip_address, machine_data)

        # Start monitoring for new machines
        if is_new:
            from ...services import monitor_service

            if monitor_service.monitor_manager:
                await monitor_service.monitor_manager.start_monitoring(
                    machine.id, machine.ip_address
                )

        # Return appropriate status code
        response_status = status.HTTP_201_CREATED if is_new else status.HTTP_200_OK

        # Convert to response model
        response = MachineResponse(**machine.dict())

        # FastAPI doesn't allow changing status code in response model
        # So we use a workaround with JSONResponse
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=response_status,
            content=response.dict(mode="json"),
        )

    except ValueError as e:
        # Machine limit reached
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        )


@router.get(
    "/machines",
    response_model=dict,
    responses={
        200: {"description": "Machine list retrieved successfully"},
        400: {"description": "Invalid query parameters"},
    },
)
async def list_machines(
    status_filter: str | None = Query(
        None, alias="status", description="Filter by status (active/unreachable)"
    ),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    db: Pool = Depends(get_db),
):
    """
    Get list of all machines.

    - **status**: Optional filter by status ('active' or 'unreachable')
    - **limit**: Maximum number of results (default: 100, max: 1000)
    - **offset**: Number of results to skip for pagination (default: 0)

    Returns paginated list of machines with total count.
    """
    # Validate status filter
    if status_filter and status_filter not in ["active", "unreachable"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be 'active' or 'unreachable'",
        )

    service = MachineService(db)
    machines, total = await service.get_all_machines(status_filter, limit, offset)

    return {
        "machines": [m.dict(mode="json") for m in machines],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.delete(
    "/machines/{machine_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        204: {"description": "Machine deleted successfully"},
        404: {"description": "Machine not found"},
    },
)
async def delete_machine(
    machine_id: int = Path(..., description="Machine ID to delete"),
    db: Pool = Depends(get_db),
):
    """
    Delete a machine by ID.

    - **machine_id**: ID of the machine to delete

    Before deletion, if the machine is unreachable, its information is logged
    to failure_logs for audit purposes.
    """
    service = MachineService(db)
    deleted = await service.delete_machine(machine_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with ID {machine_id} not found",
        )

    # Stop monitoring for deleted machine
    from ...services import monitor_service

    if monitor_service.monitor_manager:
        await monitor_service.monitor_manager.stop_monitoring(machine_id)

    return None
