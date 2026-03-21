import React from 'react';
import { useMediaStore } from '../../store/useMediaStore';
import { useActiveSpeaker } from '../../hooks/useActiveSpeaker';
import { ParticipantVideo } from './ParticipantVideo';

interface Participant {
  id: string;
  name: string;
  isMuted?: boolean;
  isVideoMuted?: boolean;
  isScreenSharing?: boolean;
}

interface VideoGridProps {
  participants: Participant[];
  localParticipantId: string;
  localName?: string;
}

export const VideoGrid: React.FC<VideoGridProps> = ({ participants, localParticipantId, localName = 'You' }) => {
  const { localStream, remoteStreams } = useMediaStore();
  const activeSpeakerId = useActiveSpeaker(remoteStreams, localStream, localParticipantId);

  // Total tiles = local + remote participants (excluding self from participants list)
  const remoteParticipants = participants.filter(p => p.id !== localParticipantId);
  const totalCount = 1 + remoteParticipants.length;

  const gridClass =
    totalCount === 1 ? 'grid-cols-1' :
    totalCount === 2 ? 'grid-cols-2' :
    totalCount <= 4 ? 'grid-cols-2' :
    totalCount <= 6 ? 'grid-cols-3' :
    'grid-cols-3 lg:grid-cols-4';

  return (
    <div className="flex-1 flex flex-col p-4 bg-gray-950 min-h-0">
      <div
        className={`flex-1 grid gap-3 ${gridClass}`}
        style={{ gridAutoRows: 'minmax(0, 1fr)' }}
      >
        {/* Local Participant — always first */}
        <ParticipantVideo
          stream={localStream}
          participantName={localName}
          isLocal={true}
          isActiveSpeaker={activeSpeakerId === localParticipantId}
        />

        {/* Remote Participants */}
        {remoteParticipants.map(p => (
          <ParticipantVideo
            key={p.id}
            stream={remoteStreams.get(p.id) || null}
            participantName={p.name}
            isMuted={p.isMuted}
            isVideoMuted={p.isVideoMuted}
            isScreenSharing={p.isScreenSharing}
            isActiveSpeaker={activeSpeakerId === p.id}
          />
        ))}
      </div>
    </div>
  );
};
