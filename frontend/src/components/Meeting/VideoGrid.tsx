import React from 'react';
import { useMediaStore } from '../../store/useMediaStore';
import { ParticipantVideo } from './ParticipantVideo';

interface VideoGridProps {
    participants: Array<{ id: string; name: string; isMuted?: boolean }>;
}

export const VideoGrid: React.FC<VideoGridProps> = ({ participants }) => {
    const { localStream, remoteStreams } = useMediaStore();

    return (
        <div className="flex-1 p-6 overflow-y-auto">
            <div className={`grid gap-4 h-full ${
                participants.length <= 1 ? 'grid-cols-1' :
                participants.length <= 4 ? 'grid-cols-2' :
                'grid-cols-2 lg:grid-cols-3'
            }`}>
                {/* Local Participant */}
                <ParticipantVideo 
                    stream={localStream} 
                    participantName="You" 
                    isLocal={true} 
                />

                {/* Remote Participants */}
                {participants.map((p) => (
                    <ParticipantVideo
                        key={p.id}
                        stream={remoteStreams.get(p.id) || null}
                        participantName={p.name}
                        isMuted={p.isMuted}
                    />
                ))}
            </div>
        </div>
    );
};
