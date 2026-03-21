/**
 * Unit Tests — RemoteControlChannel (WebRTC DataChannel)
 * 
 * Tests:
 * - Host opens DataChannel on PeerConnection
 * - Guest receives DataChannel via ondatachannel
 * - sendEvent serializes and sends data correctly
 * - onEvent callback fires on incoming messages
 * - isOpen reports channel state correctly
 * - close() terminates the channel
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RemoteControlChannel } from '../../services/webrtc/RemoteControlChannel'

function createMockChannel(readyState: RTCDataChannelState = 'open') {
  return {
    readyState,
    label: 'remote-control',
    send: vi.fn(),
    close: vi.fn(),
    onopen: null as any,
    onclose: null as any,
    onmessage: null as any,
    onerror: null as any,
  }
}

function createMockPeerConnection() {
  const channel = createMockChannel()
  return {
    pc: {
      createDataChannel: vi.fn().mockReturnValue(channel),
      ondatachannel: null as any,
    } as unknown as RTCPeerConnection,
    channel,
  }
}

describe('RemoteControlChannel', () => {
  let rc: RemoteControlChannel

  beforeEach(() => {
    rc = new RemoteControlChannel()
  })

  // DC-1: Host should create a named DataChannel
  it('DC-1: openAsHost should create a "remote-control" DataChannel', () => {
    const { pc } = createMockPeerConnection()
    rc.openAsHost(pc)
    expect(pc.createDataChannel).toHaveBeenCalledWith(
      'remote-control',
      expect.objectContaining({ ordered: true })
    )
  })

  // DC-2: Guest should listen via ondatachannel
  it('DC-2: openAsGuest should assign ondatachannel handler to PeerConnection', () => {
    const { pc } = createMockPeerConnection()
    rc.openAsGuest(pc)
    expect(pc.ondatachannel).toBeTypeOf('function')
  })

  // DC-3: Guest should pick up the correct channel label
  it('DC-3: guest should only bind to "remote-control" channel', () => {
    const { pc } = createMockPeerConnection()
    rc.openAsGuest(pc)

    const wrongChannel = { ...createMockChannel(), label: 'chat' }
    const rightChannel = { ...createMockChannel(), label: 'remote-control' }

    ;(pc as any).ondatachannel({ channel: wrongChannel })
    expect(rc.isOpen()).toBe(false)

    ;(pc as any).ondatachannel({ channel: rightChannel })
    // channel not open yet (readyState='open' but onopen not fired)
    // just check it was accepted (no throws)
  })

  // DC-4: sendEvent should send JSON-serialized data
  it('DC-4: sendEvent should send JSON through the DataChannel', () => {
    const { pc, channel } = createMockPeerConnection()
    rc.openAsHost(pc)
    // Simulate channel open
    channel.onopen()

    rc.sendEvent({ type: 'mousemove', x: 100, y: 200 })

    expect(channel.send).toHaveBeenCalledOnce()
    const sent = JSON.parse((channel.send as any).mock.calls[0][0])
    expect(sent.type).toBe('mousemove')
    expect(sent.x).toBe(100)
    expect(sent.y).toBe(200)
    expect(sent.timestamp).toBeTypeOf('number')
  })

  // DC-5: sendEvent should warn when channel is not open
  it('DC-5: sendEvent should warn and not throw when channel is closed', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    rc.sendEvent({ type: 'keydown', key: 'Enter' })
    expect(consoleSpy).toHaveBeenCalledWith('RemoteControlChannel: channel not open')
    consoleSpy.mockRestore()
  })

  // DC-6: onEvent handler should receive parsed events
  it('DC-6: onEvent handler should fire with parsed RemoteControlEvent', () => {
    const { pc, channel } = createMockPeerConnection()
    rc.openAsHost(pc)
    channel.onopen()

    const handler = vi.fn()
    rc.onEvent(handler)

    const event = { type: 'mousedown', x: 50, y: 75, button: 0, timestamp: Date.now() }
    channel.onmessage({ data: JSON.stringify(event) })

    expect(handler).toHaveBeenCalledOnce()
    expect(handler.mock.calls[0][0]).toMatchObject({
      type: 'mousedown',
      x: 50,
      y: 75,
    })
  })

  // DC-7: onEvent unsubscribe should stop further calls
  it('DC-7: unsubscribing from onEvent should stop receiving events', () => {
    const { pc, channel } = createMockPeerConnection()
    rc.openAsHost(pc)
    channel.onopen()

    const handler = vi.fn()
    const unsub = rc.onEvent(handler)

    const event = { type: 'scroll', deltaX: 0, deltaY: -100, timestamp: Date.now() }
    channel.onmessage({ data: JSON.stringify(event) })
    expect(handler).toHaveBeenCalledOnce()

    unsub()
    channel.onmessage({ data: JSON.stringify(event) })
    expect(handler).toHaveBeenCalledOnce() // no second call
  })

  // DC-8: onStateChange should fire on open/close
  it('DC-8: onStateChange should fire true on open and false on close', () => {
    const { pc, channel } = createMockPeerConnection()
    rc.openAsHost(pc)

    const stateHandler = vi.fn()
    rc.onStateChange(stateHandler)

    channel.onopen()
    expect(stateHandler).toHaveBeenCalledWith(true)

    channel.onclose()
    expect(stateHandler).toHaveBeenCalledWith(false)
    expect(stateHandler).toHaveBeenCalledTimes(2)
  })

  // DC-9: isOpen should return correct state
  it('DC-9: isOpen should return true only when channel readyState is "open"', () => {
    const { pc, channel } = createMockPeerConnection()
    rc.openAsHost(pc)

    // Before onopen fires, readyState might be 'open' in our mock
    expect(rc.isOpen()).toBe(true) // our mock returns readyState='open'
  })

  // DC-10: close should call channel.close
  it('DC-10: close() should close the DataChannel', () => {
    const { pc, channel } = createMockPeerConnection()
    rc.openAsHost(pc)

    rc.close()
    expect(channel.close).toHaveBeenCalledOnce()
  })

  // DC-11: keyboard event should carry key field
  it('DC-11: keydown event should include key field', () => {
    const { pc, channel } = createMockPeerConnection()
    rc.openAsHost(pc)
    channel.onopen()

    rc.sendEvent({ type: 'keydown', key: 'ArrowLeft' })
    const sent = JSON.parse((channel.send as any).mock.calls[0][0])
    expect(sent.key).toBe('ArrowLeft')
  })

  // DC-12: invalid JSON should not crash onmessage
  it('DC-12: malformed JSON in onmessage should not throw (just log error)', () => {
    const { pc, channel } = createMockPeerConnection()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    rc.openAsHost(pc)
    channel.onopen()

    expect(() => {
      channel.onmessage({ data: '{not-valid-json' })
    }).not.toThrow()

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
