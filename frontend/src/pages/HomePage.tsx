import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Video, Users, Shield, Zap, ArrowRight, Plus, LogIn } from 'lucide-react'
import { useAuthStore } from '../store/useAuthStore'
import { useRoomStore } from '../store/useRoomStore'
import { signalingClient } from '../services/signaling/SignalingClient'

export default function HomePage() {
    const navigate = useNavigate()
    const { isAuthenticated, user } = useAuthStore()
    const { setRoom, setLocalParticipant } = useRoomStore()
    const [meetingCode, setMeetingCode] = useState('')
    const [roomName, setRoomName] = useState('')
    const [userName, setUserName] = useState('')
    const [isCreating, setIsCreating] = useState(false)
    const [isJoining, setIsJoining] = useState(false)
    const [showJoinModal, setShowJoinModal] = useState(false)
    const [showCreateModal, setShowCreateModal] = useState(false)

    const handleCreateRoom = async () => {
        if (!roomName.trim() || !userName.trim()) return

        setIsCreating(true)
        try {
            await signalingClient.connect()

            signalingClient.on('room_created', (msg) => {
                const roomData = msg.payload as any
                const localParticipant = roomData.participants.find((p: any) => p.id === msg.senderId)
                if (localParticipant) {
                    setLocalParticipant(localParticipant)
                }
                setRoom(roomData)
                navigate(`/room/${roomData.id}`)
            })

            signalingClient.on('error', (msg) => {
                console.error('Error creating room:', msg.payload.error)
                setIsCreating(false)
            })

            signalingClient.send('create_room', {
                name: roomName,
                hostName: userName,
            })
        } catch (error) {
            console.error('Failed to create room:', error)
            setIsCreating(false)
        }
    }

    const handleJoinRoom = async () => {
        if (!meetingCode.trim() || !userName.trim()) return

        setIsJoining(true)
        try {
            await signalingClient.connect()

            signalingClient.on('room_joined', (msg) => {
                const roomData = msg.payload as any
                const localParticipant = roomData.participants.find((p: any) => p.id === msg.senderId)
                if (localParticipant) {
                    setLocalParticipant(localParticipant)
                }
                setRoom(roomData)
                navigate(`/room/${roomData.id}`)
            })

            signalingClient.on('error', (msg) => {
                console.error('Error joining room:', msg.payload.error)
                setIsJoining(false)
            })

            signalingClient.send('join_room', {
                meetingCode: meetingCode,
                name: userName,
            })
        } catch (error) {
            console.error('Failed to join room:', error)
            setIsJoining(false)
        }
    }

    return (
        <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 50%, #16213e 100%)' }}>
            {/* Header */}
            <header style={{
                padding: 'var(--spacing-lg) var(--spacing-xl)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                    <Video size={32} color="var(--color-primary)" />
                    <span style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>Roaya</span>
                </div>

                {isAuthenticated ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>
                            Welcome, {user?.name}
                        </span>
                    </div>
                ) : (
                    <button
                        className="btn btn-ghost"
                        onClick={() => navigate('/login')}
                    >
                        <LogIn size={18} />
                        Sign In
                    </button>
                )}
            </header>

            {/* Hero Section */}
            <main style={{
                maxWidth: '1200px',
                margin: '0 auto',
                padding: 'var(--spacing-2xl) var(--spacing-lg)',
                textAlign: 'center'
            }}>
                <h1 style={{
                    fontSize: 'clamp(2.5rem, 5vw, 4rem)',
                    fontWeight: 800,
                    lineHeight: 1.1,
                    marginBottom: 'var(--spacing-lg)'
                }}>
                    <span className="text-gradient">Crystal Clear</span>
                    <br />
                    Video Meetings
                </h1>

                <p style={{
                    fontSize: 'var(--font-size-lg)',
                    color: 'var(--color-text-secondary)',
                    maxWidth: '600px',
                    margin: '0 auto var(--spacing-2xl)'
                }}>
                    Connect with up to 50 participants in high-quality video calls.
                    No downloads required – just click and join.
                </p>

                {/* Action Buttons */}
                <div style={{
                    display: 'flex',
                    gap: 'var(--spacing-md)',
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                    marginBottom: 'var(--spacing-2xl)'
                }}>
                    <button
                        className="btn btn-primary btn-lg"
                        onClick={() => setShowCreateModal(true)}
                        style={{ minWidth: '200px' }}
                    >
                        <Plus size={20} />
                        New Meeting
                    </button>
                    <button
                        className="btn btn-ghost btn-lg"
                        onClick={() => setShowJoinModal(true)}
                        style={{ minWidth: '200px' }}
                    >
                        <ArrowRight size={20} />
                        Join Meeting
                    </button>
                </div>

                {/* Features */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: 'var(--spacing-lg)',
                    marginTop: 'var(--spacing-2xl)'
                }}>
                    <FeatureCard
                        icon={<Users />}
                        title="50 Participants"
                        description="Host large meetings with up to 50 people in a single room"
                    />
                    <FeatureCard
                        icon={<Shield />}
                        title="Secure & Private"
                        description="End-to-end encryption keeps your conversations safe"
                    />
                    <FeatureCard
                        icon={<Zap />}
                        title="Ultra Low Latency"
                        description="Powered by C++ backend for blazing fast performance"
                    />
                </div>
            </main>

            {/* Join Modal */}
            {showJoinModal && (
                <div className="modal-overlay animate-fade-in" onClick={() => setShowJoinModal(false)}>
                    <div className="modal animate-slide-up" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Join Meeting</h2>
                            <button
                                className="btn btn-ghost btn-icon"
                                onClick={() => setShowJoinModal(false)}
                            >
                                ×
                            </button>
                        </div>
                        <div className="modal-body">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 'var(--spacing-xs)', fontSize: 'var(--font-size-sm)' }}>
                                        Meeting Code
                                    </label>
                                    <input
                                        className="input"
                                        placeholder="Enter meeting code (e.g., 123-456-7890)"
                                        value={meetingCode}
                                        onChange={(e) => setMeetingCode(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 'var(--spacing-xs)', fontSize: 'var(--font-size-sm)' }}>
                                        Your Name
                                    </label>
                                    <input
                                        className="input"
                                        placeholder="Enter your name"
                                        value={userName}
                                        onChange={(e) => setUserName(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setShowJoinModal(false)}>
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleJoinRoom}
                                disabled={isJoining || !meetingCode.trim() || !userName.trim()}
                            >
                                {isJoining ? 'Joining...' : 'Join'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Modal */}
            {showCreateModal && (
                <div className="modal-overlay animate-fade-in" onClick={() => setShowCreateModal(false)}>
                    <div className="modal animate-slide-up" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">Create Meeting</h2>
                            <button
                                className="btn btn-ghost btn-icon"
                                onClick={() => setShowCreateModal(false)}
                            >
                                ×
                            </button>
                        </div>
                        <div className="modal-body">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 'var(--spacing-xs)', fontSize: 'var(--font-size-sm)' }}>
                                        Meeting Name
                                    </label>
                                    <input
                                        className="input"
                                        placeholder="Enter meeting name"
                                        value={roomName}
                                        onChange={(e) => setRoomName(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 'var(--spacing-xs)', fontSize: 'var(--font-size-sm)' }}>
                                        Your Name
                                    </label>
                                    <input
                                        className="input"
                                        placeholder="Enter your name"
                                        value={userName}
                                        onChange={(e) => setUserName(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleCreateRoom}
                                disabled={isCreating || !roomName.trim() || !userName.trim()}
                            >
                                {isCreating ? 'Creating...' : 'Create & Join'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function FeatureCard({ icon, title, description }: {
    icon: React.ReactNode
    title: string
    description: string
}) {
    return (
        <div className="card card-glass" style={{ textAlign: 'left' }}>
            <div style={{
                width: '48px',
                height: '48px',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-primary-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary)',
                marginBottom: 'var(--spacing-md)'
            }}>
                {icon}
            </div>
            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--spacing-sm)' }}>
                {title}
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                {description}
            </p>
        </div>
    )
}
