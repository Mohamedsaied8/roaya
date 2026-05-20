import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface MediaErrorDetail {
  reason: string
  recoverable?: boolean
}

/**
 * MediaErrorToast — listens for `roaya:media-error` CustomEvents dispatched
 * by RoomPage when getUserMedia fails (or times out) and renders a dismissable
 * banner. Mount once at the app root.
 */
export default function MediaErrorToast() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<MediaErrorDetail>).detail
      if (!detail) return
      setMessage(detail.reason || 'Failed to access camera/microphone')
    }
    window.addEventListener('roaya:media-error', handler as EventListener)
    return () => window.removeEventListener('roaya:media-error', handler as EventListener)
  }, [])

  if (!message) return null

  return (
    <div
      role="alert"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md bg-red-500/10 border border-red-500/50 text-red-100 backdrop-blur-md px-4 py-3 rounded-xl shadow-lg flex items-start gap-3"
    >
      <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
      <div className="flex-1 text-sm">
        <div className="font-semibold">Media error</div>
        <div className="text-red-200/80">{message}</div>
      </div>
      <button
        aria-label="Dismiss"
        onClick={() => setMessage(null)}
        className="text-red-200/70 hover:text-white"
      >
        <X size={16} />
      </button>
    </div>
  )
}