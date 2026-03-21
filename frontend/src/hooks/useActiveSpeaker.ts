import { useEffect, useRef, useState } from 'react'

const POLL_INTERVAL_MS = 200
const SPEAKING_THRESHOLD = 0.02  // RMS threshold (0–1 scale)

/**
 * useActiveSpeaker - polls audio levels from remote streams every 200ms
 * and emits the participantId of whoever is loudest above the threshold.
 */
export function useActiveSpeaker(
  remoteStreams: Map<string, MediaStream>,
  localStream: MediaStream | null,
  localParticipantId: string
): string | null {
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null)
  const analyzersRef = useRef<Map<string, AnalyserNode>>(new Map())
  const audioCtxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    const ctx = audioCtxRef.current

    // Build an AnalyserNode for each stream we don't already have one for
    const allStreams = new Map<string, MediaStream>(remoteStreams)
    if (localStream) allStreams.set(localParticipantId, localStream)

    for (const [id, stream] of allStreams) {
      if (!analyzersRef.current.has(id)) {
        try {
          const source = ctx.createMediaStreamSource(stream)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 512
          source.connect(analyser)
          analyzersRef.current.set(id, analyser)
        } catch {
          // Stream may not have audio tracks — skip silently
        }
      }
    }

    // Remove analyzers for streams that are gone
    for (const id of analyzersRef.current.keys()) {
      if (!allStreams.has(id)) {
        analyzersRef.current.delete(id)
      }
    }
  }, [remoteStreams, localStream, localParticipantId])

  useEffect(() => {
    const data = new Float32Array(512)

    const interval = setInterval(() => {
      let maxRms = SPEAKING_THRESHOLD
      let loudestId: string | null = null

      for (const [id, analyser] of analyzersRef.current) {
        analyser.getFloatTimeDomainData(data)
        let sumSq = 0
        for (let i = 0; i < data.length; i++) sumSq += data[i] * data[i]
        const rms = Math.sqrt(sumSq / data.length)

        if (rms > maxRms) {
          maxRms = rms
          loudestId = id
        }
      }

      setActiveSpeakerId(prev => (prev !== loudestId ? loudestId : prev))
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [])

  return activeSpeakerId
}
