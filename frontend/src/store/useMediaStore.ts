import { create } from 'zustand';

interface MediaState {
    localStream: MediaStream | null;
    remoteStreams: Map<string, MediaStream>;
    screenStreams: Map<string, MediaStream>;
    setLocalStream: (stream: MediaStream | null) => void;
    addRemoteStream: (participantId: string, stream: MediaStream) => void;
    removeRemoteStream: (participantId: string) => void;
    addScreenStream: (participantId: string, stream: MediaStream) => void;
    removeScreenStream: (participantId: string) => void;
}

export const useMediaStore = create<MediaState>((set) => ({
    localStream: null,
    remoteStreams: new Map(),
    screenStreams: new Map(),
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
    addScreenStream: (participantId, stream) =>
        set((state) => {
            const newMap = new Map(state.screenStreams);
            newMap.set(participantId, stream);
            return { screenStreams: newMap };
        }),
    removeScreenStream: (participantId) =>
        set((state) => {
            const newMap = new Map(state.screenStreams);
            newMap.delete(participantId);
            return { screenStreams: newMap };
        }),
}));
