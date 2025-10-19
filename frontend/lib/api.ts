import type {
  GetMachinesResponse,
  Machine,
  MachineStatus,
  UpsertMachineRequest,
} from '@/types/machine';

/**
 * API base URL from environment variable or default to localhost
 */
const API_BASE_URL =
  typeof window !== 'undefined'
    ? window.location.origin.includes('localhost')
      ? process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      : window.location.origin
    : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * API error class
 */
export class APIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Fetch wrapper with error handling
 */
async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const defaultOptions: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const mergedOptions: RequestInit = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...(options.headers || {}),
    },
  };

  try {
    const response = await fetch(url, mergedOptions);

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = await response.text();
      }

      const errorMessage =
        typeof errorData === 'object' && errorData !== null && 'message' in errorData
          ? String(errorData.message)
          : `HTTP ${response.status}: ${response.statusText}`;

      throw new APIError(errorMessage, response.status, errorData);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null as T;
    }

    return await response.json();
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }

    console.error(`API Error (${endpoint}):`, error);
    throw new APIError(
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

/**
 * Get all machines with optional status filter
 */
export async function getMachines(
  status?: MachineStatus
): Promise<GetMachinesResponse> {
  const params = new URLSearchParams();
  if (status) {
    params.set('status', status);
  }

  const endpoint = `/api/machines${params.toString() ? `?${params.toString()}` : ''}`;
  return fetchAPI<GetMachinesResponse>(endpoint);
}

/**
 * Get a single machine by ID
 */
export async function getMachine(id: number): Promise<Machine> {
  return fetchAPI<Machine>(`/api/machines/${id}`);
}

/**
 * Register or update a machine
 */
export async function upsertMachine(
  ipAddress: string,
  data: UpsertMachineRequest
): Promise<Machine> {
  return fetchAPI<Machine>(`/api/machines/${ipAddress}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * Delete a machine by ID
 */
export async function deleteMachine(id: number): Promise<void> {
  return fetchAPI<void>(`/api/machines/${id}`, {
    method: 'DELETE',
  });
}
