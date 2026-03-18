import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    Mic, MicOff, Video, VideoOff, Phone,
    MessageSquare, Users, MonitorUp, MoreVertical,
    Copy, Check, Link, X
} from 'lucide-react'
import { useRoomStore } from '../store/useRoomStore'
import { signalingClient } from '../services/signaling/SignalingClient'
import { webRTCClient } from '../services/webrtc/WebRTCClient'
import type { Participant } from '../types/room'

export default function RoomPage() {
    const { roomId } = useParams<{ roomId: string }>()
    const navigate = useNavigate()
    const localVideoRef = useRef<HTMLVideoElement>(null)
    const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
    const [copied, setCopied] = useState(false)
    const [isParticipantsOpen, setIsParticipantsOpen] = useState(false)
    const [linkCopied, setLinkCopied] = useState(false)

    const {
        room,
        participants,
        localParticipant,
        mediaState,
        isChatOpen,
        chatMessages,
        toggleAudio,
        toggleVideo,
        setScreenSharing,
        toggleChat,
        addParticipant,
        removeParticipant,
        updateParticipant,
        clearRoom,
        addChatMessage,
    } = useRoomStore()

    // Initialize WebRTC and signaling
    useEffect(() => {
        if (!roomId) return

        const initializeMedia = async () => {
            try {
                // Get user media
                const stream = await webRTCClient.getUserMedia()
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream
                }

                // Sync initial media tracks state with store defaults
                webRTCClient.toggleAudio(mediaState.audioEnabled)
                webRTCClient.toggleVideo(mediaState.videoEnabled)

                // Setup remote stream handler
                webRTCClient.onRemoteStream((participantId, stream) => {
                    setRemoteStreams(prev => new Map(prev).set(participantId, stream))
                })

                // Setup ICE candidate handler
                webRTCClient.onIceCandidate((participantId, candidate) => {
                    signalingClient.send('ice_candidate', {
                        candidate: candidate.candidate,
                        sdpMLineIndex: candidate.sdpMLineIndex,
                        sdpMid: candidate.sdpMid,
                    }, { roomId, targetId: participantId })
                })

                // Setup screen share ended handler (when user clicks browser's "Stop sharing")
                webRTCClient.onScreenShareEnded(() => {
                    setScreenSharing(false)
                    signalingClient.send('stop_screen_share', {}, { roomId })
                })

            } catch (error) {
                console.error('Failed to initialize media:', error)
            }
        }

        // Setup signaling handlers
        const unsubscribeParticipantJoined = signalingClient.on('participant_joined', async (msg) => {
            const participant = msg.payload as unknown as Participant
            addParticipant(participant)

            // Create offer for new participant
            const offer = await webRTCClient.createOffer(participant.id)
            signalingClient.send('sdp_offer', {
                sdp: offer.sdp,
                type: offer.type,
            }, { roomId, targetId: participant.id })
        })

        const unsubscribeParticipantLeft = signalingClient.on('participant_left', (msg) => {
            const participantId = msg.payload.participantId as string
            removeParticipant(participantId)
            webRTCClient.closePeerConnection(participantId)
            setRemoteStreams(prev => {
                const newMap = new Map(prev)
                newMap.delete(participantId)
                return newMap
            })
        })

        const unsubscribeSdpOffer = signalingClient.on('sdp_offer', async (msg) => {
            const { sdp, type } = msg.payload as { sdp: string; type: RTCSdpType }
            const answer = await webRTCClient.handleOffer(msg.senderId, { sdp, type })
            signalingClient.send('sdp_answer', {
                sdp: answer.sdp,
                type: answer.type,
            }, { roomId, targetId: msg.senderId })
        })

        const unsubscribeSdpAnswer = signalingClient.on('sdp_answer', async (msg) => {
            const { sdp, type } = msg.payload as { sdp: string; type: RTCSdpType }
            await webRTCClient.handleAnswer(msg.senderId, { sdp, type })
        })

        const unsubscribeIceCandidate = signalingClient.on('ice_candidate', async (msg) => {
            const { candidate, sdpMLineIndex, sdpMid } = msg.payload as {
                candidate: string
                sdpMLineIndex: number
                sdpMid: string
            }
            await webRTCClient.addIceCandidate(msg.senderId, { candidate, sdpMLineIndex, sdpMid })
        })

        const unsubscribeParticipantUpdate = signalingClient.on('participant_update', (msg) => {
            const participant = msg.payload as unknown as Participant
            updateParticipant(participant.id, participant)
        })

        const unsubscribeStartScreenShare = signalingClient.on('start_screen_share', (msg) => {
            updateParticipant(msg.senderId, { screenSharing: true })
        })

        const unsubscribeStopScreenShare = signalingClient.on('stop_screen_share', (msg) => {
            updateParticipant(msg.senderId, { screenSharing: false })
        })

        const unsubscribeChatMessage = signalingClient.on('chat_message', (msg) => {
            addChatMessage({
                id: `msg_${Date.now()}`,
                roomId: msg.roomId,
                senderId: msg.payload.senderId as string,
                senderName: msg.payload.senderName as string,
                content: msg.payload.message as string,
                timestamp: msg.timestamp,
            })
        })

        const unsubscribeEndMeeting = signalingClient.on('end_meeting', () => {
            handleLeaveRoom()
        })

        const unsubscribeKick = signalingClient.on('kick_participant', () => {
            handleLeaveRoom()
        })

        initializeMedia()

        return () => {
            unsubscribeParticipantJoined()
            unsubscribeParticipantLeft()
            unsubscribeSdpOffer()
            unsubscribeSdpAnswer()
            unsubscribeIceCandidate()
            unsubscribeParticipantUpdate()
            unsubscribeStartScreenShare()
            unsubscribeStopScreenShare()
            unsubscribeChatMessage()
            unsubscribeEndMeeting()
            unsubscribeKick()
        }
    }, [roomId])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            webRTCClient.cleanup()
            // Removed clearRoom() to prevent React 18 Strict Mode from immediately wiping
            // the Zustand store state that was just populated by HomePage.
        }
    }, [])

    const handleToggleAudio = () => {
        toggleAudio()
        webRTCClient.toggleAudio(!mediaState.audioEnabled)
        signalingClient.send('media_state_change', {
            audioMuted: mediaState.audioEnabled, // Will be toggled
        }, { roomId })
    }

    const handleToggleVideo = () => {
        toggleVideo()
        webRTCClient.toggleVideo(!mediaState.videoEnabled)
        signalingClient.send('media_state_change', {
            videoMuted: mediaState.videoEnabled, // Will be toggled
        }, { roomId })
    }

    const handleScreenShare = async () => {
        try {
            if (mediaState.screenSharing) {
                webRTCClient.stopScreenShare()
                setScreenSharing(false)
                signalingClient.send('stop_screen_share', {}, { roomId })

                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = webRTCClient.getLocalStream()
                }
            } else {
                const screenStream = await webRTCClient.startScreenShare()
                setScreenSharing(true)
                signalingClient.send('start_screen_share', {}, { roomId })

                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = screenStream
                }
            }
        } catch (error) {
            console.error('Screen share error:', error)
            // Reset state if screen share failed
            setScreenSharing(false)
        }
    }

    const handleLeaveRoom = () => {
        signalingClient.send('leave_room', {}, { roomId })
        webRTCClient.cleanup()
        clearRoom()
        signalingClient.disconnect()
        navigate('/')
    }

    const handleCopyMeetingCode = () => {
        if (room?.meetingCode) {
            navigator.clipboard.writeText(room.meetingCode)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const allParticipants = [
        localParticipant && { ...localParticipant, isLocal: true },
        ...participants.filter(p => p.id !== localParticipant?.id).map(p => ({ ...p, isLocal: false })),
    ].filter(Boolean) as (Participant & { isLocal: boolean })[]

    const gridCount = Math.min(allParticipants.length, 50)

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--color-bg-primary)'
        }}>
            {/* Header */}
            <header style={{
                padding: 'var(--spacing-sm) var(--spacing-lg)',
                background: 'var(--color-bg-secondary)',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div>
                    <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
                        {room?.name || 'Meeting Room'}
                    </h1>
                    <button
                        onClick={handleCopyMeetingCode}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--spacing-xs)',
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-text-secondary)',
                            fontSize: 'var(--font-size-sm)',
                            cursor: 'pointer'
                        }}
                    >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        {room?.meetingCode || 'Loading...'}
                    </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                        {allParticipants.length} / 50 participants
                    </span>
                </div>
            </header>

            {/* Main content */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Video grid */}
                <div style={{ flex: 1, padding: 'var(--spacing-sm)', overflow: 'auto' }}>
                    <div
                        className={`video-grid ${gridCount > 9 ? 'large' : ''}`}
                        data-count={gridCount}
                        style={{ height: '100%' }}
                    >
                        {allParticipants.map((participant) => (
                            <VideoTile
                                key={participant.id}
                                participant={participant}
                                isLocal={participant.isLocal}
                                localVideoRef={participant.isLocal ? localVideoRef : undefined}
                                stream={participant.isLocal ? null : remoteStreams.get(participant.id)}
                            />
                        ))}
                    </div>
                </div>

                {/* Participants panel */}
                {isParticipantsOpen && (
                    <ParticipantsPanel
                        participants={allParticipants}
                        meetingCode={room?.meetingCode}
                        linkCopied={linkCopied}
                        onCopyLink={() => {
                            const meetingUrl = `${window.location.protocol}//${window.location.host}/room/${roomId}`
                            navigator.clipboard.writeText(meetingUrl)
                            setLinkCopied(true)
                            setTimeout(() => setLinkCopied(false), 2000)
                        }}
                        onClose={() => setIsParticipantsOpen(false)}
                    />
                )}

                {/* Chat panel */}
                {isChatOpen && (
                    <ChatPanel
                        messages={chatMessages}
                        onSendMessage={(message) => {
                            signalingClient.send('chat_message', { message }, { roomId })
                        }}
                        onClose={toggleChat}
                    />
                )}
            </div>

            {/* Control bar */}
            <div className="control-bar">
                <button
                    className={`control-btn ${!mediaState.audioEnabled ? 'muted' : ''}`}
                    onClick={handleToggleAudio}
                    title={mediaState.audioEnabled ? 'Mute' : 'Unmute'}
                >
                    {mediaState.audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
                </button>

                <button
                    className={`control-btn ${!mediaState.videoEnabled ? 'muted' : ''}`}
                    onClick={handleToggleVideo}
                    title={mediaState.videoEnabled ? 'Turn off camera' : 'Turn on camera'}
                >
                    {mediaState.videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
                </button>

                <button
                    className={`control-btn ${mediaState.screenSharing ? 'active' : ''}`}
                    onClick={handleScreenShare}
                    title={mediaState.screenSharing ? 'Stop sharing' : 'Share screen'}
                >
                    <MonitorUp size={20} />
                </button>

                <div style={{ width: '1px', height: '32px', background: 'var(--color-border)', margin: '0 var(--spacing-sm)' }} />

                <button
                    className={`control-btn ${isChatOpen ? 'active' : ''}`}
                    onClick={toggleChat}
                    title="Chat"
                >
                    <MessageSquare size={20} />
                </button>

                <button
                    className={`control-btn ${isParticipantsOpen ? 'active' : ''}`}
                    onClick={() => setIsParticipantsOpen(!isParticipantsOpen)}
                    title="Participants"
                >
                    <Users size={20} />
                </button>

                <button
                    className="control-btn"
                    title="More options"
                >
                    <MoreVertical size={20} />
                </button>

                <div style={{ width: '1px', height: '32px', background: 'var(--color-border)', margin: '0 var(--spacing-sm)' }} />

                <button
                    className="control-btn danger"
                    onClick={handleLeaveRoom}
                    title="Leave meeting"
                >
                    <Phone size={20} style={{ transform: 'rotate(135deg)' }} />
                </button>
            </div>
        </div>
    )
}

