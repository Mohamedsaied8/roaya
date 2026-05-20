/**
 * RemoteControlChannel — WebRTC DataChannel for low-latency remote control events.
 *
 * A.5 hardening:
 *  - Permission gate: the guest must receive a `remote_control_grant` before
 *    any input events are sent or accepted. Host can revoke at any time.
 *  - Latency instrumentation: periodic PING frames measure RTT, exposed via
 *    `getLastRtt()` and `onRtt()`.
 *
 * Usage:
 *   const rc = new RemoteControlChannel()
 *   rc.openAsHost(peerConnection)    // host side
 *   rc.openAsGuest(peerConnection)   // guest side (receives ondatachannel)
 *   rc.grantControl()                // host → opens the gate
 *   rc.sendEvent({ type: 'mousemove', x, y })
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

type ControlFrame =
  | ({ kind: 'event' } & RemoteControlEvent)
  | { kind: 'grant' }
  | { kind: 'revoke' }
  | { kind: 'ping'; id: number; t: number }
  | { kind: 'pong'; id: number; t: number }

export class RemoteControlChannel {
  private channel: RTCDataChannel | null = null
  private eventHandlers: ((event: RemoteControlEvent) => void)[] = []
  private stateHandlers: ((open: boolean) => void)[] = []
  private rttHandlers: ((rttMs: number) => void)[] = []
  private granted = false
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private nextPingId = 1
  private lastRtt: number | null = null

  /** Host opens a named DataChannel on the PeerConnection */
  openAsHost(pc: RTCPeerConnection): void {
    this.channel = pc.createDataChannel('remote-control', {
      ordered: true,
      maxRetransmits: 0,
    })
    this.bindChannelEvents()
  }

  /** Guest listens for the host's DataChannel */
  openAsGuest(pc: RTCPeerConnection): void {
    pc.ondatachannel = (event) => {
      if (event.channel.label === 'remote-control') {
        this.channel = event.channel
        this.bindChannelEvents()
      }
    }
  }

  /** Host grants remote control to the current guest. */
  grantControl(): void {
    this.granted = true
    this.sendFrame({ kind: 'grant' })
  }

  /** Host revokes remote control; further input events are dropped on both sides. */
  revokeControl(): void {
    this.granted = false
    this.sendFrame({ kind: 'revoke' })
  }

  /** Whether input events are currently authorized on this channel. */
  isGranted(): boolean {
    return this.granted
  }

  /**
   * Send a remote control event through the DataChannel.
   * A.5: refused unless control has been granted.
   */
  sendEvent(event: Omit<RemoteControlEvent, 'timestamp'>): void {
    if (!this.channel || this.channel.readyState !== 'open') {
      console.warn('RemoteControlChannel: channel not open')
      return
    }
    if (!this.granted) {
      console.warn('RemoteControlChannel: control not granted')
      return
    }
    const payload: RemoteControlEvent = { ...event, timestamp: Date.now() }
    this.channel.send(JSON.stringify({ kind: 'event', ...payload }))
  }

  /** Register a handler for incoming remote control events */
  onEvent(handler: (event: RemoteControlEvent) => void): () => void {
    this.eventHandlers.push(handler)
    return () => {
      this.eventHandlers = this.eventHandlers.filter(h => h !== handler)
    }
  }

  /** Register a handler for channel open/close state changes */
  onStateChange(handler: (open: boolean) => void): () => void {
    this.stateHandlers.push(handler)
    return () => {
      this.stateHandlers = this.stateHandlers.filter(h => h !== handler)
    }
  }

  /** Register a handler invoked each time a PONG is received, reporting RTT in ms. */
  onRtt(handler: (rttMs: number) => void): () => void {
    this.rttHandlers.push(handler)
    return () => {
      this.rttHandlers = this.rttHandlers.filter(h => h !== handler)
    }
  }

  /** Last measured round-trip time, in ms, or null if no pong has been seen. */
  getLastRtt(): number | null {
    return this.lastRtt
  }

  isOpen(): boolean {
    return this.channel?.readyState === 'open'
  }

  close(): void {
    this.stopPingLoop()
    this.granted = false
    this.channel?.close()
    this.channel = null
  }

  private sendFrame(frame: ControlFrame): void {
    if (!this.channel || this.channel.readyState !== 'open') return
    try {
      this.channel.send(JSON.stringify(frame))
    } catch (err) {
      console.error('RemoteControlChannel: send failed', err)
    }
  }

  private startPingLoop(): void {
    this.stopPingLoop()
    this.pingTimer = setInterval(() => {
      if (!this.channel || this.channel.readyState !== 'open') return
      const id = this.nextPingId++
      this.sendFrame({ kind: 'ping', id, t: performance.now() })
    }, 1000)
  }

  private stopPingLoop(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private bindChannelEvents(): void {
    if (!this.channel) return

    this.channel.onopen = () => {
      console.log('RemoteControlChannel: opened')
      this.stateHandlers.forEach(h => h(true))
      this.startPingLoop()
    }

    this.channel.onclose = () => {
      console.log('RemoteControlChannel: closed')
      this.stateHandlers.forEach(h => h(false))
      this.stopPingLoop()
      this.granted = false
    }

    this.channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ControlFrame | RemoteControlEvent
        // Backward-compat: legacy events arrive without a `kind` field.
        const kind = (data as any).kind ?? 'event'
        switch (kind) {
          case 'event': {
            if (!this.granted) return // drop unauthorized input
            const ev = data as RemoteControlEvent
            this.eventHandlers.forEach(h => h(ev))
            break
          }
          case 'grant':
            this.granted = true
            break
          case 'revoke':
            this.granted = false
            break
          case 'ping': {
            const p = data as any
            this.sendFrame({ kind: 'pong', id: p.id, t: p.t })
            break
          }
          case 'pong': {
            const p = data as any
            const rtt = performance.now() - p.t
            this.lastRtt = rtt
            if (import.meta.env.DEV) {
              console.debug(`[RemoteControlChannel] RTT ${rtt.toFixed(1)}ms`)
            }
            this.rttHandlers.forEach(h => h(rtt))
            break
          }
        }
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
