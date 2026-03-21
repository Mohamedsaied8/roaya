/**
 * RemoteControlChannel — WebRTC DataChannel for low-latency remote control events.
 * 
 * Usage:
 *   const rc = new RemoteControlChannel()
 *   rc.openAsHost(peerConnection)    // host side
 *   rc.openAsGuest(peerConnection)   // guest side (receives ondatachannel)
 *   rc.sendEvent({ type: 'mousemove', x, y })
 *   rc.onEvent((e) => applyEvent(e))
 */

export interface RemoteControlEvent {
  type: 'mousemove' | 'mousedown' | 'mouseup' | 'keydown' | 'keyup' | 'scroll'
  x?: number
  y?: number
  button?: number
  key?: string
  deltaX?: number
  deltaY?: number
  timestamp: number
}

export class RemoteControlChannel {
  private channel: RTCDataChannel | null = null
  private eventHandlers: ((event: RemoteControlEvent) => void)[] = []
  private stateHandlers: ((open: boolean) => void)[] = []

  /**
   * Host opens a named DataChannel on the PeerConnection
   */
  openAsHost(pc: RTCPeerConnection): void {
    this.channel = pc.createDataChannel('remote-control', {
      ordered: true,
      maxRetransmits: 0,  // unreliable for low latency (mousemove doesn't need retransmit)
    })
    this.bindChannelEvents()
  }

  /**
   * Guest listens for the host's DataChannel
   */
  openAsGuest(pc: RTCPeerConnection): void {
    pc.ondatachannel = (event) => {
      if (event.channel.label === 'remote-control') {
        this.channel = event.channel
        this.bindChannelEvents()
      }
    }
  }

  /**
   * Send a remote control event through the DataChannel
   */
  sendEvent(event: Omit<RemoteControlEvent, 'timestamp'>): void {
    if (!this.channel || this.channel.readyState !== 'open') {
      console.warn('RemoteControlChannel: channel not open')
      return
    }
    const payload: RemoteControlEvent = { ...event, timestamp: Date.now() }
    this.channel.send(JSON.stringify(payload))
  }

  /**
   * Register a handler for incoming remote control events
   */
  onEvent(handler: (event: RemoteControlEvent) => void): () => void {
    this.eventHandlers.push(handler)
    return () => {
      this.eventHandlers = this.eventHandlers.filter(h => h !== handler)
    }
  }

  /**
   * Register a handler for channel open/close state changes
   */
  onStateChange(handler: (open: boolean) => void): () => void {
    this.stateHandlers.push(handler)
    return () => {
      this.stateHandlers = this.stateHandlers.filter(h => h !== handler)
    }
  }

  /**
   * Whether the channel is currently open and ready
   */
  isOpen(): boolean {
    return this.channel?.readyState === 'open'
  }

  /**
   * Close the DataChannel
   */
  close(): void {
    this.channel?.close()
    this.channel = null
  }

  private bindChannelEvents(): void {
    if (!this.channel) return

    this.channel.onopen = () => {
      console.log('RemoteControlChannel: opened')
      this.stateHandlers.forEach(h => h(true))
    }

    this.channel.onclose = () => {
      console.log('RemoteControlChannel: closed')
      this.stateHandlers.forEach(h => h(false))
    }

    this.channel.onmessage = (event) => {
      try {
        const data: RemoteControlEvent = JSON.parse(event.data)
        this.eventHandlers.forEach(h => h(data))
      } catch (err) {
        console.error('RemoteControlChannel: failed to parse event', err)
      }
    }

    this.channel.onerror = (err) => {
      console.error('RemoteControlChannel: error', err)
    }
  }
}

// Singleton for the current session
export const remoteControlChannel = new RemoteControlChannel()
