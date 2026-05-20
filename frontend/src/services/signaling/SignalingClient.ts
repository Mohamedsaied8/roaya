import type { SignalingMessage, MessageType } from '../../types/signaling'

type MessageHandler = (message: SignalingMessage) => void

/**
 * WebSocket signaling client for real-time communication
 */
export class SignalingClient {
    private ws: WebSocket | null = null
    private url: string
    private reconnectAttempts = 0
    private maxReconnectAttempts = 5
    private reconnectDelay = 1000
    private messageHandlers: Map<MessageType, MessageHandler[]> = new Map()
    private connectionPromise: Promise<void> | null = null
    private pingInterval: number | null = null
    private pendingRequests: Map<string, { resolve: (val: any) => void, reject: (err: any) => void, timeout: number }> = new Map()

    constructor(url?: string) {
        if (url) {
            this.url = url
        } else {
            const isSecure = window.location.protocol === 'https:'
            const protocol = isSecure ? 'wss:' : 'ws:'
            const hostname = window.location.hostname || 'localhost'
            // In production/Docker, nginx proxies /ws → backend:8081.
            // Over HTTPS, connect through nginx to get WSS for free.
            // Over HTTP (localhost dev), connect directly to backend port 8081.
            if (isSecure) {
                this.url = `${protocol}//${hostname}:${window.location.port}/ws`
            } else {
                this.url = `${protocol}//${hostname}:8081`
            }
        }
    }

    /**
     * Connect to the WebSocket server
     */
    connect(): Promise<void> {
        if (this.connectionPromise) {
            return this.connectionPromise
        }

        this.connectionPromise = new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.url)

                this.ws.onopen = () => {
                    console.log('WebSocket connected')
                    this.reconnectAttempts = 0
                    this.startPing()
                    resolve()
                }

                this.ws.onclose = (event) => {
                    console.log('WebSocket closed:', event.code, event.reason)
                    this.stopPing()
                    this.connectionPromise = null
                    this.handleReconnect()
                }

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error)
                    reject(error)
                }

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data)
                }
            } catch (error) {
                reject(error)
            }
        })

        return this.connectionPromise
    }

    /**
     * Disconnect from the server
     */
    disconnect(): void {
        this.stopPing()
        if (this.ws) {
            this.ws.close(1000, 'Client disconnecting')
            this.ws = null
        }
        this.connectionPromise = null
        this.maxReconnectAttempts = 0 // Prevent reconnection
    }

    /**
     * Send a message to the server
     */
    send(type: MessageType, payload: Record<string, unknown> = {}, options: {
        roomId?: string
        targetId?: string
    } = {}): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not connected')
            return
        }

        const message: SignalingMessage = {
            type,
            roomId: options.roomId || '',
            senderId: '', // Will be set by server
            targetId: options.targetId,
            payload,
            timestamp: Date.now(),
        }

        this.ws.send(JSON.stringify(message))
    }
    /**
     * Send a request and wait for response
     */
    async request(type: MessageType, payload: Record<string, unknown> = {}, options: {
        roomId?: string
        targetId?: string
        timeout?: number
    } = {}): Promise<SignalingMessage> {
        const correlationId = Math.random().toString(36).substring(2, 15);
        const timeoutMs = options.timeout || 10000;

        return new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => {
                this.pendingRequests.delete(correlationId);
                reject(new Error(`Request timeout: ${type}`));
            }, timeoutMs);

            this.pendingRequests.set(correlationId, { resolve, reject, timeout: timer });

            this.send(type, { ...payload, correlationId }, options);
        });
    }

    /**
     * Register a handler for a specific message type
     */
    on(type: MessageType, handler: MessageHandler): () => void {
        if (!this.messageHandlers.has(type)) {
            this.messageHandlers.set(type, [])
        }
        this.messageHandlers.get(type)!.push(handler)

        // Return unsubscribe function
        return () => {
            const handlers = this.messageHandlers.get(type)
            if (handlers) {
                const index = handlers.indexOf(handler)
                if (index > -1) {
                    handlers.splice(index, 1)
                }
            }
        }
    }

    /**
     * Handle incoming message
     */
    private handleMessage(data: string): void {
        try {
            const message: SignalingMessage = JSON.parse(data)
            console.debug('Received message:', message.type, message)
            
            const handlers = this.messageHandlers.get(message.type)

            const correlationId = (message.payload as any)?.correlationId;
            if (correlationId && this.pendingRequests.has(correlationId)) {
                const { resolve, timeout } = this.pendingRequests.get(correlationId)!;
                window.clearTimeout(timeout);
                this.pendingRequests.delete(correlationId);
                resolve(message);
            }

            if (handlers) {
                handlers.forEach((handler) => handler(message))
            }

            if (message.type === 'error') {
                console.error('Signaling error:', message.payload.error)
            }
        } catch (error) {
            console.error('Failed to parse message:', error)
        }
    }

    /**
     * Handle reconnection logic
     */
    private handleReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached')
            return
        }

        this.reconnectAttempts++
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

        setTimeout(() => {
            this.connect().catch(console.error)
        }, delay)
    }

    /**
     * Start ping interval to keep connection alive
     */
    private startPing(): void {
        this.pingInterval = window.setInterval(() => {
            this.send('ping')
        }, 30000)
    }

    /**
     * Stop ping interval
     */
    private stopPing(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval)
            this.pingInterval = null
        }
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN
    }
}

// Singleton instance
export const signalingClient = new SignalingClient()