// Video tile component
function VideoTile({
    participant,
    isLocal,
    localVideoRef,
    stream
}: {
    participant: Participant & { isLocal: boolean }
    isLocal: boolean
    localVideoRef?: React.RefObject<HTMLVideoElement>
    stream?: MediaStream | null
}) {
    const videoRef = useRef<HTMLVideoElement>(null)

    useEffect(() => {
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream
        }
    }, [stream])

    const showVideo = isLocal ? true : (stream && (!participant.videoMuted || participant.screenSharing))
    const initials = participant.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

    return (
        <div className="video-tile">
            {showVideo ? (
                <video
                    ref={isLocal ? localVideoRef : videoRef}
                    autoPlay
                    playsInline
                    muted={isLocal}
                    style={{ transform: isLocal ? 'scaleX(-1)' : 'none' }}
                />
            ) : (
                <div className="video-tile-avatar">
                    {initials}
                </div>
            )}

            <div className="video-tile-overlay">
                <span className="video-tile-name">
                    {participant.name} {isLocal && '(You)'}
                </span>
                <div className="video-tile-indicators">
                    {participant.audioMuted && <MicOff size={14} />}
                </div>
            </div>
        </div>
    )
}

// Participants panel component
function ParticipantsPanel({
    participants,
    meetingCode,
    linkCopied,
    onCopyLink,
    onClose
}: {
    participants: (Participant & { isLocal: boolean })[]
    meetingCode?: string
    linkCopied: boolean
    onCopyLink: () => void
    onClose: () => void
}) {
    return (
        <div className="chat-panel open" style={{ minWidth: '280px' }}>
            <div className="chat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Participants ({participants.length})</span>
                <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ width: '32px', height: '32px' }}>
                    <X size={16} />
                </button>
            </div>

            {/* Copy meeting link */}
            <div style={{
                padding: 'var(--spacing-sm) var(--spacing-md)',
                borderBottom: '1px solid var(--color-border)'
            }}>
                <button
                    onClick={onCopyLink}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-sm)',
                        width: '100%',
                        padding: 'var(--spacing-sm) var(--spacing-md)',
                        background: linkCopied ? 'rgba(34, 197, 94, 0.15)' : 'var(--color-primary-light)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        color: linkCopied ? '#22c55e' : 'var(--color-primary)',
                        cursor: 'pointer',
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 500,
                        transition: 'all 0.2s ease'
                    }}
                >
                    {linkCopied ? <Check size={16} /> : <Link size={16} />}
                    {linkCopied ? 'Link copied!' : 'Copy meeting link'}
                </button>
                {meetingCode && (
                    <div style={{
                        marginTop: 'var(--spacing-xs)',
                        fontSize: '11px',
                        color: 'var(--color-text-secondary)',
                        textAlign: 'center'
                    }}>
                        Code: {meetingCode}
                    </div>
                )}
            </div>

            {/* Participant list */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: 'var(--spacing-sm) 0'
            }}>
                {participants.map((participant) => {
                    const initials = participant.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                    return (
                        <div
                            key={participant.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--spacing-sm)',
                                padding: 'var(--spacing-sm) var(--spacing-md)',
                                transition: 'background 0.15s ease'
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            {/* Avatar */}
                            <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                background: 'var(--color-primary-light)',
                                color: 'var(--color-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '13px',
                                fontWeight: 600,
                                flexShrink: 0
                            }}>
                                {initials}
                            </div>

                            {/* Name */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: 'var(--font-size-sm)',
                                    fontWeight: 500,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                }}>
                                    {participant.name}
                                    {participant.isLocal && (
                                        <span style={{
                                            marginLeft: 'var(--spacing-xs)',
                                            fontSize: '11px',
                                            color: 'var(--color-primary)',
                                            fontWeight: 400
                                        }}>(You)</span>
                                    )}
                                </div>
                            </div>

                            {/* Status indicators */}
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                                {participant.audioMuted ? (
                                    <MicOff size={14} style={{ color: 'var(--color-danger)' }} />
                                ) : (
                                    <Mic size={14} style={{ color: 'var(--color-text-secondary)' }} />
                                )}
                                {participant.videoMuted ? (
                                    <VideoOff size={14} style={{ color: 'var(--color-danger)' }} />
                                ) : (
                                    <Video size={14} style={{ color: 'var(--color-text-secondary)' }} />
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// Chat panel component
function ChatPanel({
    messages,
    onSendMessage,
    onClose
}: {
    messages: { id: string; senderName: string; content: string; timestamp: number }[]
    onSendMessage: (message: string) => void
    onClose: () => void
}) {
    const [message, setMessage] = useState('')
    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleSend = () => {
        if (message.trim()) {
            onSendMessage(message.trim())
            setMessage('')
        }
    }

    return (
        <div className="chat-panel open">
            <div className="chat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Chat</span>
                <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ width: '32px', height: '32px' }}>
                    ×
                </button>
            </div>

            <div className="chat-messages">
                {messages.map((msg) => (
                    <div key={msg.id} className="chat-message">
                        <div className="chat-message-header">
                            <span className="chat-message-sender">{msg.senderName}</span>
                            <span className="chat-message-time">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                        <div className="chat-message-content">{msg.content}</div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-container">
                <input
                    className="input chat-input"
                    placeholder="Type a message..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                />
                <button className="btn btn-primary" onClick={handleSend}>
                    Send
                </button>
            </div>
        </div>
    )
}
