// Signaling message types
export type MessageType =
    | 'connect'
    | 'disconnect'
    | 'ping'
    | 'pong'
    | 'create_room'
    | 'join_room'
    | 'leave_room'
    | 'room_created'
    | 'room_joined'
    | 'room_left'
    | 'room_error'
    | 'participant_joined'
    | 'participant_left'
    | 'participant_list'
    | 'participant_update'
    | 'sdp_offer'
    | 'sdp_answer'
    | 'ice_candidate'
    | 'media_state_change'
    | 'mute_audio'
    | 'unmute_audio'
    | 'mute_video'
    | 'unmute_video'
    | 'start_screen_share'
    | 'stop_screen_share'
    | 'chat_message'
    | 'chat_history'
    | 'kick_participant'
    | 'mute_all'
    | 'end_meeting'
    | 'sfu_get_router_rtp_capabilities'
    | 'sfu_create_webrtc_transport'
    | 'sfu_connect_webrtc_transport'
    | 'sfu_produce'
    | 'sfu_consume'
    | 'sfu_restart_ice'
    | 'error';

export interface SignalingMessage {
    type: MessageType;
    roomId: string;
    senderId: string;
    targetId?: string;
    payload: Record<string, unknown>;
    timestamp: number;
}

export interface SDPPayload {
    sdp: string;
    type: 'offer' | 'answer';
}

export interface ICECandidatePayload {
    candidate: string;
    sdpMLineIndex: number;
    sdpMid: string;
}
