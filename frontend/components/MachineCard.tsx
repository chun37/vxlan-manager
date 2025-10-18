'use client';

import type { Machine } from '@/types/machine';
import { formatDistanceToNow } from '@/lib/utils';

interface MachineCardProps {
  machines: Machine[];
  onDelete: (id: number, hostname: string) => void;
}

export function MachineCard({ machines, onDelete }: MachineCardProps) {
  if (machines.length === 0) {
    return (
      <div className="md:hidden bg-white rounded-lg shadow p-12 text-center">
        <svg
          className="mx-auto h-16 w-16 text-gray-400 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        <h5 className="text-lg font-medium text-gray-900 mb-2">
          マシンが登録されていません
        </h5>
        <p className="text-gray-600">
          VXLANネットワーク内のマシンから登録スクリプトを実行してください
        </p>
      </div>
    );
  }

  return (
    <div className="md:hidden space-y-4">
      {machines.map((machine) => (
        <div
          key={machine.id}
          data-machine-id={machine.id}
          className="bg-white rounded-lg shadow p-4"
        >
          <div className="flex justify-between items-start mb-3 pb-3 border-b border-gray-200">
            <h6 className="text-lg font-medium text-gray-900">
              {machine.hostname}
            </h6>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                machine.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full mr-1.5 ${
                  machine.status === 'active' ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              {machine.status === 'active' ? '接続中' : '接続不可'}
            </span>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex">
              <span className="w-28 font-medium text-gray-700">IPアドレス:</span>
              <span className="text-gray-600">{machine.ip_address}</span>
            </div>
            <div className="flex">
              <span className="w-28 font-medium text-gray-700">MACアドレス:</span>
              <span className="text-gray-600 font-mono">{machine.mac_address}</span>
            </div>
            <div className="flex">
              <span className="w-28 font-medium text-gray-700">応答時間:</span>
              <span className="text-gray-600">
                {machine.response_time !== null
                  ? `${machine.response_time.toFixed(2)} ms`
                  : '-'}
              </span>
            </div>
            <div className="flex">
              <span className="w-28 font-medium text-gray-700">最終確認:</span>
              <span className="text-gray-600">
                {formatDistanceToNow(machine.last_seen)}
              </span>
            </div>
          </div>

          {machine.status === 'unreachable' && (
            <button
              onClick={() => onDelete(machine.id, machine.hostname)}
              className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              削除
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
