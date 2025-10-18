/**
 * Machine status type
 */
export type MachineStatus = 'active' | 'unreachable';

/**
 * Machine entity
 */
export interface Machine {
  id: number;
  hostname: string;
  ip_address: string;
  mac_address: string;
  status: MachineStatus;
  is_alive: boolean;
  response_time: number | null;
  last_seen: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

/**
 * Ping status entity
 */
export interface PingStatus {
  id: number;
  machine_id: number;
  is_alive: boolean;
  response_time: number | null;
  checked_at: string;
  consecutive_failures: number;
  next_check_interval: number;
}

/**
 * Failure log entity
 */
export interface FailureLog {
  id: number;
  machine_id: number;
  hostname: string;
  ip_address: string;
  mac_address: string;
  detected_at: string;
}

/**
 * API response for machine list
 */
export interface GetMachinesResponse {
  machines: Machine[];
  total: number;
  status_filter?: MachineStatus;
}

/**
 * API request for machine upsert
 */
export interface UpsertMachineRequest {
  hostname: string;
  mac_address: string;
  metadata?: Record<string, unknown>;
}

/**
 * WebSocket message types
 */
export type WebSocketMessageType = 'status_update' | 'machine_registered' | 'machine_deleted';

/**
 * WebSocket status update message
 */
export interface WebSocketStatusUpdate {
  type: 'status_update';
  machine_id: number;
  status: MachineStatus;
  is_alive: boolean;
  response_time: number | null;
  last_seen: string;
}

/**
 * WebSocket machine registered message
 */
export interface WebSocketMachineRegistered {
  type: 'machine_registered';
  machine: Machine;
}

/**
 * WebSocket machine deleted message
 */
export interface WebSocketMachineDeleted {
  type: 'machine_deleted';
  machine_id: number;
}

/**
 * Union type for all WebSocket messages
 */
export type WebSocketMessage =
  | WebSocketStatusUpdate
  | WebSocketMachineRegistered
  | WebSocketMachineDeleted;
