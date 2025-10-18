'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  Machine,
  MachineStatus,
  WebSocketStatusUpdate,
} from '@/types/machine';
import { getMachines, deleteMachine as apiDeleteMachine } from '@/lib/api';
import { useWebSocket } from './useWebSocket';

interface UseMachinesOptions {
  autoRefreshInterval?: number; // in milliseconds
}

/**
 * Custom hook for managing machines data
 */
export function useMachines(options: UseMachinesOptions = {}) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [statusFilter, setStatusFilter] = useState<MachineStatus | undefined>(
    undefined
  );

  /**
   * Load machines from API
   */
  const loadMachines = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await getMachines(statusFilter);
      setMachines(response.machines);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load machines'));
      console.error('Failed to load machines:', err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  /**
   * Delete a machine
   */
  const deleteMachine = useCallback(async (id: number) => {
    try {
      await apiDeleteMachine(id);
      setMachines((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error('Failed to delete machine:', err);
      throw err;
    }
  }, []);

  /**
   * Update machine in the list
   */
  const updateMachine = useCallback((updatedMachine: Partial<Machine> & { id: number }) => {
    setMachines((prev) =>
      prev.map((m) =>
        m.id === updatedMachine.id ? { ...m, ...updatedMachine } : m
      )
    );
  }, []);

  /**
   * Handle WebSocket status update
   */
  const handleStatusUpdate = useCallback(
    (data: WebSocketStatusUpdate) => {
      updateMachine({
        id: data.machine_id,
        status: data.status,
        is_alive: data.is_alive,
        response_time: data.response_time,
        last_seen: data.last_seen,
      });
    },
    [updateMachine]
  );

  // Setup WebSocket connection
  const { isConnected } = useWebSocket({
    onOpen: () => {
      console.log('WebSocket connected');
    },
    onClose: () => {
      console.log('WebSocket disconnected');
    },
  });

  // Subscribe to status updates
  useEffect(() => {
    if (!isConnected) return;

    // We'll handle subscription in the component that uses this hook
    // to avoid duplicate subscriptions
  }, [isConnected]);

  // Load machines on mount and when filter changes
  useEffect(() => {
    loadMachines();
  }, [loadMachines]);

  // Auto-refresh if interval is set
  useEffect(() => {
    if (!options.autoRefreshInterval) return;

    const interval = setInterval(() => {
      loadMachines();
    }, options.autoRefreshInterval);

    return () => clearInterval(interval);
  }, [loadMachines, options.autoRefreshInterval]);

  return {
    machines,
    isLoading,
    error,
    isConnected,
    statusFilter,
    setStatusFilter,
    loadMachines,
    deleteMachine,
    updateMachine,
    handleStatusUpdate,
  };
}
