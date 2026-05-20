import { useEffect, useRef, useState, useCallback } from 'react'
import { signalingClient } from '../services/signaling/SignalingClient'
import type { MessageType } from '../types/signaling'
import { useMediaStore } from '../store/useMediaStore'
import { useRoomStore } from '../store/useRoomStore'
import { useConnectionFSM } from './useConnectionFSM'

interface ProducerInfo {
  id: string
  kind: 'audio' | 'video'
  participantId: string
  source?: string
}

interface SFUMediaState {
  isConnected: boolean
  sendTransportId: string | null
  audioProducerId: string | null
  videoProducerId: string | null
  error: string | null
}

/**
 * useSFUMedia - manages the full SFU (mediasoup) media lifecycle:
 *   1. Gets RTP capabilities from SFU router
 *   2. Creates send WebRTC transport and produces local tracks
 *   3. On new participant join: creates recv transport and consumes their producers
 *   4. Cleans up on leave
 */
export function useSFUMedia(roomId: string, participantId: string, enabled: boolean) {
  const { localStream, addRemoteStream, removeRemoteStream, addScreenStream, removeScreenStream } = useMediaStore()
  const deviceRef = useRef<any>(null) // mediasoup-client Device
  const sendTransportRef = useRef<any>(null)
  const audioProducerRef = useRef<any>(null)
  const videoProducerRef = useRef<any>(null)
  const recvTransportsRef = useRef<Map<string, any>>(new Map()) // participantId -> recv transport
  const consumersRef = useRef<Map<string, any[]>>(new Map()) // participantId -> consumers[]
  const [state, setState] = useState<SFUMediaState>({
    isConnected: false,
    sendTransportId: null,
    audioProducerId: null,
    videoProducerId: null,
    error: null,
  })
  // A.4: connection-lifecycle FSM (IDLE → SIGNALING → CONNECTING → CONNECTED → RECONNECTING)
  const fsm = useConnectionFSM('IDLE')

  // ─── Helper: send SFU signaling message and await response ──────────────────
  const sfuRequest = useCallback(async (type: MessageType, payload: Record<string, unknown>) => {
    const response = await signalingClient.request(type, payload, { roomId, timeout: 15000 })
    if (!response.payload?.success) {
      throw new Error((response.payload?.error as string) || `SFU request failed: ${type}`)
    }
    return response.payload as Record<string, any>
  }, [roomId])

  // ─── Initialize mediasoup device and produce local tracks ───────────────────
  const initializeSFU = useCallback(async () => {
    if (!enabled) return

    try {
      fsm.send('START_SIGNALING')
      // Lazy-load mediasoup-client (tree-shaking friendly)
      const { Device } = await import('mediasoup-client')

      // Step 1: Get router RTP capabilities
      const caps = await sfuRequest('sfu_get_router_rtp_capabilities', { roomId })
      fsm.send('SIGNALING_READY')

      // Step 2: Load device with router capabilities
      const device = new Device()
      await device.load({ routerRtpCapabilities: caps['rtpCapabilities'] as any })
      deviceRef.current = device

      // Step 3: Create send transport
      const transportData = await sfuRequest('sfu_create_webrtc_transport', {
        roomId,
        participantId,
        direction: 'send',
      })
      const sendTransport = device.createSendTransport(transportData['params'] as any)
      sendTransportRef.current = sendTransport

      // Wire transport events to signaling
      sendTransport.on('connect', async ({ dtlsParameters }: any, callback: () => void, errback: (e: Error) => void) => {
        try {
          await sfuRequest('sfu_connect_webrtc_transport', {
            transportId: sendTransport.id as unknown as string,
            dtlsParameters,
          })
          callback()
        } catch (e: any) {
          errback(e)
        }
      })

      sendTransport.on('produce', async ({ kind, rtpParameters, appData }: any, callback: (p: {id: string}) => void, errback: (e: Error) => void) => {
        try {
          const result = await sfuRequest('sfu_produce', {
            transportId: sendTransport.id as unknown as string,
            kind,
            rtpParameters,
            participantId,
            source: appData?.source || 'camera',
          })
          callback({ id: result['id'] as string })
        } catch (e: any) {
          errback(e)
        }
      })

      // Step 4: Produce audio and video tracks
      let audioProducerId: string | null = null
      let videoProducerId: string | null = null

      if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0]
        if (audioTrack) {
          const audioProducer = await sendTransport.produce({ track: audioTrack })
          audioProducerRef.current = audioProducer
          audioProducerId = audioProducer.id
        }

        const videoTrack = localStream.getVideoTracks()[0]
        if (videoTrack) {
          const videoProducer = await sendTransport.produce({
            track: videoTrack,
            encodings: [
              { maxBitrate: 100_000 },
              { maxBitrate: 300_000 },
              { maxBitrate: 900_000 },
            ],
            codecOptions: { videoGoogleStartBitrate: 1000 },
          })
          videoProducerRef.current = videoProducer
          videoProducerId = videoProducer.id
        }
      }

      // Step 4b: Respect persisted mute state (survives page refresh)
      const { audioEnabled, videoEnabled } = useRoomStore.getState().mediaState
      if (!audioEnabled && audioProducerRef.current) {
        audioProducerRef.current.pause()
      }
      if (!videoEnabled && videoProducerRef.current) {
        videoProducerRef.current.pause()
      }

      setState(s => ({ ...s, isConnected: true, sendTransportId: sendTransport.id, audioProducerId, videoProducerId }))
      fsm.send('CONNECTED')

      // Step 5: Consume existing producers in the room
      const activeProducers = await sfuRequest('sfu_get_active_producers', { roomId })
      for (const producer of (activeProducers.producers as ProducerInfo[])) {
        if (producer.participantId !== participantId) {
          await consumeProducer(producer, device)
        }
      }

      // Notify the room of our actual media state
      signalingClient.send('media_state_change', { audioMuted: !audioEnabled, videoMuted: !videoEnabled }, { roomId })
    } catch (err: any) {
      console.error('SFU initialization failed:', err)
      setState(s => ({ ...s, error: err.message }))
      fsm.send('FAIL')
    }
  }, [enabled, roomId, participantId, sfuRequest])

  // ─── Consume a single remote producer ──────────────────────────────────────
  const consumeProducer = async (producer: ProducerInfo, device: any) => {
    try {
      // Multiplex multiple producers over a single WebRTC Receive Transport
      // We create at most one receive transport per remote participant
      let recvTransport = recvTransportsRef.current.get(producer.participantId)

      if (!recvTransport) {
        const transportData = await sfuRequest('sfu_create_webrtc_transport', {
          roomId,
          participantId,
          direction: 'recv',
        })
        recvTransport = device.createRecvTransport(transportData.params)

        recvTransport.on('connect', async ({ dtlsParameters }: any, callback: () => void, errback: (e: Error) => void) => {
          try {
            await sfuRequest('sfu_connect_webrtc_transport', {
              transportId: recvTransport.id,
              dtlsParameters,
            })
            callback()
          } catch (e: any) {
            errback(e)
          }
        })

        recvTransportsRef.current.set(producer.participantId, recvTransport)
      }

      const consumeResult = await sfuRequest('sfu_consume', {
        transportId: recvTransport.id,
        producerId: producer.id,
        rtpCapabilities: device.rtpCapabilities,
      })

      const consumer = await recvTransport.consume(consumeResult.params)
      await consumer.resume()

      // A.4 — track-end lifecycle binding (Architecture §7 bug #5).
      // When the remote producer disconnects, mediasoup-client fires either
      // 'trackended' on the consumer or 'ended' on the underlying MediaStreamTrack.
      // We must drop the stale stream so the UI doesn't render frozen frames.
      const isScreenProducer = producer.source === 'screen'
      const dropStream = () => {
        try { consumer.close() } catch { /* ignore */ }
        const storeState = useMediaStore.getState()
        const streamMap = isScreenProducer ? storeState.screenStreams : storeState.remoteStreams
        const currentStream = streamMap.get(producer.participantId)
        if (currentStream) {
          currentStream.removeTrack(consumer.track)
          if (currentStream.getTracks().length === 0) {
            if (isScreenProducer) {
              removeScreenStream(producer.participantId)
            } else {
              removeRemoteStream(producer.participantId)
            }
          } else {
            const newStream = new MediaStream(currentStream.getTracks())
            if (isScreenProducer) {
              addScreenStream(producer.participantId, newStream)
            } else {
              addRemoteStream(producer.participantId, newStream)
            }
          }
        }
        window.dispatchEvent(
          new CustomEvent('roaya:track-ended', {
            detail: { participantId: producer.participantId, producerId: producer.id },
          }),
        )
      }
      consumer.on('trackended', dropStream)
      if (consumer.track) {
        consumer.track.addEventListener('ended', dropStream)
      }

      // Route screen share tracks to a separate stream map
      const isScreen = producer.source === 'screen'
      if (isScreen) {
        const existingScreen = useMediaStore.getState().screenStreams.get(producer.participantId)
        const screenStream = existingScreen || new MediaStream()
        if (!screenStream.getTracks().find(t => t.id === consumer.track.id)) {
          screenStream.addTrack(consumer.track)
        }
        addScreenStream(producer.participantId, new MediaStream(screenStream.getTracks()))
      } else {
        const existingStream = useMediaStore.getState().remoteStreams.get(producer.participantId)
        const stream = existingStream || new MediaStream()
        if (!stream.getTracks().find(t => t.id === consumer.track.id)) {
          stream.addTrack(consumer.track)
        }
        addRemoteStream(producer.participantId, new MediaStream(stream.getTracks()))
      }

      // Track consumers per participant for cleanup
      const existing = consumersRef.current.get(producer.participantId) || []
      consumersRef.current.set(producer.participantId, [...existing, consumer])

      const existingTransport = recvTransportsRef.current.get(producer.participantId)
      if (!existingTransport) {
        recvTransportsRef.current.set(producer.participantId, recvTransport)
      }
    } catch (err: any) {
      console.error(`Failed to consume producer ${producer.id}:`, err)
    }
  }

  // ─── Poll for new producers (useful when peers emit state updates) ─────────
  const pollProducers = useCallback(async () => {
    if (!deviceRef.current) return
    try {
      const activeProducers = await sfuRequest('sfu_get_active_producers', { roomId })
      for (const producer of (activeProducers.producers as ProducerInfo[])) {
        if (producer.participantId !== participantId) {
          // Check if we are already consuming it
          let isConsuming = false
          for (const consumers of consumersRef.current.values()) {
            if (consumers.find(c => c.producerId === producer.id)) {
              isConsuming = true
              break
            }
          }
          if (!isConsuming) {
            await consumeProducer(producer, deviceRef.current)
          }
        }
      }
    } catch (err) {
      console.error('Failed to poll producers:', err)
    }
  }, [roomId, participantId, sfuRequest])

  // ─── Handle new participant joining (subscribe to their producers) ───────────
  const handleParticipantJoined = useCallback(async (participantId_remote: string) => {
    if (!deviceRef.current) return
    try {
      const activeProducers = await sfuRequest('sfu_get_active_producers', { roomId })
      for (const producer of (activeProducers.producers as ProducerInfo[])) {
        if (producer.participantId === participantId_remote) {
          await consumeProducer(producer, deviceRef.current)
        }
      }
    } catch (err) {
      console.error('Failed to subscribe to new participant:', err)
    }
  }, [roomId, sfuRequest])

  // ─── Handle participant leaving (clean up their consumers/stream) ────────────
  const handleParticipantLeft = useCallback((remoteParticipantId: string) => {
    const consumers = consumersRef.current.get(remoteParticipantId)
    if (consumers) {
      consumers.forEach(c => c.close())
      consumersRef.current.delete(remoteParticipantId)
    }
    const transport = recvTransportsRef.current.get(remoteParticipantId)
    if (transport) {
      transport.close()
      recvTransportsRef.current.delete(remoteParticipantId)
    }
    removeRemoteStream(remoteParticipantId)
    removeScreenStream(remoteParticipantId)
  }, [removeRemoteStream, removeScreenStream])

  // ─── Replace video track with screen share ──────────────────────────────────
  const shareScreen = useCallback(async (screenTrack: MediaStreamTrack) => {
    if (!sendTransportRef.current || !deviceRef.current) return
    try {
      await sendTransportRef.current.produce({
        track: screenTrack,
        appData: { source: 'screen' },
      })
    } catch (err) {
      console.error('Failed to share screen via SFU:', err)
    }
  }, [])

  // ─── Pause/resume producers (for mute/camera toggle) ───────────────────────
  const pauseAudio = useCallback(() => {
    if (audioProducerRef.current && !audioProducerRef.current.paused) {
      audioProducerRef.current.pause()
    }
  }, [])

  const resumeAudio = useCallback(() => {
    if (audioProducerRef.current && audioProducerRef.current.paused) {
      audioProducerRef.current.resume()
    }
  }, [])

  const pauseVideo = useCallback(() => {
    if (videoProducerRef.current && !videoProducerRef.current.paused) {
      videoProducerRef.current.pause()
    }
  }, [])

  const resumeVideo = useCallback(() => {
    if (videoProducerRef.current && videoProducerRef.current.paused) {
      videoProducerRef.current.resume()
    }
  }, [])

  // ─── Cleanup on unmount / room change ──────────────────────────────────────
  const cleanup = useCallback(() => {
    sendTransportRef.current?.close()
    sendTransportRef.current = null
    recvTransportsRef.current.forEach(t => t.close())
    recvTransportsRef.current.clear()
    consumersRef.current.forEach(cs => cs.forEach(c => c.close()))
    consumersRef.current.clear()
    deviceRef.current = null
    setState({ isConnected: false, sendTransportId: null, audioProducerId: null, videoProducerId: null, error: null })
  }, [])

  useEffect(() => {
    if (enabled && roomId && participantId && !deviceRef.current) {
      initializeSFU()
    }
    return () => {
      if (!enabled) cleanup()
    }
  }, [enabled, roomId, participantId])

  // Produce local tracks when localStream arrives after SFU is already connected
  useEffect(() => {
    if (!localStream || !sendTransportRef.current || audioProducerRef.current || videoProducerRef.current) return

    const produceLateTracks = async () => {
      try {
        const audioTrack = localStream.getAudioTracks()[0]
        if (audioTrack) {
          const audioProducer = await sendTransportRef.current.produce({ track: audioTrack })
          audioProducerRef.current = audioProducer
          setState(s => ({ ...s, audioProducerId: audioProducer.id }))
        }

        const videoTrack = localStream.getVideoTracks()[0]
        if (videoTrack) {
          const videoProducer = await sendTransportRef.current.produce({
            track: videoTrack,
            encodings: [
              { maxBitrate: 100_000 },
              { maxBitrate: 300_000 },
              { maxBitrate: 900_000 },
            ],
            codecOptions: { videoGoogleStartBitrate: 1000 },
          })
          videoProducerRef.current = videoProducer
          setState(s => ({ ...s, videoProducerId: videoProducer.id }))
        }

        const { audioEnabled, videoEnabled } = useRoomStore.getState().mediaState
        if (!audioEnabled && audioProducerRef.current) audioProducerRef.current.pause()
        if (!videoEnabled && videoProducerRef.current) videoProducerRef.current.pause()
      } catch (err) {
        console.error('Failed to produce late tracks:', err)
      }
    }
    produceLateTracks()
  }, [localStream])

  return {
    ...state,
    handleParticipantJoined,
    handleParticipantLeft,
    shareScreen,
    pollProducers,
    pauseAudio,
    resumeAudio,
    pauseVideo,
    resumeVideo,
  }
}
