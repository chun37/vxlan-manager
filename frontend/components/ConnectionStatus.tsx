'use client';

interface ConnectionStatusProps {
  isConnected: boolean;
}

export function ConnectionStatus({ isConnected }: ConnectionStatusProps) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
          isConnected
            ? 'bg-green-100 text-green-800'
            : 'bg-red-100 text-red-800'
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full mr-2 ${
            isConnected ? 'bg-green-500' : 'bg-red-500'
          }`}
        />
        {isConnected ? '接続中' : '切断'}
      </span>
    </span>
  );
}
