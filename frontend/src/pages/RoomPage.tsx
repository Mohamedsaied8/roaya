import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    Mic, MicOff, Video, VideoOff, Phone,
    MessageSquare, Users, MonitorUp, MonitorX,
    Copy, Check, X
} from 'lucide-react'
import { useRoomStore } from '../store/useRoomStore'
import { signalingClient } from '../services/signaling/SignalingClient'
import { mediaClient } from '../services/media/MediaClient'
import { useMediaStore } from '../store/useMediaStore'
import { VideoGrid } from '../components/Meeting/VideoGrid'
import { useSFUMedia } from '../hooks/useSFUMedia'
import type { Participant } from '../types/room'

export default function RoomPage() {
    const { roomId } = useParams<{ roomId: string }>()
    const navigate = useNavigate()
    const [copied, setCopied] = useState(false)
    const [isParticipantsOpen, setIsParticipantsOpen] = useState(false)

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
    } = useRoomStore()

    const { setLocalStream } = useMediaStore()
    const screenStreamRef = useRef<MediaStream | null>(null)

    // SFU Media hook — drives the full mediasoup lifecycle
    const sfuMedia = useSFUMedia(
        roomId || '',
        localParticipant?.id || '',
        !!localParticipant?.id
    )

    useEffect(() => {
        if (!roomId) return

        const initializeSFU = async () => {
            try {
                // 1. Get Router RTP Capabilities
                const res = await signalingClient.request('sfu_get_router_rtp_capabilities', {}, { roomId });
                await mediaClient.loadDevice((res.payload as any).rtpCapabilities);

                // 2. Create Send Transport
                const sendRes = await signalingClient.request('sfu_create_webrtc_transport', { direction: 'send' }, { roomId });
                await mediaClient.createSendTransport(
                    (sendRes.payload as any).params, 
                    async (prodData) => {
                        const res = await signalingClient.request('sfu_produce', prodData, { roomId });
                        return (res.payload as any).id;
                    },
                    async (connectData) => {
                        await signalingClient.request('sfu_connect_webrtc_transport', connectData, { roomId });
                    }
                );

                // 3. Create Recv Transport
                const recvRes = await signalingClient.request('sfu_create_webrtc_transport', { direction: 'recv' }, { roomId });
                await mediaClient.createRecvTransport(
                    (recvRes.payload as any).params,
                    async (connectData) => {
                        await signalingClient.request('sfu_connect_webrtc_transport', connectData, { roomId });
                    }
                );

                // 4. Start producing local media
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: mediaState.audioEnabled, 
                    video: mediaState.videoEnabled 
                });
                setLocalStream(stream);
                
                for (const track of stream.getTracks()) {
                    await mediaClient.produce(track);
                }

                // 5. Consume existing participants' streams (to be implemented)
                console.log('SFU Media Initialized');
            } catch (error) {
                console.error('SFU Initialization failed:', error);
            }
        };

        // Handle participant joined — subscribe to their SFU producers
        const unsubscribeJoined = signalingClient.on('participant_joined', (msg) => {
            const participant = msg.payload as unknown as Participant;
            addParticipant(participant);
            sfuMedia.handleParticipantJoined(participant.id);
        });

        const unsubscribeLeft = signalingClient.on('participant_left', (msg) => {
            const participantId = msg.payload.participantId as string;
            removeParticipant(participantId);
            sfuMedia.handleParticipantLeft(participantId);
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

        const unsubscribeEnd = signalingClient.on('end_meeting', () => handleLeaveRoom());
        const unsubscribeKick = signalingClient.on('kick_participant', () => handleLeaveRoom());

        initializeSFU();

        return () => {
            unsubscribeJoined();
            unsubscribeLeft();
            unsubscribeChat();
            unsubscribeEnd();
            unsubscribeKick();
        };
    }, [roomId]);

    const handleToggleAudio = async () => {
        toggleAudio();
        const stream = useMediaStore.getState().localStream;
        if (stream) {
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !mediaState.audioEnabled;
                // In SFU, we could also pause the producer
            }
        }
    };

    const handleToggleVideo = async () => {
        toggleVideo();
        const stream = useMediaStore.getState().localStream;
        if (stream) {
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !mediaState.videoEnabled;
            }
        }
    };

    const handleScreenShare = async () => {
        if (mediaState.screenSharing) {
            // Stop screen share
            if (screenStreamRef.current) {
                screenStreamRef.current.getTracks().forEach(t => t.stop())
                screenStreamRef.current = null
            }
            setScreenSharing(false)
            signalingClient.send('stop_screen_share', {}, { roomId })
        } else {
            try {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: { echoCancellation: true, noiseSuppression: true },
                })
                screenStreamRef.current = screenStream
                const screenTrack = screenStream.getVideoTracks()[0]

                // Produce screen track via SFU
                if (screenTrack) {
                    await sfuMedia.shareScreen(screenTrack)
                    // Auto-stop when user clicks browser's "Stop sharing" button
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
        if (room?.meetingCode) {
            navigator.clipboard.writeText(room.meetingCode)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    return (
        <div className="h-screen flex flex-col bg-[#0f172a] text-slate-200">
            {/* Header */}
            <header className="px-6 py-4 bg-slate-900/50 backdrop-blur-md border-b border-white/5 flex justify-between items-center">
                <div>
                    <h1 className="text-lg font-semibold text-white">
                        {room?.name || 'Meeting Room'}
                    </h1>
                    <button
                        onClick={handleCopyMeetingCode}
                        className="flex items-center gap-2 text-slate-400 text-sm hover:text-white transition-colors"
                    >
                        {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        {room?.meetingCode || 'Loading...'}
                    </button>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-sm bg-white/5 px-3 py-1 rounded-full border border-white/5">
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
                    title={mediaState.screenSharing ? 'Stop screen share' : 'Share screen'}
                    className={`p-4 rounded-2xl transition-all duration-200 ${
                        mediaState.screenSharing 
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
