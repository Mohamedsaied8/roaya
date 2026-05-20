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
  viewMode?: 'gallery' | 'spotlight';
  isLocalAudioMuted?: boolean;
  isLocalVideoMuted?: boolean;
}

export const VideoGrid: React.FC<VideoGridProps> = ({
  participants,
  localParticipantId,
  localName = 'You',
  isLocalAudioMuted = false,
  isLocalVideoMuted = false
}) => {
  const { localStream, remoteStreams, screenStreams } = useMediaStore();
  const activeSpeakerId = useActiveSpeaker(remoteStreams, localStream, localParticipantId);

  const remoteParticipants = participants.filter(p => p.id !== localParticipantId);

  // Find active screen share (first entry — only one allowed at a time)
  const screenEntry = Array.from(screenStreams.entries())[0];
  const screenSharerId = screenEntry?.[0];
  const screenStream = screenEntry?.[1];
  const screenSharerName = screenSharerId
    ? (remoteParticipants.find(p => p.id === screenSharerId)?.name ||
       (screenSharerId === localParticipantId ? localName : 'Participant'))
    : undefined;

  // When someone is sharing, show presentation layout
  if (screenStream && screenSharerName) {
    return (
      <div className="flex-1 flex p-4 bg-gray-950 min-h-0 gap-3">
        {/* Main: screen share */}
        <div className="flex-1 min-w-0">
          <ParticipantVideo
            stream={screenStream}
            participantName={`${screenSharerName}'s screen`}
            isScreenSharing
          />
        </div>

        {/* Side strip: all participant cameras */}
        <div className="w-48 flex flex-col gap-2 overflow-y-auto">
          <ParticipantVideo
            stream={localStream}
            participantName={localName}
            isLocal
            isMuted={isLocalAudioMuted}
            isVideoMuted={isLocalVideoMuted}
            isActiveSpeaker={activeSpeakerId === localParticipantId}
            compact
          />
          {remoteParticipants.map(p => (
            <ParticipantVideo
              key={p.id}
              stream={remoteStreams.get(p.id) || null}
              participantName={p.name}
              isMuted={p.isMuted}
              isVideoMuted={p.isVideoMuted}
              isActiveSpeaker={activeSpeakerId === p.id}
              compact
            />
          ))}
        </div>
      </div>
    );
  }

  // Normal gallery layout (no screen share)
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
        <ParticipantVideo
          stream={localStream}
          participantName={localName}
          isLocal={true}
          isMuted={isLocalAudioMuted}
          isVideoMuted={isLocalVideoMuted}
          isActiveSpeaker={activeSpeakerId === localParticipantId}
        />
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
