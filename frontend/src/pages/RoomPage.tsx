import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    Mic, MicOff, Video, VideoOff, Phone,
    MessageSquare, Users, MonitorUp, MonitorX,
    Copy, Check, X, Maximize, Minimize, LayoutGrid, Focus
} from 'lucide-react'
import { useRoomStore } from '../store/useRoomStore'
import { signalingClient } from '../services/signaling/SignalingClient'
import { useMediaStore } from '../store/useMediaStore'
import { VideoGrid } from '../components/Meeting/VideoGrid'
import { useSFUMedia } from '../hooks/useSFUMedia'
import type { Participant } from '../types/room'
import { useAuthStore } from '../store/useAuthStore'

export default function RoomPage() {
    const { roomId } = useParams<{ roomId: string }>()
    const navigate = useNavigate()
    const [copied, setCopied] = useState(false)
    const [isParticipantsOpen, setIsParticipantsOpen] = useState(false)
    const [viewMode, setViewMode] = useState<'gallery' | 'spotlight'>('gallery')
    const [isFullscreen, setIsFullscreen] = useState(false)
    const roomContainerRef = useRef<HTMLDivElement>(null)

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
        clearRoom,
        addChatMessage,
        updateParticipant,
    } = useRoomStore()

    const screenStreamRef = useRef<MediaStream | null>(null)

    const [mediaReady, setMediaReady] = useState(false)

    // SFU Media hook — drives the full mediasoup lifecycle
    const sfuMedia = useSFUMedia(
        roomId || '',
        localParticipant?.id || '',
        !!localParticipant?.id && mediaReady   // Only connect SFU AFTER permissions are resolved (whether granted or denied)
    )

    // Keep a ref to sfuMedia so signaling handlers always call the latest version.
    // The useEffect([roomId]) captures sfuMedia at mount, but pollProducers/handleParticipantJoined
    // are useCallbacks that change when participantId changes (after join). Without the ref,
    // signaling handlers would call stale versions that have participantId = ''.
    const sfuMediaRef = useRef(sfuMedia)
    sfuMediaRef.current = sfuMedia

    useEffect(() => {
        if (!roomId) return

        // --- 1. Acquire camera/mic IMMEDIATELY (independent of SFU) ---
        const acquireMedia = async () => {
            // Check if we are in a secure context (HTTPS/localhost)
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                console.warn('mediaDevices API not available! (Requires HTTPS or localhost)');
                setMediaReady(true);
                return;
            }

            // 30s timeout to allow user time to click 'Allow' on the permission prompt.
            const timeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Camera/Microphone permission prompt timed out (30s)')), 30000),
            )
            try {
                const stream = await Promise.race([
                    navigator.mediaDevices.getUserMedia({ audio: true, video: true }),
                    timeout,
                ])
                const ms = stream as MediaStream
                const { audioEnabled, videoEnabled } = useRoomStore.getState().mediaState
                ms.getAudioTracks().forEach(t => { t.enabled = audioEnabled })
                ms.getVideoTracks().forEach(t => { t.enabled = videoEnabled })
                useMediaStore.getState().setLocalStream(ms)
            } catch (err) {
                console.warn('getUserMedia failed (no camera/mic):', err)
                if (typeof window !== 'undefined') {
                    const reason = err instanceof Error ? err.message : 'unknown error'
                    window.dispatchEvent(
                        new CustomEvent('roaya:media-error', {
                            detail: { reason, recoverable: true },
                        }),
                    )
                }
            } finally {
                // Whether successful or denied, flag media check as complete so SFU can connect
                setMediaReady(true)
            }
        }
        acquireMedia()

        // --- 1.5 Auto Join if missing State (Direct URL Navigation) ---
        const autoJoin = async () => {
            if (!room && roomId) {
                const { isAuthenticated, setUser, user } = useAuthStore.getState()
                const userName = user?.name || 'Guest User'
                if (!isAuthenticated) {
                    setUser({ id: `guest_${Date.now()}`, email: '', name: userName }, 'guest-token')
                }
                try {
                    await signalingClient.connect()
                    // If the URL has hyphens, it might be a meeting code, otherwise it's likely a roomId
                    const isMeetingCode = roomId.includes('-');
                    if (isMeetingCode) {
                        signalingClient.send('join_room', {
                            meetingCode: roomId,
                            name: userName,
                        })
                    } else {
                        // Rejoining using roomId directly in the base payload
                        signalingClient.send('join_room', {
                            name: userName,
                        }, { roomId: roomId })
                    }
                } catch (e) {
                    console.error('Auto-join failed:', e)
                }
            }
        }
        autoJoin()

        // --- 2. Signaling handlers ---
        const unsubscribeRoomJoined = signalingClient.on('room_joined', (msg) => {
            const roomData = msg.payload as any
            const lp = roomData.participants.find((p: any) => p.id === msg.senderId)
            if (lp) useRoomStore.getState().setLocalParticipant(lp)
            useRoomStore.getState().setRoom(roomData)
        })

        const unsubscribeJoined = signalingClient.on('participant_joined', (msg) => {
            const participant = msg.payload as unknown as Participant;
            addParticipant(participant);
            sfuMediaRef.current.handleParticipantJoined(participant.id);
        });

        const unsubscribeUpdate = signalingClient.on('participant_update', (msg) => {
            const participant = msg.payload as unknown as Participant;
            updateParticipant(participant.id, participant);
            sfuMediaRef.current.pollProducers();
        });

        const unsubscribeLeft = signalingClient.on('participant_left', (msg) => {
            const participantId = msg.payload.participantId as string;
            removeParticipant(participantId);
            sfuMediaRef.current.handleParticipantLeft(participantId);
        });

        const unsubscribeChat = signalingClient.on('chat_message', (msg) => {
            addChatMessage({
                id: `msg_${Date.now()}`,
                roomId: msg.roomId,
                senderId: msg.payload.senderId as string,
                senderName: msg.payload.senderName as string,
                content: msg.payload.message as string,
                timestamp: msg.timestamp,
            });
        });

        const unsubscribeScreenStart = signalingClient.on('start_screen_share', (msg) => {
            const senderId = msg.senderId || (msg.payload.participantId as string);
            if (senderId) {
                updateParticipant(senderId, { screenSharing: true });
            }
            sfuMediaRef.current.pollProducers();
        });

        const unsubscribeScreenStop = signalingClient.on('stop_screen_share', (msg) => {
            const senderId = msg.senderId || (msg.payload.participantId as string);
            if (senderId) {
                updateParticipant(senderId, { screenSharing: false });
                useMediaStore.getState().removeScreenStream(senderId);
            }
        });

        const unsubscribeMediaState = signalingClient.on('media_state_change', () => {
            sfuMediaRef.current.pollProducers();
        });

        const unsubscribeEnd = signalingClient.on('end_meeting', () => handleLeaveRoom());
        const unsubscribeKick = signalingClient.on('kick_participant', () => handleLeaveRoom());

        return () => {
            unsubscribeRoomJoined();
            unsubscribeJoined();
            unsubscribeUpdate();
            unsubscribeLeft();
            unsubscribeChat();
            unsubscribeScreenStart();
            unsubscribeScreenStop();
            unsubscribeMediaState();
            unsubscribeEnd();
            unsubscribeKick();
        };
    }, [roomId]);

    const handleToggleAudio = async () => {
        toggleAudio();
        const newEnabled = useRoomStore.getState().mediaState.audioEnabled;
        const stream = useMediaStore.getState().localStream;
        signalingClient.send('media_state_change', { audioMuted: !newEnabled }, { roomId });
        if (stream) {
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = newEnabled;
            }
        }
        if (newEnabled) {
            sfuMedia.resumeAudio();
        } else {
            sfuMedia.pauseAudio();
        }
    };

    const handleToggleVideo = async () => {
        toggleVideo();
        const newEnabled = useRoomStore.getState().mediaState.videoEnabled;
        const stream = useMediaStore.getState().localStream;
        signalingClient.send('media_state_change', { videoMuted: !newEnabled }, { roomId });
        if (stream) {
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = newEnabled;
            }
        }
        if (newEnabled) {
            sfuMedia.resumeVideo();
        } else {
            sfuMedia.pauseVideo();
        }
    };

    const screenStreams = useMediaStore((s) => s.screenStreams)
    const someoneElseSharing = screenStreams.size > 0 && !mediaState.screenSharing

    const handleScreenShare = async () => {
        if (mediaState.screenSharing) {
            if (screenStreamRef.current) {
                screenStreamRef.current.getTracks().forEach(t => t.stop())
                screenStreamRef.current = null
            }
            setScreenSharing(false)
            signalingClient.send('stop_screen_share', {}, { roomId })
        } else {
            // Only one participant can share at a time
            if (useMediaStore.getState().screenStreams.size > 0) {
                return
            }
            try {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: { echoCancellation: true, noiseSuppression: true },
                })
                screenStreamRef.current = screenStream
                const screenTrack = screenStream.getVideoTracks()[0]

                if (screenTrack) {
                    await sfuMedia.shareScreen(screenTrack)
                    screenTrack.onended = () => {
                        setScreenSharing(false)
                        screenStreamRef.current = null
                        signalingClient.send('stop_screen_share', {}, { roomId })
                    }
                }

                setScreenSharing(true)
                signalingClient.send('start_screen_share', {}, { roomId })
            } catch (err) {
                console.error('Screen share failed:', err)
            }
        }
    };

    const handleLeaveRoom = () => {
        signalingClient.send('leave_room', {}, { roomId })
        clearRoom()
        signalingClient.disconnect()
        navigate('/')
    }

    const handleCopyMeetingCode = () => {
        const joinCode = room?.meetingCode || roomId;
        if (joinCode) {
            const inviteLink = `${window.location.origin}/?join=${joinCode}`;
            navigator.clipboard.writeText(inviteLink)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const toggleFullscreen = async () => {
        if (!document.fullscreenElement) {
            await roomContainerRef.current?.requestFullscreen()
            setIsFullscreen(true)
        } else {
            await document.exitFullscreen()
            setIsFullscreen(false)
        }
    }

    // Clean up screen share on page unload (refresh / close tab).
    // Without this, other participants see a frozen screen share after the broadcaster refreshes.
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (screenStreamRef.current) {
                screenStreamRef.current.getTracks().forEach(t => t.stop())
                screenStreamRef.current = null
            }
            if (useRoomStore.getState().mediaState.screenSharing) {
                signalingClient.send('stop_screen_share', {}, { roomId })
            }
        }
        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [roomId])

    // Sync fullscreen state if user exits via Esc
    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement)
        document.addEventListener('fullscreenchange', handler)
        return () => document.removeEventListener('fullscreenchange', handler)
    }, [])

    return (
        <div ref={roomContainerRef} className="h-screen flex flex-col bg-[#0f172a] text-slate-200">
            {/* Header */}
            <header className="px-6 py-4 bg-slate-900/50 backdrop-blur-md border-b border-white/5 flex justify-between items-center">
                <div>
                    <h1 className="text-lg font-semibold text-white">
                        {room?.name || 'Meeting Room'}
                    </h1>
                    <button
                        onClick={handleCopyMeetingCode}
                        title="Copy invite link"
                        className="flex items-center gap-2 text-slate-400 text-sm hover:text-white transition-colors"
                    >
                        {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        {room?.meetingCode || roomId || 'Loading...'}
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    {/* View mode toggle */}
                    <button
                        onClick={() => setViewMode(v => v === 'gallery' ? 'spotlight' : 'gallery')}
                        title={viewMode === 'gallery' ? 'Switch to spotlight' : 'Switch to gallery'}
                        className="p-2 rounded-lg bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        {viewMode === 'gallery' ? <Focus size={16} /> : <LayoutGrid size={16} />}
                    </button>
                    {/* Fullscreen toggle */}
                    <button
                        onClick={toggleFullscreen}
                        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                        className="p-2 rounded-lg bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                    </button>
                    <span className="text-slate-400 text-sm bg-white/5 px-3 py-1 rounded-full border border-white/5 ml-1">
                        {participants.length + 1} participants
                    </span>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                <VideoGrid
                  participants={participants}
                  localParticipantId={localParticipant?.id || ''}
                  localName={localParticipant?.name}
                  viewMode={viewMode}
                  isLocalAudioMuted={!mediaState.audioEnabled}
                  isLocalVideoMuted={!mediaState.videoEnabled}
                />

                {/* Panels */}
                {isParticipantsOpen && (
                    <div className="w-80 bg-slate-900/80 backdrop-blur-xl border-l border-white/5 flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="p-4 border-b border-white/5 flex justify-between items-center">
                            <h2 className="font-semibold text-white">Participants</h2>
                            <X size={20} className="cursor-pointer" onClick={() => setIsParticipantsOpen(false)} />
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {/* Local */}
                            <div className="flex items-center gap-3 p-2 rounded-lg bg-white/5 border border-white/5">
                                <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold text-white uppercase">
                                    {localParticipant?.name[0]}
                                </div>
                                <span className="flex-1 text-sm font-medium">{localParticipant?.name} (You)</span>
                            </div>
                            {/* Remote */}
                            {participants.map(p => (
                                <div key={p.id} className="flex items-center gap-3 p-2">
                                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white uppercase">
                                        {p.name[0]}
                                    </div>
                                    <span className="flex-1 text-sm font-medium">{p.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {isChatOpen && (
                    <div className="w-80 bg-slate-900/80 backdrop-blur-xl border-l border-white/5 flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="p-4 border-b border-white/5 flex justify-between items-center">
                            <h2 className="font-semibold text-white">Chat</h2>
                            <X size={20} className="cursor-pointer" onClick={toggleChat} />
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {chatMessages.map(msg => (
                                <div key={msg.id} className="space-y-1">
                                    <div className="flex justify-between items-baseline">
                                        <span className="text-xs font-bold text-slate-400">{msg.senderName}</span>
                                        <span className="text-[10px] text-slate-500">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <p className="text-sm bg-white/5 p-2 rounded-lg rounded-tl-none border border-white/5">{msg.content}</p>
                                </div>
                            ))}
                        </div>
                        <div className="p-4 border-t border-white/5">
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                    placeholder="Type a message..."
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const target = e.target as HTMLInputElement;
                                            if (target.value.trim()) {
                                                signalingClient.send('chat_message', { message: target.value.trim() }, { roomId });
                                                target.value = '';
                                            }
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="p-6 bg-slate-950/80 backdrop-blur-xl border-t border-white/5 flex justify-center items-center gap-4">
                <button 
                    onClick={handleToggleAudio}
                    className={`p-4 rounded-2xl transition-all duration-200 ${mediaState.audioEnabled ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-red-500/20 text-red-500 border border-red-500/50 hover:bg-red-500/30'}`}
                >
                    {mediaState.audioEnabled ? <Mic size={24} /> : <MicOff size={24} />}
                </button>
                <button 
                    onClick={handleToggleVideo}
                    className={`p-4 rounded-2xl transition-all duration-200 ${mediaState.videoEnabled ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-red-500/20 text-red-500 border border-red-500/50 hover:bg-red-500/30'}`}
                >
                    {mediaState.videoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
                </button>
                <button
                    onClick={handleScreenShare}
                    disabled={someoneElseSharing}
                    title={someoneElseSharing ? 'Another participant is sharing' : mediaState.screenSharing ? 'Stop screen share' : 'Share screen'}
                    className={`p-4 rounded-2xl transition-all duration-200 ${
                        someoneElseSharing
                            ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                            : mediaState.screenSharing
                                ? 'bg-purple-500 text-white hover:bg-purple-600'
                                : 'bg-slate-800 text-white hover:bg-slate-700'
                    }`}
                >
                    {mediaState.screenSharing ? <MonitorX size={24} /> : <MonitorUp size={24} />}
                </button>
                
                <div className="w-px h-8 bg-white/10 mx-2" />
                
                <button 
                    onClick={toggleChat}
                    className={`p-4 rounded-2xl transition-all duration-200 ${isChatOpen ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
                >
                    <MessageSquare size={24} />
                </button>
                <button 
                    onClick={() => setIsParticipantsOpen(!isParticipantsOpen)}
                    className={`p-4 rounded-2xl transition-all duration-200 ${isParticipantsOpen ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
                >
                    <Users size={24} />
                </button>
                
                <div className="w-px h-8 bg-white/10 mx-2" />
                
                <button 
                    onClick={handleLeaveRoom}
                    className="p-4 rounded-2xl bg-red-500 text-white hover:bg-red-600 transition-all duration-200 shadow-lg shadow-red-500/20"
                >
                    <Phone size={24} className="rotate-[135deg]" />
                </button>
            </div>
        </div>
    );
}
