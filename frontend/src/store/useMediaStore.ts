import { create } from 'zustand';

interface MediaState {
    localStream: MediaStream | null;
    remoteStreams: Map<string, MediaStream>;
    setLocalStream: (stream: MediaStream | null) => void;
    addRemoteStream: (participantId: string, stream: MediaStream) => void;
    removeRemoteStream: (participantId: string) => void;
}

export const useMediaStore = create<MediaState>((set) => ({
    localStream: null,
    remoteStreams: new Map(),
    setLocalStream: (stream) => set({ localStream: stream }),
    addRemoteStream: (participantId, stream) => 
        set((state) => {
            const newMap = new Map(state.remoteStreams);
            newMap.set(participantId, stream);
            return { remoteStreams: newMap };
        }),
    removeRemoteStream: (participantId) => 
        set((state) => {
            const newMap = new Map(state.remoteStreams);
            newMap.delete(participantId);
            return { remoteStreams: newMap };
        }),
}));
