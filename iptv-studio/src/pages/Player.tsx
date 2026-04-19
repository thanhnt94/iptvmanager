import React, { useState, useRef } from 'react';
import { PlayerSidebar } from '../components/player/PlayerSidebar';
import { PlayerHUD } from '../components/player/PlayerHUD';
import { VideoEngine } from '../components/player/VideoEngine';
import type { VideoEngineRef } from '../components/player/VideoEngine';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Tv, AlertCircle } from 'lucide-react';
import { PlayerHeader } from '../components/player/PlayerHeader';

export const Player: React.FC<{ user: { username: string, role: string } }> = ({ user }) => {
  const [activeChannel, setActiveChannel] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<string>('SMART');
  const [stats, setStats] = useState({ fps: 0, audio: 'SCANNING...', resolution: '0X0' });
  const videoEngineRef = useRef<VideoEngineRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelectChannel = (channel: any) => {
    setActiveChannel(channel);
    setCurrentUrl(channel.play_url);
    setActiveMode('SMART');
    setStatus('loading');
    setError(null);
    setStats({ fps: 0, audio: 'SCANNING...', resolution: '0X0' });
  };

  const handleSelectLink = (url: string, mode: string) => {
    setCurrentUrl(url);
    setActiveMode(mode);
    setStatus('loading');
    setStats({ fps: 0, audio: 'SCANNING...', resolution: '0X0' });
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current.requestFullscreen();
    }
  };

  const handleOpenVLC = () => {
    if (!activeChannel) return;
    window.location.assign(`/api/channels/play/${activeChannel.id}?token=${localStorage.getItem('api_token') || ''}&forced=vlc`);
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col overflow-hidden z-[100] animate-in fade-in duration-700">
       {/* Global Header - Explicit Height & Z-Index */}
       <div className="shrink-0 z-[120]">
          <PlayerHeader user={user} />
       </div>

       <div className="flex-1 relative flex flex-col lg:flex-row overflow-hidden bg-black">
          {/* Viewport - order-1 on mobile (Top), order-2 on desktop (Right) */}
          <div ref={containerRef} className="w-full lg:flex-1 aspect-video lg:aspect-auto relative flex flex-col items-center justify-center player-container overflow-hidden shrink-0 order-1 lg:order-2">
             <AnimatePresence mode="wait">
               {status === 'idle' && (
                 <motion.div 
                   key="idle"
                   initial={{ opacity: 0, scale: 0.9 }}
                   animate={{ opacity: 1, scale: 1 }}
                   exit={{ opacity: 0, scale: 0.9 }}
                   className="text-center space-y-6"
                 >
                    <div className="w-24 h-24 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 mx-auto shadow-2xl">
                       <Tv size={48} />
                    </div>
                    <div>
                       <h2 className="text-2xl font-black text-white uppercase tracking-tight">Signal Offline</h2>
                       <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Select a stream to establish connection</p>
                    </div>
                 </motion.div>
               )}

               {(status === 'loading' || status === 'playing' || status === 'error') && activeChannel && (
                 <motion.div 
                   key="playback"
                   initial={{ opacity: 0 }}
                   animate={{ opacity: 1 }}
                   className="w-full h-full relative"
                 >
                    <VideoEngine 
                      ref={videoEngineRef}
                      url={currentUrl}
                      format={activeChannel.stream_format}
                      onPlaying={() => {
                        setStatus('playing');
                        setIsPlaying(true);
                      }}
                      onWaiting={() => setStatus('loading')}
                      onError={(err) => {
                        setStatus('error');
                        setError(err);
                      }}
                      onStatsUpdate={setStats}
                    />

                    <AnimatePresence>
                       {status === 'loading' && (
                          <motion.div 
                           initial={{ opacity: 0 }}
                           animate={{ opacity: 1 }}
                           exit={{ opacity: 0 }}
                           className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-10"
                          >
                             <Loader2 className="animate-spin text-indigo-500 mb-4" size={48} />
                             <span className="text-[10px] font-black text-white uppercase tracking-[0.5em] animate-pulse">Syncing Payload...</span>
                          </motion.div>
                       )}

                       {status === 'error' && (
                          <motion.div 
                           initial={{ opacity: 0 }}
                           animate={{ opacity: 1 }}
                           exit={{ opacity: 0 }}
                           className="absolute inset-0 bg-rose-950/40 backdrop-blur-xl flex flex-col items-center justify-center z-20 p-10 text-center"
                          >
                             <AlertCircle className="text-rose-400 mb-4" size={64} />
                             <h3 className="text-xl font-black text-white uppercase tracking-tight">Encryption Failed</h3>
                             <p className="text-rose-200/60 text-[10px] font-black uppercase tracking-widest mt-2">{error || "The source rejected the handshake"}</p>
                             <button 
                               onClick={() => handleSelectChannel(activeChannel)}
                               className="mt-8 px-8 py-3 bg-white text-slate-950 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all"
                             >
                               Retry Handshake
                             </button>
                          </motion.div>
                       )}
                    </AnimatePresence>

                    <PlayerHUD 
                      channel={activeChannel}
                      isPlaying={isPlaying}
                      isMuted={isMuted}
                      volume={volume}
                      onTogglePlay={() => {
                        if (isPlaying) videoEngineRef.current?.pause();
                        else videoEngineRef.current?.play();
                        setIsPlaying(!isPlaying);
                      }}
                      onToggleMute={() => {
                        videoEngineRef.current?.setMuted(!isMuted);
                        setIsMuted(!isMuted);
                      }}
                      onVolumeChange={(v) => {
                        videoEngineRef.current?.setVolume(v);
                        setVolume(v);
                        setIsMuted(v === 0);
                      }}
                      onToggleFullscreen={handleToggleFullscreen}
                      onOpenVLC={handleOpenVLC}
                      onSelectLink={handleSelectLink}
                      activeMode={activeMode}
                      stats={stats}
                    />
                 </motion.div>
               )}
             </AnimatePresence>
          </div>

          {/* Library Sidebar - order-2 on mobile (Bottom), order-1 on desktop (Left) */}
          <PlayerSidebar 
            onSelectChannel={handleSelectChannel} 
            activeChannelId={activeChannel?.id} 
            className="order-2 lg:order-1 shrink-0"
          />
       </div>
    </div>
  );
};
