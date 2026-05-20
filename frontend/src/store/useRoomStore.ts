import { create } from 'zustand'
import type { Room, Participant, ChatMessage, MediaState } from '../types/room'

interface RoomState {
    room: Room | null
    participants: Participant[]
    localParticipant: Participant | null
    chatMessages: ChatMessage[]
    mediaState: MediaState
    isChatOpen: boolean
    isParticipantsOpen: boolean

    // Actions
    setRoom: (room: Room) => void
    clearRoom: () => void

    // Participant actions
    setLocalParticipant: (participant: Participant) => void
    addParticipant: (participant: Participant) => void
    removeParticipant: (participantId: string) => void
    updateParticipant: (participantId: string, updates: Partial<Participant>) => void
    setParticipants: (participants: Participant[]) => void

    // Media actions
    toggleAudio: () => void
    toggleVideo: () => void
    setScreenSharing: (sharing: boolean) => void
    setAudioDevice: (deviceId: string) => void
    setVideoDevice: (deviceId: string) => void

    // Chat actions
    addChatMessage: (message: ChatMessage) => void
    setChatMessages: (messages: ChatMessage[]) => void
    toggleChat: () => void
    toggleParticipants: () => void
}

function loadPersistedMediaState(): { audioEnabled: boolean; videoEnabled: boolean } {
    try {
        const raw = sessionStorage.getItem('roaya:mediaState')
        if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return { audioEnabled: true, videoEnabled: true }
}

function persistMediaState(audioEnabled: boolean, videoEnabled: boolean) {
    try {
        sessionStorage.setItem('roaya:mediaState', JSON.stringify({ audioEnabled, videoEnabled }))
    } catch { /* ignore */ }
}

const persisted = loadPersistedMediaState()

export const useRoomStore = create<RoomState>((set) => ({
    room: null,
    participants: [],
    localParticipant: null,
    chatMessages: [],
    mediaState: {
        audioEnabled: persisted.audioEnabled,
        videoEnabled: persisted.videoEnabled,
        screenSharing: false,
    },
    isChatOpen: false,
    isParticipantsOpen: false,

    setRoom: (room) => set({ room, participants: room.participants }),
    clearRoom: () => {
        try { sessionStorage.removeItem('roaya:mediaState') } catch { /* ignore */ }
        return set({
            room: null,
            participants: [],
            localParticipant: null,
            chatMessages: [],
            isChatOpen: false,
            isParticipantsOpen: false,
            mediaState: {
                audioEnabled: true,
                videoEnabled: true,
                screenSharing: false,
            },
        })
    },

    setLocalParticipant: (participant) => set({ localParticipant: participant }),

    addParticipant: (participant) => set((state) => ({
        participants: [...state.participants.filter(p => p.id !== participant.id), participant],
    })),

    removeParticipant: (participantId) => set((state) => ({
        participants: state.participants.filter(p => p.id !== participantId),
    })),

    updateParticipant: (participantId, updates) => set((state) => ({
        participants: state.participants.map(p =>
            p.id === participantId ? { ...p, ...updates } : p
        ),
        localParticipant: state.localParticipant?.id === participantId
            ? { ...state.localParticipant, ...updates }
            : state.localParticipant
    })),

    setParticipants: (participants) => set({ participants }),

    toggleAudio: () => set((state) => {
        const newAudio = !state.mediaState.audioEnabled
        persistMediaState(newAudio, state.mediaState.videoEnabled)
        return { mediaState: { ...state.mediaState, audioEnabled: newAudio } }
    }),

    toggleVideo: () => set((state) => {
        const newVideo = !state.mediaState.videoEnabled
        persistMediaState(state.mediaState.audioEnabled, newVideo)
        return { mediaState: { ...state.mediaState, videoEnabled: newVideo } }
    }),

    setScreenSharing: (sharing) => set((state) => ({
        mediaState: { ...state.mediaState, screenSharing: sharing },
    })),

    setAudioDevice: (deviceId) => set((state) => ({
        mediaState: { ...state.mediaState, audioDeviceId: deviceId },
    })),

    setVideoDevice: (deviceId) => set((state) => ({
        mediaState: { ...state.mediaState, videoDeviceId: deviceId },
    })),

    addChatMessage: (message) => set((state) => ({
        chatMessages: [...state.chatMessages, message],
    })),

    setChatMessages: (messages) => set({ chatMessages: messages }),

    toggleChat: () => set((state) => ({
        isChatOpen: !state.isChatOpen,
        isParticipantsOpen: state.isChatOpen ? state.isParticipantsOpen : false,
    })),

    toggleParticipants: () => set((state) => ({
        isParticipantsOpen: !state.isParticipantsOpen,
        isChatOpen: state.isParticipantsOpen ? state.isChatOpen : false,
    })),
}))
