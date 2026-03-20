import React, { useEffect, useRef } from 'react';
import { User } from 'lucide-react';

interface ParticipantVideoProps {
    stream: MediaStream | null;
    participantName: string;
    isLocal?: boolean;
    isMuted?: boolean;
}

export const ParticipantVideo: React.FC<ParticipantVideoProps> = ({ 
    stream, 
    participantName, 
    isLocal,
    isMuted
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <div className="relative aspect-video bg-gray-900 rounded-xl overflow-hidden shadow-lg border border-gray-800 group">
            {stream ? (
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={isLocal || isMuted}
                    className="w-full h-full object-cover"
                />
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800 text-gray-500">
                    <User size={48} className="mb-2 opacity-20" />
                    <span className="text-sm font-medium">{participantName} (No Video)</span>
                </div>
            )}
            
            <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/50 backdrop-blur-md rounded-md border border-white/10">
                <span className="text-white text-xs font-medium">
                    {participantName} {isLocal && '(You)'}
                </span>
            </div>

            {isMuted && (
                <div className="absolute top-3 right-3 p-1.5 bg-red-500/80 backdrop-blur-sm rounded-full border border-red-400/50">
                    <span className="text-white text-[10px] font-bold">MUTED</span>
                </div>
            )}
        </div>
    );
};
