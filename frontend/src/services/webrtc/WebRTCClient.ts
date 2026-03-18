/**
 * WebRTC configuration and utilities
 */
export const rtcConfig: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // TURN servers for NAT traversal - using public TURN servers
        // In production, replace with your own TURN server (e.g., coturn)
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject',
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject',
        },
    ],
    iceCandidatePoolSize: 10,
}

/**
 * Media constraints for video calls
 */
export const defaultMediaConstraints: MediaStreamConstraints = {
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
    },
    video: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 60 },
        facingMode: 'user',
    },
}

/**
 * Screen share constraints
 */
export const screenShareConstraints: DisplayMediaStreamOptions = {
    video: true,
    audio: {
        echoCancellation: true,
        noiseSuppression: true,
    },
}

/**
 * WebRTC client for managing peer connections
 */
export class WebRTCClient {
    private localStream: MediaStream | null = null
    private screenStream: MediaStream | null = null
    private peerConnections: Map<string, RTCPeerConnection> = new Map()
    private remoteStreams: Map<string, MediaStream> = new Map()
    private onRemoteStreamCallback: ((participantId: string, stream: MediaStream) => void) | null = null
    private onIceCandidateCallback: ((participantId: string, candidate: RTCIceCandidate) => void) | null = null
    private onScreenShareEndedCallback: (() => void) | null = null

    private mediaReadyResolver: (() => void) | null = null
    private mediaReadyPromise = new Promise<void>((resolve) => {
        this.mediaReadyResolver = resolve
    })

    /**
     * Wait for local media to be initialized before creating peer connections
     */
    async waitForMedia(): Promise<void> {
        if (this.localStream) return
        return this.mediaReadyPromise
    }

