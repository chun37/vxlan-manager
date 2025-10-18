'use client';

import { useEffect, useRef, useState } from 'react';
import { createWebSocketClient, WebSocketClient } from '@/lib/websocket';
import type { WebSocketMessage } from '@/types/machine';

interface UseWebSocketOptions {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  onMessage?: (message: WebSocketMessage) => void;
}

/**
 * Custom hook for WebSocket connection
 */
export function useWebSocket(options: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const clientRef = useRef<WebSocketClient | null>(null);

  useEffect(() => {
    // Create WebSocket client
    const client = createWebSocketClient({
      onOpen: () => {
        setIsConnected(true);
        options.onOpen?.();
      },
      onClose: () => {
        setIsConnected(false);
        options.onClose?.();
      },
      onError: options.onError,
    });

    clientRef.current = client;

    // Register message handler if provided
    if (options.onMessage) {
      client.on('message', options.onMessage);
    }

    // Connect to WebSocket
    client.connect();

    // Cleanup on unmount
    return () => {
      if (options.onMessage) {
        client.off('message', options.onMessage);
      }
      client.close();
    };
  }, []); // Empty dependency array - connect once on mount

  /**
   * Subscribe to specific WebSocket event
   */
  const subscribe = <T = unknown>(
    event: string,
    handler: (data: T) => void
  ) => {
    clientRef.current?.on(event, handler);

    return () => {
      clientRef.current?.off(event, handler);
    };
  };

  return {
    isConnected,
    subscribe,
    client: clientRef.current,
  };
}
