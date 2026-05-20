import { useCallback, useReducer } from 'react'

/**
 * WebRTC connection lifecycle FSM (Architecture §4).
 * Hand-rolled reducer — same semantics as an XState machine but with zero deps.
 *
 *   IDLE → SIGNALING → CONNECTING → CONNECTED
 *     ↑                              ↓
 *     └──────── RECONNECTING ────────┘
 *
 * Illegal transitions are dropped with a console.warn so bugs are visible
 * in dev but never crash a live meeting.
 */
export type ConnectionState =
  | 'IDLE'
  | 'SIGNALING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'FAILED'

export type ConnectionEvent =
  | { type: 'START_SIGNALING' }
  | { type: 'SIGNALING_READY' }
  | { type: 'CONNECTED' }
  | { type: 'DISCONNECTED' }
  | { type: 'RECONNECT' }
  | { type: 'FAIL' }
  | { type: 'RESET' }

// Allowed next states keyed by current state.
const TRANSITIONS: Record<ConnectionState, Partial<Record<ConnectionEvent['type'], ConnectionState>>> = {
  IDLE:          { START_SIGNALING: 'SIGNALING', RESET: 'IDLE' },
  SIGNALING:     { SIGNALING_READY: 'CONNECTING', FAIL: 'FAILED', RESET: 'IDLE' },
  CONNECTING:    { CONNECTED: 'CONNECTED', DISCONNECTED: 'RECONNECTING', FAIL: 'FAILED', RESET: 'IDLE' },
  CONNECTED:     { DISCONNECTED: 'RECONNECTING', FAIL: 'FAILED', RESET: 'IDLE' },
  RECONNECTING:  { CONNECTED: 'CONNECTED', RECONNECT: 'RECONNECTING', FAIL: 'FAILED', RESET: 'IDLE' },
  FAILED:        { RESET: 'IDLE' },
}

function reducer(state: ConnectionState, event: ConnectionEvent): ConnectionState {
  const next = TRANSITIONS[state]?.[event.type]
  if (!next) {
    if (import.meta.env.DEV) {
      console.warn(`[useConnectionFSM] illegal transition: ${state} -× ${event.type}`)
    }
    return state
  }
  return next
}

export function useConnectionFSM(initial: ConnectionState = 'IDLE') {
  const [state, dispatch] = useReducer(reducer, initial)
  const send = useCallback((type: ConnectionEvent['type']) => {
    dispatch({ type } as ConnectionEvent)
  }, [])
  return { state, send }
}
