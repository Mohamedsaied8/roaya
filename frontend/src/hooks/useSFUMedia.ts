import { useEffect, useRef, useState, useCallback } from 'react'
import { signalingClient } from '../services/signaling/SignalingClient'
import { useMediaStore } from '../store/useMediaStore'

interface ProducerInfo {
  id: string
  kind: 'audio' | 'video'
  participantId: string
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
  const { localStream, addRemoteStream, removeRemoteStream } = useMediaStore()
  const deviceRef = useRef<any>(null) // mediasoup-client Device
  const sendTransportRef = useRef<any>(null)
  const recvTransportsRef = useRef<Map<string, any>>(new Map()) // participantId -> recv transport
  const consumersRef = useRef<Map<string, any[]>>(new Map()) // participantId -> consumers[]
  const [state, setState] = useState<SFUMediaState>({
    isConnected: false,
    sendTransportId: null,
    audioProducerId: null,
    videoProducerId: null,
    error: null,
  })

  // ─── Helper: send SFU signaling message and await response ──────────────────
  const sfuRequest = useCallback(async (type: string, payload: Record<string, unknown>) => {
    const response = await signalingClient.request(type as any, payload, { roomId, timeout: 15000 })
    if (!response.payload?.success) {
      throw new Error((response.payload?.error as string) || `SFU request failed: ${type}`)
    }
    return response.payload as Record<string, any>
  }, [roomId])

  // ─── Initialize mediasoup device and produce local tracks ───────────────────
  const initializeSFU = useCallback(async () => {
    if (!localStream || !enabled) return

    try {
      // Lazy-load mediasoup-client (tree-shaking friendly)
      const { Device } = await import('mediasoup-client')

      // Step 1: Get router RTP capabilities
      const caps = await sfuRequest('sfu_get_router_rtp_capabilities', { roomId })

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

      sendTransport.on('produce', async ({ kind, rtpParameters }: any, callback: (p: {id: string}) => void, errback: (e: Error) => void) => {
        try {
          const result = await sfuRequest('sfu_produce', {
            transportId: sendTransport.id as unknown as string,
            kind,
            rtpParameters,
            participantId,
          })
          callback({ id: result['id'] as string })
        } catch (e: any) {
          errback(e)
        }
      })

      // Step 4: Produce audio and video tracks
      let audioProducerId: string | null = null
      let videoProducerId: string | null = null

      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        const audioProducer = await sendTransport.produce({ track: audioTrack })
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
        videoProducerId = videoProducer.id
      }

      setState(s => ({ ...s, isConnected: true, sendTransportId: sendTransport.id, audioProducerId, videoProducerId }))

      // Step 5: Consume existing producers in the room
      const activeProducers = await sfuRequest('sfu_get_active_producers', { roomId })
      for (const producer of (activeProducers.producers as ProducerInfo[])) {
        if (producer.participantId !== participantId) {
          await consumeProducer(producer, device)
        }
      }
    } catch (err: any) {
      console.error('SFU initialization failed:', err)
      setState(s => ({ ...s, error: err.message }))
    }
  }, [localStream, enabled, roomId, participantId, sfuRequest])

  // ─── Consume a single remote producer ──────────────────────────────────────
  const consumeProducer = async (producer: ProducerInfo, device: any) => {
    try {
      const transportData = await sfuRequest('sfu_create_webrtc_transport', {
        roomId,
        participantId,
        direction: 'recv',
      })
      const recvTransport = device.createRecvTransport(transportData.params)

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

      const consumeResult = await sfuRequest('sfu_consume', {
        transportId: recvTransport.id,
        producerId: producer.id,
        rtpCapabilities: device.rtpCapabilities,
      })

      const consumer = await recvTransport.consume(consumeResult.params)
      await consumer.resume()

      // Add track to remote stream for this participant
      let stream = new MediaStream()
      stream.addTrack(consumer.track)
      addRemoteStream(producer.participantId, stream)

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
  }, [removeRemoteStream])

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
    if (enabled && roomId && participantId && localStream) {
      initializeSFU()
    }
    return cleanup
  }, [enabled, roomId, participantId]) // intentionally excludes localStream to avoid re-init on stream update

  return {
    ...state,
    handleParticipantJoined,
    handleParticipantLeft,
    shareScreen,
  }
}
