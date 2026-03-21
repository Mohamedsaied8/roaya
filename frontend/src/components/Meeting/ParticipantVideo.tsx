import React, { useEffect, useRef } from 'react';
import { User, Monitor, MicOff, VideoOff } from 'lucide-react';

interface ParticipantVideoProps {
  stream: MediaStream | null;
  participantName: string;
  isLocal?: boolean;
  isMuted?: boolean;        // audio muted
  isVideoMuted?: boolean;   // camera off
  isScreenSharing?: boolean;
  isActiveSpeaker?: boolean;
}

export const ParticipantVideo: React.FC<ParticipantVideoProps> = ({
  stream,
  participantName,
  isLocal,
  isMuted,
  isVideoMuted,
  isScreenSharing,
  isActiveSpeaker,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const hasVideo = stream && stream.getVideoTracks().length > 0 && !isVideoMuted;

  return (
    <div
      className={`
        relative aspect-video bg-gray-900 rounded-xl overflow-hidden shadow-lg
        border transition-all duration-300
        ${isActiveSpeaker
          ? 'border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.5),0_0_20px_rgba(59,130,246,0.25)]'
          : 'border-gray-800'}
      `}
    >
      {/* Video element (always rendered, hidden when no video) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal || isMuted}
        className={`w-full h-full object-cover ${hasVideo ? 'block' : 'hidden'}`}
      />

      {/* Camera-off / no video state */}
      {!hasVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900 text-gray-500">
          <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center mb-3 border border-gray-600">
            <User size={32} className="opacity-50" />
          </div>
          <span className="text-sm font-medium text-gray-400">{participantName}</span>
          {isVideoMuted && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
              <VideoOff size={12} />
              <span>Camera off</span>
            </div>
          )}
        </div>
      )}

      {/* Screen share badge */}
      {isScreenSharing && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 bg-purple-600/80 backdrop-blur-sm rounded-md border border-purple-400/50">
          <Monitor size={12} className="text-white" />
          <span className="text-white text-[10px] font-semibold tracking-wide">SCREEN</span>
        </div>
      )}

      {/* Name label */}
      <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/60 backdrop-blur-md rounded-md border border-white/10 flex items-center gap-2">
        {isActiveSpeaker && (
          <span className="inline-flex gap-0.5">
            {[1, 2, 3].map(i => (
              <span
                key={i}
                className="block w-0.5 bg-blue-400 rounded-full animate-pulse"
                style={{ height: `${6 + i * 3}px`, animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </span>
        )}
        <span className="text-white text-xs font-medium">
          {participantName} {isLocal && '(You)'}
        </span>
      </div>

      {/* Audio muted badge */}
      {isMuted && !isLocal && (
        <div className="absolute top-3 right-3 p-1.5 bg-red-500/80 backdrop-blur-sm rounded-full border border-red-400/50">
          <MicOff size={12} className="text-white" />
        </div>
      )}
    </div>
  );
};
