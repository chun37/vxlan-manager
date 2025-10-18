'use client';

import type { MachineStatus } from '@/types/machine';

interface StatusFilterProps {
  currentFilter?: MachineStatus;
  onFilterChange: (filter?: MachineStatus) => void;
}

export function StatusFilter({
  currentFilter,
  onFilterChange,
}: StatusFilterProps) {
  const filters: { label: string; value?: MachineStatus; color: string }[] = [
    { label: 'すべて', value: undefined, color: 'blue' },
    { label: '接続中', value: 'active', color: 'green' },
    { label: '接続不可', value: 'unreachable', color: 'red' },
  ];

  return (
    <div className="inline-flex rounded-lg border border-gray-300 bg-white">
      {filters.map((filter) => (
        <button
          key={filter.label}
          onClick={() => onFilterChange(filter.value)}
          className={`px-4 py-2 text-sm font-medium transition-colors first:rounded-l-lg last:rounded-r-lg ${
            currentFilter === filter.value
              ? filter.color === 'blue'
                ? 'bg-blue-500 text-white'
                : filter.color === 'green'
                  ? 'bg-green-500 text-white'
                  : 'bg-red-500 text-white'
              : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