    /**
     * Get user media (camera + microphone)
     */
    async getUserMedia(constraints: MediaStreamConstraints = defaultMediaConstraints): Promise<MediaStream> {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia(constraints)
            if (this.mediaReadyResolver) {
                this.mediaReadyResolver()
                this.mediaReadyResolver = null
            }
            return this.localStream
        } catch (error) {
            console.error('Failed to get user media:', error)
            // Resolve anyway to unblock signaling if they deny permissions
            if (this.mediaReadyResolver) {
                this.mediaReadyResolver()
                this.mediaReadyResolver = null
            }
            throw error
        }
    }

    /**
     * Get display media (screen share)
     */
    async getDisplayMedia(): Promise<MediaStream> {
        try {
            this.screenStream = await navigator.mediaDevices.getDisplayMedia(screenShareConstraints)
            return this.screenStream
        } catch (error) {
            console.error('Failed to get display media:', error)
            throw error
        }
    }

    /**
     * Start screen sharing - replaces video track in all peer connections
     */
    async startScreenShare(): Promise<MediaStream> {
        try {
            // Get screen share stream
            this.screenStream = await navigator.mediaDevices.getDisplayMedia(screenShareConstraints)

            // Replace video track in all peer connections
            const screenVideoTrack = this.screenStream.getVideoTracks()[0]
            if (screenVideoTrack) {
                const promises = Array.from(this.peerConnections.values()).map(pc => {
                    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video')
                    if (sender) {
                        return sender.replaceTrack(screenVideoTrack)
                    }
                    return Promise.resolve()
                })
                await Promise.all(promises)

                // Handle screen share end (user clicks "Stop sharing" in browser UI)
                screenVideoTrack.onended = () => {
                    this.stopScreenShare()
                    if (this.onScreenShareEndedCallback) {
                        this.onScreenShareEndedCallback()
                    }
                }
            }

            return this.screenStream
        } catch (error) {
            console.error('Failed to start screen share:', error)
            throw error
        }
    }

    /**
     * Stop screen sharing and restore camera video
     */
    stopScreenShare(): void {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop())
            this.screenStream = null
        }

        // Restore camera video track in all peer connections
        if (this.localStream) {
            const cameraVideoTrack = this.localStream.getVideoTracks()[0]
            if (cameraVideoTrack) {
                const promises = Array.from(this.peerConnections.values()).map(pc => {
                    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video')
                    if (sender) {
                        return sender.replaceTrack(cameraVideoTrack)
                    }
                    return Promise.resolve()
                })
                // We fire and forget here since it's synchronous cleanup
                Promise.all(promises).catch(console.error)
            }
        }
    }

    /**
     * Get local stream
     */
    getLocalStream(): MediaStream | null {
        return this.localStream
    }

    /**
     * Get screen stream
     */
    getScreenStream(): MediaStream | null {
        return this.screenStream
    }

    /**
     * Toggle audio track
     */
    toggleAudio(enabled: boolean): void {
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = enabled
            })
        }
    }

    /**
     * Toggle video track
     */
    toggleVideo(enabled: boolean): void {
        if (this.localStream) {
            this.localStream.getVideoTracks().forEach(track => {
                track.enabled = enabled
            })
        }
    }

    /**
     * Set callback for remote streams
     */
    onRemoteStream(callback: (participantId: string, stream: MediaStream) => void): void {
        this.onRemoteStreamCallback = callback
    }

    /**
     * Set callback for ICE candidates
     */
    onIceCandidate(callback: (participantId: string, candidate: RTCIceCandidate) => void): void {
        this.onIceCandidateCallback = callback
    }

    /**
     * Set callback for screen share ended event
     */
    onScreenShareEnded(callback: () => void): void {
        this.onScreenShareEndedCallback = callback
    }

    /**
     * Create a peer connection for a participant
     */
    createPeerConnection(participantId: string): RTCPeerConnection {
        const pc = new RTCPeerConnection(rtcConfig)

        // Add local tracks (use screen share if active, otherwise camera)
        if (this.screenStream) {
            // Screen tracking usually only has video, we need to grab the audio from the local camera
            if (this.localStream) {
                this.localStream.getAudioTracks().forEach(track => pc.addTrack(track, this.localStream!))
            }
            this.screenStream.getVideoTracks().forEach(track => pc.addTrack(track, this.screenStream!))
        } else if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream!)
            })
        }

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate && this.onIceCandidateCallback) {
                this.onIceCandidateCallback(participantId, event.candidate)
            }
        }

        // Handle remote tracks
        pc.ontrack = (event) => {
            let stream = this.remoteStreams.get(participantId)
            if (!stream) {
                stream = new MediaStream()
                this.remoteStreams.set(participantId, stream)
            }
            stream.addTrack(event.track)

            if (this.onRemoteStreamCallback) {
                this.onRemoteStreamCallback(participantId, stream)
            }
        }

        pc.onconnectionstatechange = () => {
            console.log(`Connection state for ${participantId}:`, pc.connectionState)
        }

        this.peerConnections.set(participantId, pc)
        return pc
    }

    /**
     * Get existing peer connection
     */
    getPeerConnection(participantId: string): RTCPeerConnection | undefined {
        return this.peerConnections.get(participantId)
    }

    /**
     * Create an offer for a participant
     */
    async createOffer(participantId: string): Promise<RTCSessionDescriptionInit> {
        await this.waitForMedia()
        let pc = this.peerConnections.get(participantId)
        if (!pc) {
            pc = this.createPeerConnection(participantId)
        }

        const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
        })
        await pc.setLocalDescription(offer)
        return offer
    }

    /**
     * Handle an offer from a participant
     */
    async handleOffer(participantId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
        await this.waitForMedia()
        let pc = this.peerConnections.get(participantId)
        if (!pc) {
            pc = this.createPeerConnection(participantId)
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        return answer
    }

    /**
     * Handle an answer from a participant
     */
    async handleAnswer(participantId: string, answer: RTCSessionDescriptionInit): Promise<void> {
        const pc = this.peerConnections.get(participantId)
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer))
        }
    }

    /**
     * Add ICE candidate
     */
    async addIceCandidate(participantId: string, candidate: RTCIceCandidateInit): Promise<void> {
        const pc = this.peerConnections.get(participantId)
        if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
        }
    }

    /**
     * Close a peer connection
     */
    closePeerConnection(participantId: string): void {
        const pc = this.peerConnections.get(participantId)
        if (pc) {
            pc.close()
            this.peerConnections.delete(participantId)
            this.remoteStreams.delete(participantId)
        }
    }

    /**
     * Close all connections and stop streams
     */
    cleanup(): void {
        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop())
            this.localStream = null
        }

        // Stop screen stream
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop())
            this.screenStream = null
        }

        // Close all peer connections
        this.peerConnections.forEach((pc) => pc.close())
        this.peerConnections.clear()
        this.remoteStreams.clear()
    }

    /**
     * Get available media devices
     */
    static async getDevices(): Promise<{
        audioInputs: MediaDeviceInfo[]
        videoInputs: MediaDeviceInfo[]
        audioOutputs: MediaDeviceInfo[]
    }> {
        const devices = await navigator.mediaDevices.enumerateDevices()
        return {
            audioInputs: devices.filter(d => d.kind === 'audioinput'),
            videoInputs: devices.filter(d => d.kind === 'videoinput'),
            audioOutputs: devices.filter(d => d.kind === 'audiooutput'),
        }
    }
}

// Singleton instance
export const webRTCClient = new WebRTCClient()
