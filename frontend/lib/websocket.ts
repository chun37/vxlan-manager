import type { WebSocketMessage, WebSocketMessageType } from '@/types/machine';

/**
 * WebSocket URL from environment variable or default to localhost
 */
const getWebSocketURL = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = window.location.origin.includes('localhost')
    ? process.env.NEXT_PUBLIC_WS_URL?.replace(/^wss?:\/\//, '') || 'localhost:8000'
    : window.location.host;

  return `${wsProtocol}//${wsHost}/ws/status`;
};

type EventHandler<T = unknown> = (data: T) => void;

interface WebSocketClientOptions {
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
}

/**
 * WebSocket client with auto-reconnect functionality
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectDelay: number;
  private maxReconnectDelay: number;
  private currentReconnectDelay: number;
  private reconnectAttempts = 0;
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private isIntentionallyClosed = false;
  private reconnectTimeout?: NodeJS.Timeout;
  private onOpenCallback?: () => void;
  private onCloseCallback?: () => void;
  private onErrorCallback?: (error: Event) => void;

  constructor(url: string, options: WebSocketClientOptions = {}) {
    this.url = url;
    this.reconnectDelay = options.reconnectDelay || 3000;
    this.maxReconnectDelay = options.maxReconnectDelay || 30000;
    this.currentReconnectDelay = this.reconnectDelay;
    this.onOpenCallback = options.onOpen;
    this.onCloseCallback = options.onClose;
    this.onErrorCallback = options.onError;
  }

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      console.log('WebSocket already connected or connecting');
      return;
    }

    console.log('Connecting to WebSocket:', this.url);
    this.isIntentionallyClosed = false;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.currentReconnectDelay = this.reconnectDelay;
        this.reconnectAttempts = 0;
        this.emit('open', undefined);
        this.onOpenCallback?.();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketMessage;
          this.emit('message', data);

          // Emit specific event type if available
          if (data.type) {
            this.emit(data.type, data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', error);
        this.onErrorCallback?.(error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket closed');
        this.emit('close', undefined);
        this.onCloseCallback?.();

        if (!this.isIntentionallyClosed) {
          this.reconnect();
        }
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this.reconnect();
    }
  }

  /**
   * Reconnect to WebSocket with exponential backoff
   */
  private reconnect(): void {
    if (this.isIntentionallyClosed) {
      return;
    }

    this.reconnectAttempts++;
    console.log(
      `Reconnecting in ${this.currentReconnectDelay}ms (attempt ${this.reconnectAttempts})...`
    );

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.currentReconnectDelay);

    // Exponential backoff
    this.currentReconnectDelay = Math.min(
      this.currentReconnectDelay * 2,
      this.maxReconnectDelay
    );
  }

  /**
   * Close WebSocket connection
   */
  close(): void {
    this.isIntentionallyClosed = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Register event handler
   */
  on<T = unknown>(event: string, handler: EventHandler<T>): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler as EventHandler);
  }

  /**
   * Remove event handler
   */
  off<T = unknown>(event: string, handler: EventHandler<T>): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      this.eventHandlers.set(
        event,
        handlers.filter((h) => h !== handler)
      );
    }
  }

  /**
   * Emit event to registered handlers
   */
  private emit<T = unknown>(event: string, data: T): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in ${event} handler:`, error);
        }
      });
    }
  }

  /**
   * Get current connection state
   */
  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  /**
   * Check if WebSocket is connected
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * Create a WebSocket client instance
 */
export function createWebSocketClient(
  options?: WebSocketClientOptions
): WebSocketClient {
  const url = getWebSocketURL();
  return new WebSocketClient(url, options);
}
