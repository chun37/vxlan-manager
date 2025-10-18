/**
 * WebSocket client utility with auto-reconnect
 */

const WS_URL = window.location.origin.includes('localhost')
    ? 'ws://localhost:8000/ws/status'
    : `ws://${window.location.host}/ws/status`;

class WebSocketClient {
    constructor(url, options = {}) {
        this.url = url;
        this.ws = null;
        this.reconnectDelay = options.reconnectDelay || 3000;
        this.maxReconnectDelay = options.maxReconnectDelay || 30000;
        this.currentReconnectDelay = this.reconnectDelay;
        this.reconnectAttempts = 0;
        this.eventHandlers = {};
        this.isIntentionallyClosed = false;
    }

    /**
     * Connect to WebSocket server
     */
    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
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
                this.emit('open');
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
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
            };

            this.ws.onclose = () => {
                console.log('WebSocket closed');
                this.emit('close');

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
    reconnect() {
        if (this.isIntentionallyClosed) {
            return;
        }

        this.reconnectAttempts++;
        console.log(`Reconnecting in ${this.currentReconnectDelay}ms (attempt ${this.reconnectAttempts})...`);

        setTimeout(() => {
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
    close() {
        this.isIntentionallyClosed = true;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    /**
     * Register event handler
     * @param {string} event - Event name
     * @param {Function} handler - Event handler function
     */
    on(event, handler) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
    }

    /**
     * Remove event handler
     * @param {string} event - Event name
     * @param {Function} handler - Event handler function
     */
    off(event, handler) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
        }
    }

    /**
     * Emit event to registered handlers
     * @param {string} event - Event name
     * @param {any} data - Event data
     */
    emit(event, data) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in ${event} handler:`, error);
                }
            });
        }
    }
}

// Create global WebSocket client instance
export const wsClient = new WebSocketClient(WS_URL);

export default wsClient;
