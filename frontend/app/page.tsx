'use client';

import { useEffect } from 'react';
import { useMachines } from '@/hooks/useMachines';
import { useWebSocket } from '@/hooks/useWebSocket';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { StatusFilter } from '@/components/StatusFilter';
import { MachineList } from '@/components/MachineList';
import { MachineCard } from '@/components/MachineCard';
import type { WebSocketStatusUpdate } from '@/types/machine';

export default function Dashboard() {
  const {
    machines,
    isLoading,
    error,
    isConnected: wsConnected,
    statusFilter,
    setStatusFilter,
    deleteMachine,
    handleStatusUpdate,
  } = useMachines({
    autoRefreshInterval: 60000, // Refresh every 60 seconds as fallback
  });

  // Setup WebSocket subscription
  const { subscribe } = useWebSocket();

  useEffect(() => {
    // Subscribe to status updates
    const unsubscribe = subscribe<WebSocketStatusUpdate>(
      'status_update',
      handleStatusUpdate
    );

    return unsubscribe;
  }, [subscribe, handleStatusUpdate]);

  const handleDelete = async (id: number, hostname: string) => {
    if (
      !confirm(
        `マシン "${hostname}" を削除してもよろしいですか？\n\nこの操作は取り消せません。`
      )
    ) {
      return;
    }

    try {
      await deleteMachine(id);
    } catch (err) {
      alert(
        `削除エラー: ${err instanceof Error ? err.message : '不明なエラーが発生しました'}`
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Navbar */}
      <nav className="bg-gray-900 text-white shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold">VXLAN Machine Manager</h1>
            <ConnectionStatus isConnected={wsConnected} />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        {/* Header with Filter */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">マシン一覧</h2>
          <StatusFilter
            currentFilter={statusFilter}
            onFilterChange={setStatusFilter}
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  エラーが発生しました
                </h3>
                <p className="text-sm text-red-700 mt-1">{error.message}</p>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}

        {/* Machine List */}
        {!isLoading && (
          <>
            <MachineList machines={machines} onDelete={handleDelete} />
            <MachineCard machines={machines} onDelete={handleDelete} />
          </>
        )}

        {/* Machine Count */}
        {!isLoading && machines.length > 0 && (
          <div className="mt-4 text-sm text-gray-600">
            合計: {machines.length} 台のマシン
          </div>
        )}
      </div>
    </div>
  );
}
