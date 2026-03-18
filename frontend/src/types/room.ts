// User types
export interface User {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string;
}

// Room types
export interface Room {
    id: string;
    name: string;
    meetingCode: string;
    hostId: string;
    participants: Participant[];
    maxParticipants: number;
    active: boolean;
}

// Participant types
export interface Participant {
    id: string;
    userId?: string;
    name: string;
    role: 'host' | 'co_host' | 'participant';
    audioMuted: boolean;
    videoMuted: boolean;
    screenSharing: boolean;
    handRaised: boolean;
    joinTime: number;
}

// Media state
export interface MediaState {
    audioEnabled: boolean;
    videoEnabled: boolean;
    screenSharing: boolean;
    audioDeviceId?: string;
    videoDeviceId?: string;
}

// Chat types
export interface ChatMessage {
    id: string;
    roomId: string;
    senderId: string;
    senderName: string;
    content: string;
    timestamp: number;
}
