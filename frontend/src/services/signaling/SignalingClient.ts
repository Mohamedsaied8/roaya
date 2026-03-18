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

    constructor(url: string = `ws://${window.location.hostname}:8081`) {
        this.url = url
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
