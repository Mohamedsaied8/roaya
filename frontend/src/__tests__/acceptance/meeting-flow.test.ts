/**
 * Acceptance Tests for Meeting Flow, Media, and Signaling
 * 
 * These tests verify the core meeting functionality:
 * - Room creation and joining
 * - WebSocket signaling message flow
 * - WebRTC peer connection setup
 * - Microphone/Camera/Screen share APIs
 * 
 * Run: npx vitest run src/__tests__/acceptance/meeting-flow.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SignalingClient } from '../../services/signaling/SignalingClient'
import { WebRTCClient, defaultMediaConstraints, screenShareConstraints } from '../../services/webrtc/WebRTCClient'

// ============================================================================
// Test 1: SignalingClient WebSocket Connection
// ============================================================================
describe('SignalingClient', () => {
    let mockWs: any
    let originalWebSocket: typeof WebSocket

    beforeEach(() => {
        originalWebSocket = globalThis.WebSocket
        mockWs = {
            send: vi.fn(),
            close: vi.fn(),
            readyState: 1, // OPEN
            onopen: null as any,
            onclose: null as any,
            onerror: null as any,
            onmessage: null as any,
        }
        globalThis.WebSocket = vi.fn(() => mockWs) as any
            ; (globalThis.WebSocket as any).OPEN = 1
    })

    afterEach(() => {
        globalThis.WebSocket = originalWebSocket
    })

    // AC-1: Client should connect to WebSocket at dynamic hostname
    it('AC-1: should connect to ws://<hostname>:8081 by default', () => {
        const client = new SignalingClient()
        client.connect()
        expect(globalThis.WebSocket).toHaveBeenCalledWith(
            `ws://${window.location.hostname}:8081`
        )
    })

    // AC-2: Client should allow custom WebSocket URL
    it('AC-2: should accept a custom WebSocket URL', () => {
        const client = new SignalingClient('ws://192.168.1.10:8081')
        client.connect()
        expect(globalThis.WebSocket).toHaveBeenCalledWith('ws://192.168.1.10:8081')
    })

    // AC-3: Client should resolve connect() promise on open
    it('AC-3: should resolve connect promise when WebSocket opens', async () => {
        const client = new SignalingClient()
        const connectPromise = client.connect()

        // Simulate WebSocket open
        mockWs.onopen()

        await expect(connectPromise).resolves.toBeUndefined()
    })

    // AC-4: Client should send properly formatted create_room message
    it('AC-4: should send create_room message with correct structure', async () => {
        const client = new SignalingClient()
        const connectPromise = client.connect()
        mockWs.onopen()
        await connectPromise

        client.send('create_room', {
            name: 'Test Meeting',
            hostName: 'Alice',
        })

        expect(mockWs.send).toHaveBeenCalledTimes(1)
        const sentData = JSON.parse(mockWs.send.mock.calls[0][0])

        expect(sentData).toMatchObject({
            type: 'create_room',
            payload: {
                name: 'Test Meeting',
                hostName: 'Alice',
            },
        })
        expect(sentData).toHaveProperty('timestamp')
    })

    // AC-5: Client should send join_room with meeting code
    it('AC-5: should send join_room message with meeting code', async () => {
        const client = new SignalingClient()
        const connectPromise = client.connect()
        mockWs.onopen()
        await connectPromise

        client.send('join_room', {
            meetingCode: '123-456-7890',
            name: 'Bob',
        })

        const sentData = JSON.parse(mockWs.send.mock.calls[0][0])
        expect(sentData).toMatchObject({
            type: 'join_room',
            payload: {
                meetingCode: '123-456-7890',
                name: 'Bob',
            },
        })
    })

    // AC-6: Client should dispatch room_created event to handlers
    it('AC-6: should dispatch incoming room_created message to registered handler', async () => {
        const client = new SignalingClient()
        const connectPromise = client.connect()
        mockWs.onopen()
        await connectPromise

        const handler = vi.fn()
        client.on('room_created', handler)

        // Simulate server response
        const serverMessage = {
            type: 'room_created',
            roomId: 'abc123',
            senderId: 'user1_p',
            payload: {
                id: 'abc123',
                name: 'Test Meeting',
                meetingCode: '123-456-7890',
            },
            timestamp: Date.now(),
        }
        mockWs.onmessage({ data: JSON.stringify(serverMessage) })

        expect(handler).toHaveBeenCalledTimes(1)
        expect(handler).toHaveBeenCalledWith(expect.objectContaining({
            type: 'room_created',
            roomId: 'abc123',
        }))
    })

    // AC-7: Client should dispatch room_joined event
    it('AC-7: should dispatch incoming room_joined message to handler', async () => {
        const client = new SignalingClient()
        const connectPromise = client.connect()
        mockWs.onopen()
        await connectPromise

        const handler = vi.fn()
        client.on('room_joined', handler)

        const serverMessage = {
            type: 'room_joined',
            roomId: 'abc123',
            senderId: 'user2_p',
            payload: {
                id: 'abc123',
                name: 'Test Meeting',
                participants: [],
            },
            timestamp: Date.now(),
        }
        mockWs.onmessage({ data: JSON.stringify(serverMessage) })

        expect(handler).toHaveBeenCalledTimes(1)
        expect(handler.mock.calls[0][0].roomId).toBe('abc123')
    })

    // AC-8: Client should dispatch participant_joined event
    it('AC-8: should dispatch participant_joined to registered handler', async () => {
        const client = new SignalingClient()
        const connectPromise = client.connect()
        mockWs.onopen()
        await connectPromise

        const handler = vi.fn()
        client.on('participant_joined', handler)

        const serverMessage = {
            type: 'participant_joined',
            roomId: 'abc123',
            senderId: 'user2_p',
            payload: {
                id: 'user2_p',
                name: 'Bob',
                role: 'participant',
                audioMuted: true,
                videoMuted: true,
            },
            timestamp: Date.now(),
        }
        mockWs.onmessage({ data: JSON.stringify(serverMessage) })

        expect(handler).toHaveBeenCalledTimes(1)
        expect(handler.mock.calls[0][0].payload.name).toBe('Bob')
    })

    // AC-9: Client should forward SDP offer/answer with targetId
    it('AC-9: should send sdp_offer with roomId and targetId', async () => {
        const client = new SignalingClient()
        const connectPromise = client.connect()
        mockWs.onopen()
        await connectPromise

        client.send('sdp_offer', {
            sdp: 'v=0\r\no=- ...',
            type: 'offer',
        }, { roomId: 'abc123', targetId: 'user2_p' })

        const sentData = JSON.parse(mockWs.send.mock.calls[0][0])
        expect(sentData.type).toBe('sdp_offer')
        expect(sentData.roomId).toBe('abc123')
        expect(sentData.targetId).toBe('user2_p')
        expect(sentData.payload.sdp).toBeDefined()
    })

    // AC-10: Client should forward ICE candidates with targetId
    it('AC-10: should send ice_candidate with targetId', async () => {
        const client = new SignalingClient()
        const connectPromise = client.connect()
        mockWs.onopen()
        await connectPromise

        client.send('ice_candidate', {
            candidate: 'candidate:1 1 UDP ...',
            sdpMLineIndex: 0,
            sdpMid: 'audio',
        }, { roomId: 'abc123', targetId: 'user2_p' })

        const sentData = JSON.parse(mockWs.send.mock.calls[0][0])
        expect(sentData.type).toBe('ice_candidate')
        expect(sentData.targetId).toBe('user2_p')
    })

    // AC-11: Client should send media_state_change
    it('AC-11: should send media_state_change message', async () => {
        const client = new SignalingClient()
        const connectPromise = client.connect()
        mockWs.onopen()
        await connectPromise

        client.send('media_state_change', {
            audioMuted: true,
        }, { roomId: 'abc123' })

        const sentData = JSON.parse(mockWs.send.mock.calls[0][0])
        expect(sentData.type).toBe('media_state_change')
        expect(sentData.payload.audioMuted).toBe(true)
    })

    // AC-12: Client should handle unsubscribe correctly
    it('AC-12: should stop receiving events after unsubscribe', async () => {
        const client = new SignalingClient()
        const connectPromise = client.connect()
        mockWs.onopen()
        await connectPromise

        const handler = vi.fn()
        const unsubscribe = client.on('chat_message', handler)

        const msg = {
            type: 'chat_message',
            roomId: 'abc123',
            senderId: 'user1_p',
            payload: { message: 'Hello' },
            timestamp: Date.now(),
        }
        mockWs.onmessage({ data: JSON.stringify(msg) })
        expect(handler).toHaveBeenCalledTimes(1)

        unsubscribe()

        mockWs.onmessage({ data: JSON.stringify(msg) })
        expect(handler).toHaveBeenCalledTimes(1) // still 1, not 2
    })

    // AC-13: Client should not send when disconnected
    it('AC-13: should log error when sending on disconnected socket', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
        const client = new SignalingClient()
        // Not connected
        client.send('create_room', { name: 'Test' })
        expect(consoleSpy).toHaveBeenCalledWith('WebSocket not connected')
        consoleSpy.mockRestore()
    })

    // AC-14: Client should handle leave_room message
    it('AC-14: should send leave_room message', async () => {
        const client = new SignalingClient()
        const connectPromise = client.connect()
        mockWs.onopen()
        await connectPromise

        client.send('leave_room', {}, { roomId: 'abc123' })

        const sentData = JSON.parse(mockWs.send.mock.calls[0][0])
        expect(sentData.type).toBe('leave_room')
        expect(sentData.roomId).toBe('abc123')
    })

    // AC-15: Client should handle screen share messages
    it('AC-15: should send start_screen_share and stop_screen_share messages', async () => {
        const client = new SignalingClient()
        const connectPromise = client.connect()
        mockWs.onopen()
        await connectPromise

        client.send('start_screen_share', {}, { roomId: 'abc123' })
        client.send('stop_screen_share', {}, { roomId: 'abc123' })

        expect(JSON.parse(mockWs.send.mock.calls[0][0]).type).toBe('start_screen_share')
        expect(JSON.parse(mockWs.send.mock.calls[1][0]).type).toBe('stop_screen_share')
    })
})

// ============================================================================
// Test 2: WebRTCClient Media APIs
// ============================================================================
describe('WebRTCClient', () => {
    let client: WebRTCClient
    let mockStream: MediaStream

    beforeEach(() => {
        client = new WebRTCClient()

        // Mock MediaStream
        mockStream = {
            getTracks: vi.fn(() => [
                { kind: 'audio', enabled: true, stop: vi.fn() },
                { kind: 'video', enabled: true, stop: vi.fn() },
            ]),
            getAudioTracks: vi.fn(() => [
                { kind: 'audio', enabled: true, stop: vi.fn() },
            ]),
            getVideoTracks: vi.fn(() => [
                { kind: 'video', enabled: true, stop: vi.fn() },
            ]),
        } as unknown as MediaStream

        // Mock navigator.mediaDevices
        Object.defineProperty(globalThis.navigator, 'mediaDevices', {
            value: {
                getUserMedia: vi.fn().mockResolvedValue(mockStream),
                getDisplayMedia: vi.fn().mockResolvedValue(mockStream),
                enumerateDevices: vi.fn().mockResolvedValue([
                    { kind: 'audioinput', deviceId: 'mic1', label: 'Microphone' },
                    { kind: 'videoinput', deviceId: 'cam1', label: 'Camera' },
                    { kind: 'audiooutput', deviceId: 'spk1', label: 'Speaker' },
                ]),
            },
            writable: true,
            configurable: true,
        })
    })

    // AC-16: getUserMedia should acquire camera and microphone
    it('AC-16: getUserMedia should call browser API with proper constraints', async () => {
        const stream = await client.getUserMedia()

        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
            defaultMediaConstraints
        )
        expect(stream).toBe(mockStream)
    })

    // AC-17: getUserMedia should include echo cancellation and noise suppression
    it('AC-17: default constraints should include echo cancellation and noise suppression', () => {
        const audio = defaultMediaConstraints.audio as MediaTrackConstraints
        expect(audio.echoCancellation).toBe(true)
        expect(audio.noiseSuppression).toBe(true)
        expect(audio.autoGainControl).toBe(true)
    })

    // AC-18: Video constraints should request HD resolution
    it('AC-18: default video constraints should target 720p resolution', () => {
        const video = defaultMediaConstraints.video as MediaTrackConstraints
        expect((video.width as ConstrainULongRange).ideal).toBe(1280)
        expect((video.height as ConstrainULongRange).ideal).toBe(720)
    })

    // AC-19: getDisplayMedia should acquire screen share stream
    it('AC-19: getDisplayMedia should call browser screen share API', async () => {
        const stream = await client.getDisplayMedia()

        expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith(
            screenShareConstraints
        )
        expect(stream).toBe(mockStream)
    })

    // AC-20: stopScreenShare should stop all tracks on screen stream
    it('AC-20: stopScreenShare should stop all screen stream tracks', async () => {
        const stopFn = vi.fn()
        const screenStream = {
            getTracks: vi.fn(() => [
                { stop: stopFn },
                { stop: stopFn },
            ]),
        } as unknown as MediaStream

            ; (navigator.mediaDevices.getDisplayMedia as any).mockResolvedValueOnce(screenStream)

        await client.getDisplayMedia()
        client.stopScreenShare()

        expect(stopFn).toHaveBeenCalledTimes(2)
        expect(client.getScreenStream()).toBeNull()
    })

    // AC-21: toggleAudio should enable/disable audio tracks
    it('AC-21: toggleAudio should toggle audio track enabled state', async () => {
        const audioTrack = { kind: 'audio', enabled: true, stop: vi.fn() }
        const localStream = {
            getTracks: vi.fn(() => [audioTrack]),
            getAudioTracks: vi.fn(() => [audioTrack]),
            getVideoTracks: vi.fn(() => []),
        } as unknown as MediaStream

            ; (navigator.mediaDevices.getUserMedia as any).mockResolvedValueOnce(localStream)
        await client.getUserMedia()

        client.toggleAudio(false)
        expect(audioTrack.enabled).toBe(false)

        client.toggleAudio(true)
        expect(audioTrack.enabled).toBe(true)
    })

    // AC-22: toggleVideo should enable/disable video tracks
    it('AC-22: toggleVideo should toggle video track enabled state', async () => {
        const videoTrack = { kind: 'video', enabled: true, stop: vi.fn() }
        const localStream = {
            getTracks: vi.fn(() => [videoTrack]),
            getAudioTracks: vi.fn(() => []),
            getVideoTracks: vi.fn(() => [videoTrack]),
        } as unknown as MediaStream

            ; (navigator.mediaDevices.getUserMedia as any).mockResolvedValueOnce(localStream)
        await client.getUserMedia()

        client.toggleVideo(false)
        expect(videoTrack.enabled).toBe(false)

        client.toggleVideo(true)
        expect(videoTrack.enabled).toBe(true)
    })

    // AC-23: getDevices should enumerate audio and video devices
    it('AC-23: getDevices should return categorized device lists', async () => {
        const devices = await WebRTCClient.getDevices()

        expect(devices.audioInputs).toHaveLength(1)
        expect(devices.videoInputs).toHaveLength(1)
        expect(devices.audioOutputs).toHaveLength(1)
        expect(devices.audioInputs[0].kind).toBe('audioinput')
        expect(devices.videoInputs[0].kind).toBe('videoinput')
    })

    // AC-24: cleanup should stop all streams and close all connections
    it('AC-24: cleanup should stop all tracks and close all peer connections', async () => {
        const audioStop = vi.fn()
        const videoStop = vi.fn()
        const localStream = {
            getTracks: vi.fn(() => [
                { stop: audioStop },
                { stop: videoStop },
            ]),
            getAudioTracks: vi.fn(() => []),
            getVideoTracks: vi.fn(() => []),
        } as unknown as MediaStream

            ; (navigator.mediaDevices.getUserMedia as any).mockResolvedValueOnce(localStream)
        await client.getUserMedia()

        client.cleanup()

        expect(audioStop).toHaveBeenCalled()
        expect(videoStop).toHaveBeenCalled()
        expect(client.getLocalStream()).toBeNull()
    })

    // AC-25: getUserMedia should throw an error if permission denied
    it('AC-25: getUserMedia should propagate permission denied error', async () => {
        const error = new Error('Permission denied')
            ; (navigator.mediaDevices.getUserMedia as any).mockRejectedValueOnce(error)

        await expect(client.getUserMedia()).rejects.toThrow('Permission denied')
    })

    // AC-26: getDisplayMedia should throw on user cancel
    it('AC-26: getDisplayMedia should propagate user cancellation error', async () => {
        const error = new Error('The request is not allowed')
            ; (navigator.mediaDevices.getDisplayMedia as any).mockRejectedValueOnce(error)

        await expect(client.getDisplayMedia()).rejects.toThrow('The request is not allowed')
    })
})

// ============================================================================
// Test 3: WebRTCClient Peer Connections
// ============================================================================
describe('WebRTCClient Peer Connections', () => {
    let client: WebRTCClient
    let mockPc: any

    beforeEach(() => {
        client = new WebRTCClient()

        mockPc = {
            addTrack: vi.fn(),
            createOffer: vi.fn().mockResolvedValue({ sdp: 'offer-sdp', type: 'offer' }),
            createAnswer: vi.fn().mockResolvedValue({ sdp: 'answer-sdp', type: 'answer' }),
            setLocalDescription: vi.fn(),
            setRemoteDescription: vi.fn(),
            addIceCandidate: vi.fn(),
            close: vi.fn(),
            onicecandidate: null,
            ontrack: null,
            onconnectionstatechange: null,
            connectionState: 'new',
        }

        globalThis.RTCPeerConnection = vi.fn(() => mockPc) as any
        globalThis.RTCSessionDescription = vi.fn((desc) => desc) as any
        globalThis.RTCIceCandidate = vi.fn((c) => c) as any
    })

    // AC-27: createOffer should create peer connection and return SDP offer
    it('AC-27: createOffer should produce a valid SDP offer', async () => {
        const offer = await client.createOffer('participant-2')

        expect(globalThis.RTCPeerConnection).toHaveBeenCalled()
        expect(mockPc.createOffer).toHaveBeenCalledWith({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
        })
        expect(mockPc.setLocalDescription).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'offer' })
        )
        expect(offer.sdp).toBe('offer-sdp')
        expect(offer.type).toBe('offer')
    })

    // AC-28: handleOffer should set remote description and return answer
    it('AC-28: handleOffer should create and return SDP answer', async () => {
        const offer = { sdp: 'remote-offer-sdp', type: 'offer' as RTCSdpType }
        const answer = await client.handleOffer('participant-1', offer)

        expect(mockPc.setRemoteDescription).toHaveBeenCalled()
        expect(mockPc.createAnswer).toHaveBeenCalled()
        expect(mockPc.setLocalDescription).toHaveBeenCalled()
        expect(answer.sdp).toBe('answer-sdp')
        expect(answer.type).toBe('answer')
    })

    // AC-29: handleAnswer should set remote description on existing peer connection
    it('AC-29: handleAnswer should set remote description', async () => {
        // First create the peer connection via createOffer
        await client.createOffer('participant-2')

        const answer = { sdp: 'remote-answer-sdp', type: 'answer' as RTCSdpType }
        await client.handleAnswer('participant-2', answer)

        expect(mockPc.setRemoteDescription).toHaveBeenCalledWith(
            expect.objectContaining({ sdp: 'remote-answer-sdp' })
        )
    })

    // AC-30: addIceCandidate should add candidate to correct peer connection
    it('AC-30: addIceCandidate should forward to correct peer connection', async () => {
        await client.createOffer('participant-2')

        const candidate = {
            candidate: 'candidate:1 1 UDP 2130706431 ...',
            sdpMLineIndex: 0,
            sdpMid: 'audio',
        }
        await client.addIceCandidate('participant-2', candidate)

        expect(mockPc.addIceCandidate).toHaveBeenCalled()
    })

    // AC-31: ICE candidate callback should fire when local candidates are generated
    it('AC-31: should fire onIceCandidate callback when ICE candidates are generated', async () => {
        const callback = vi.fn()
        client.onIceCandidate(callback)

        await client.createOffer('participant-2')

        // Simulate ICE candidate event
        const fakeCandidate = { candidate: 'candidate:...' }
        mockPc.onicecandidate({ candidate: fakeCandidate })

        expect(callback).toHaveBeenCalledWith('participant-2', fakeCandidate)
    })

    // AC-32: Remote stream callback should fire when remote tracks arrive
    it('AC-32: should fire onRemoteStream callback when remote track arrives', async () => {
        const callback = vi.fn()
        client.onRemoteStream(callback)

        await client.createOffer('participant-2')

        // Simulate remote track event
        const fakeStream = { id: 'remote-stream-1' }
        mockPc.ontrack({ streams: [fakeStream] })

        expect(callback).toHaveBeenCalledWith('participant-2', fakeStream)
    })

    // AC-33: closePeerConnection should close and remove specific connection
    it('AC-33: closePeerConnection should close specific peer connection', async () => {
        await client.createOffer('participant-2')

        client.closePeerConnection('participant-2')

        expect(mockPc.close).toHaveBeenCalled()
        expect(client.getPeerConnection('participant-2')).toBeUndefined()
    })

    // AC-34: cleanup should close all peer connections
    it('AC-34: cleanup should close all peer connections', async () => {
        await client.createOffer('participant-2')
        await client.createOffer('participant-3')

        client.cleanup()

        expect(mockPc.close).toHaveBeenCalledTimes(2)
    })
})

// ============================================================================
// Test 4: Bug Fix Verification Tests
// ============================================================================
describe('Bug Fix Verification', () => {
    let client: WebRTCClient

    beforeEach(() => {
        client = new WebRTCClient()
    })

    // BUG-FIX-1: TURN servers should be configured for NAT traversal
    describe('TURN Server Configuration', () => {
        it('BUG-FIX-1: rtcConfig should include TURN servers for NAT traversal', async () => {
            const { rtcConfig } = await import('../../services/webrtc/WebRTCClient')

            // Should have ICE servers configured
            expect(rtcConfig.iceServers).toBeDefined()
            expect(rtcConfig.iceServers!.length).toBeGreaterThanOrEqual(4) // 2 STUN + 2 TURN

            // Should include STUN servers
            const stunServers = rtcConfig.iceServers!.filter(
                (s: RTCIceServer) => s.urls.toString().startsWith('stun:')
            )
            expect(stunServers.length).toBeGreaterThanOrEqual(2)

            // Should include TURN servers
            const turnServers = rtcConfig.iceServers!.filter(
                (s: RTCIceServer) => s.urls.toString().startsWith('turn:')
            )
            expect(turnServers.length).toBeGreaterThanOrEqual(2)

            // TURN servers should have credentials
            turnServers.forEach((server: RTCIceServer) => {
                expect(server.username).toBeDefined()
                expect(server.credential).toBeDefined()
                expect(server.username).not.toBe('')
                expect(server.credential).not.toBe('')
            })
        })

        it('BUG-FIX-1: TURN servers should use port 80 and 443 for firewall compatibility', async () => {
            const { rtcConfig } = await import('../../services/webrtc/WebRTCClient')

            const turnServers = rtcConfig.iceServers!.filter(
                (s: RTCIceServer) => s.urls.toString().startsWith('turn:')
            )

            // Should have TURN servers on standard ports
            const ports = turnServers.map((s: RTCIceServer) => {
                const match = s.urls.toString().match(/:(\d+)$/)
                return match ? parseInt(match[1]) : null
            })

            expect(ports).toContain(80)   // HTTP port (often allowed through firewalls)
            expect(ports).toContain(443) // HTTPS port (almost always allowed)
        })
    })

    // BUG-FIX-2: Screen sharing should replace tracks in peer connections
    describe('Screen Sharing Track Replacement', () => {
        let mockPc: any
        let mockScreenStream: MediaStream
        let mockLocalStream: MediaStream
        let replaceTrackSpy: any

        beforeEach(() => {
            // Mock screen share stream with video track
            const screenVideoTrack = {
                kind: 'video',
                enabled: true,
                stop: vi.fn(),
                onended: null as any,
            }
            mockScreenStream = {
                getTracks: vi.fn(() => [screenVideoTrack]),
                getVideoTracks: vi.fn(() => [screenVideoTrack]),
            } as unknown as MediaStream

            // Mock local camera stream with video track
            const cameraVideoTrack = {
                kind: 'video',
                enabled: true,
                stop: vi.fn(),
            }
            mockLocalStream = {
                getTracks: vi.fn(() => [cameraVideoTrack]),
                getAudioTracks: vi.fn(() => []),
                getVideoTracks: vi.fn(() => [cameraVideoTrack]),
            } as unknown as MediaStream

            // Mock peer connection with getSenders
            replaceTrackSpy = vi.fn()
            mockPc = {
                addTrack: vi.fn(),
                createOffer: vi.fn().mockResolvedValue({ sdp: 'offer-sdp', type: 'offer' }),
                createAnswer: vi.fn().mockResolvedValue({ sdp: 'answer-sdp', type: 'answer' }),
                setLocalDescription: vi.fn(),
                setRemoteDescription: vi.fn(),
                getSenders: vi.fn(() => [
                    {
                        track: { kind: 'video' },
                        replaceTrack: replaceTrackSpy,
                    },
                    {
                        track: { kind: 'audio' },
                        replaceTrack: vi.fn(),
                    },
                ]),
                close: vi.fn(),
                onicecandidate: null,
                ontrack: null,
                onconnectionstatechange: null,
            }

            globalThis.RTCPeerConnection = vi.fn(() => mockPc) as any
            globalThis.RTCSessionDescription = vi.fn((desc) => desc) as any

            // Mock getUserMedia and getDisplayMedia
            Object.defineProperty(globalThis.navigator, 'mediaDevices', {
                value: {
                    getUserMedia: vi.fn().mockResolvedValue(mockLocalStream),
                    getDisplayMedia: vi.fn().mockResolvedValue(mockScreenStream),
                },
                writable: true,
                configurable: true,
            })
        })

        it('BUG-FIX-2: startScreenShare should replace video track in all peer connections', async () => {
            // Setup: Get local media and create peer connections
            await client.getUserMedia()
            await client.createOffer('participant-1')
            await client.createOffer('participant-2')

            // Reset spy to clear calls from createOffer
            replaceTrackSpy.mockClear()

            // Action: Start screen sharing
            await client.startScreenShare()

            // Assert: replaceTrack should be called for each peer connection
            expect(replaceTrackSpy).toHaveBeenCalledTimes(2)

            // Should replace with screen video track
            const screenVideoTrack = mockScreenStream.getVideoTracks()[0]
            expect(replaceTrackSpy).toHaveBeenCalledWith(screenVideoTrack)
        })

        it('BUG-FIX-2: stopScreenShare should restore camera video track', async () => {
            // Setup
            await client.getUserMedia()
            await client.createOffer('participant-1')
            await client.startScreenShare()

            replaceTrackSpy.mockClear()

            // Action: Stop screen sharing
            client.stopScreenShare()

            // Assert: Should restore camera track
            expect(replaceTrackSpy).toHaveBeenCalled()
            const cameraVideoTrack = mockLocalStream.getVideoTracks()[0]
            expect(replaceTrackSpy).toHaveBeenCalledWith(cameraVideoTrack)
        })

        it('BUG-FIX-2: screen share track onended should trigger callback', async () => {
            // Setup
            const callback = vi.fn()
            client.onScreenShareEnded(callback)

            Object.defineProperty(globalThis.navigator, 'mediaDevices', {
                value: {
                    getUserMedia: vi.fn().mockResolvedValue(mockLocalStream),
                    getDisplayMedia: vi.fn().mockResolvedValue(mockScreenStream),
                },
                writable: true,
                configurable: true,
            })

            await client.startScreenShare()

            // Action: Simulate browser "Stop sharing" button click
            const screenVideoTrack = mockScreenStream.getVideoTracks()[0]
            expect(screenVideoTrack.onended).toBeDefined()
            if (screenVideoTrack.onended) {
                screenVideoTrack.onended(new Event('ended'))
            }

            // Assert: Callback should be fired
            expect(callback).toHaveBeenCalledTimes(1)
        })

        it('BUG-FIX-2: startScreenShare should handle errors gracefully', async () => {
            // Setup: Make getDisplayMedia fail
            Object.defineProperty(globalThis.navigator, 'mediaDevices', {
                value: {
                    getUserMedia: vi.fn().mockResolvedValue(mockLocalStream),
                    getDisplayMedia: vi.fn().mockRejectedValue(new Error('User denied')),
                },
                writable: true,
                configurable: true,
            })

            // Action & Assert: Should throw error
            await expect(client.startScreenShare()).rejects.toThrow('User denied')
        })
    })

    // BUG-FIX-3: Media state should default to enabled
    describe('Media State Initialization', () => {
        it('BUG-FIX-3: useRoomStore should have audio and video enabled by default', async () => {
            const { useRoomStore } = await import('../../store/useRoomStore')

            // Get initial state
            const state = useRoomStore.getState()

            // Assert: Media should be enabled by default
            expect(state.mediaState.audioEnabled).toBe(true)
            expect(state.mediaState.videoEnabled).toBe(true)
            expect(state.mediaState.screenSharing).toBe(false)
        })

        it('BUG-FIX-3: toggleAudio should flip audio state', async () => {
            const { useRoomStore } = await import('../../store/useRoomStore')
            const { toggleAudio } = useRoomStore.getState()

            // Initial state
            expect(useRoomStore.getState().mediaState.audioEnabled).toBe(true)

            // Toggle off
            toggleAudio()
            expect(useRoomStore.getState().mediaState.audioEnabled).toBe(false)

            // Toggle on
            toggleAudio()
            expect(useRoomStore.getState().mediaState.audioEnabled).toBe(true)
        })

        it('BUG-FIX-3: toggleVideo should flip video state', async () => {
            const { useRoomStore } = await import('../../store/useRoomStore')
            const { toggleVideo } = useRoomStore.getState()

            // Initial state
            expect(useRoomStore.getState().mediaState.videoEnabled).toBe(true)

            // Toggle off
            toggleVideo()
            expect(useRoomStore.getState().mediaState.videoEnabled).toBe(false)

            // Toggle on
            toggleVideo()
            expect(useRoomStore.getState().mediaState.videoEnabled).toBe(true)
        })
    })
})
