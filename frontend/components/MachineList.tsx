'use client';

import type { Machine } from '@/types/machine';
import { formatDistanceToNow } from '@/lib/utils';

interface MachineListProps {
  machines: Machine[];
  onDelete: (id: number, hostname: string) => void;
}

export function MachineList({ machines, onDelete }: MachineListProps) {
  if (machines.length === 0) {
    return (
      <div className="hidden md:block bg-white rounded-lg shadow p-12 text-center">
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
    <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              ステータス
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              ホスト名
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              IPアドレス
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              MACアドレス
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              応答時間
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              最終確認
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              操作
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {machines.map((machine) => (
            <tr
              key={machine.id}
              data-machine-id={machine.id}
              className="hover:bg-gray-50 transition-colors"
            >
              <td className="px-6 py-4 whitespace-nowrap">
                <span className="inline-flex items-center">
                  <span
                    className={`w-3 h-3 rounded-full mr-2 ${
                      machine.status === 'active'
                        ? 'bg-green-500'
                        : 'bg-red-500 opacity-60'
                    }`}
                  />
                  <span
                    className={`text-sm font-medium ${
                      machine.status === 'active'
                        ? 'text-green-800'
                        : 'text-red-800'
                    }`}
                  >
                    {machine.status === 'active' ? '接続中' : '接続不可'}
                  </span>
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {machine.hostname}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                {machine.ip_address}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">
                {machine.mac_address}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                {machine.response_time !== null
                  ? `${machine.response_time.toFixed(2)} ms`
                  : '-'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                {formatDistanceToNow(machine.last_seen)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                {machine.status === 'unreachable' && (
                  <button
                    onClick={() => onDelete(machine.id, machine.hostname)}
                    className="text-red-600 hover:text-red-900 font-medium"
                  >
                    削除
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
