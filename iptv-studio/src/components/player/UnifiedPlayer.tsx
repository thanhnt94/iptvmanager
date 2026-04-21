import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle, Zap } from 'lucide-react';
import { VideoEngine } from './VideoEngine';
import type { VideoEngineRef } from './VideoEngine';
import { PlayerHUD } from './PlayerHUD';

interface UnifiedPlayerProps {
  channel: any;
  initialMode?: string;
  layout?: 'full' | 'compact';
  onEdit?: () => void;
}

export const UnifiedPlayer: React.FC<UnifiedPlayerProps> = ({ 
  channel, 
  initialMode = 'SMART', 
  layout = 'full',
  onEdit
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(layout === 'compact'); // Default muted for preview
  const [volume, setVolume] = useState(layout === 'compact' ? 0 : 1);
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<string>(initialMode);
  const [stats, setStats] = useState({ fps: 0, audio: 'SCANNING...', resolution: '0X0' });
  
  const videoEngineRef = useRef<VideoEngineRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (channel) {
      const mode = initialMode.toLowerCase();
      const url = channel.play_links?.[mode] || channel.play_url;
      setCurrentUrl(url);
      setActiveMode(initialMode);
      setStatus('loading');
      setError(null);
    }
  }, [channel, initialMode]);

  const handleSelectLink = (url: string, mode: string) => {
    setCurrentUrl(url);
    setActiveMode(mode);
    setStatus('loading');
    setError(null);
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
    if (!channel) return;
    window.location.assign(`/api/channels/play/${channel.id}?token=${localStorage.getItem('api_token') || ''}&forced=vlc`);
  };

  return (
    <div 
      ref={containerRef} 
      className={`relative group overflow-hidden bg-black ${layout === 'full' ? 'w-full h-full' : 'w-full aspect-video rounded-2xl md:rounded-[2rem] border border-white/5 shadow-2xl'}`}
    >
      <VideoEngine 
        ref={videoEngineRef}
        url={currentUrl}
        originalUrl={channel?.stream_url}
        format={channel?.stream_format}
        muted={isMuted}
        volume={volume}
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
            <Loader2 className="animate-spin text-indigo-500 mb-4" size={layout === 'full' ? 48 : 32} />
            <span className="text-[10px] font-black text-white uppercase tracking-[0.5em] animate-pulse">Establishing Signal...</span>
            
            {/* Quick Link Selector - Enabled during loading as requested */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-8 px-6">
              {channel.play_links && Object.entries(channel.play_links).map(([mode, url]) => {
                const labelMap: Record<string, string> = {
                  'hls': 'HLS',
                  'ts': 'TS',
                  'tracking': 'Track',
                  'original': 'Origin',
                  'smart': 'SMart'
                };
                const label = labelMap[mode.toLowerCase()];
                if (!label || mode.toLowerCase() === activeMode.toLowerCase()) return null;

                return (
                  <button 
                    key={mode}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectLink(url as string, mode);
                    }}
                    className="px-3 py-2 bg-white/10 border border-white/10 text-white/60 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-indigo-600 hover:text-white hover:border-indigo-500 transition-all flex items-center gap-2"
                  >
                    <Zap size={10} />
                    {label}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {status === 'error' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-rose-950/40 backdrop-blur-xl flex flex-col items-center justify-center z-20 p-6 md:p-10 text-center"
          >
            <AlertCircle className="text-rose-400 mb-4" size={layout === 'full' ? 64 : 40} />
            <h3 className={`${layout === 'full' ? 'text-xl' : 'text-sm'} font-black text-white uppercase tracking-tight`}>Signal Drop</h3>
            <p className="text-rose-200/60 text-[9px] md:text-[10px] font-black uppercase tracking-widest mt-2">{error || "Handshake Rejected"}</p>
            
            <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 mt-6 md:mt-8">
              <button 
                onClick={() => handleSelectLink(currentUrl!, activeMode)}
                className="px-6 md:px-8 py-2 md:py-3 bg-white text-slate-950 rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all shadow-xl shadow-white/10"
              >
                Retry
              </button>

              {channel.play_links && Object.entries(channel.play_links).map(([mode, url]) => {
                const labelMap: Record<string, string> = {
                  'hls': 'HLS',
                  'ts': 'TS',
                  'tracking': 'Track',
                  'original': 'Origin',
                  'smart': 'SMart'
                };
                const label = labelMap[mode.toLowerCase()];
                if (!label || mode.toLowerCase() === activeMode.toLowerCase()) return null;

                return (
                  <button 
                    key={mode}
                    onClick={() => handleSelectLink(url as string, mode)}
                    className="px-4 md:px-6 py-2 md:py-3 bg-rose-500/20 border border-rose-500/40 text-rose-300 rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all flex items-center gap-2"
                  >
                    <Zap size={10} />
                    {label}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PlayerHUD 
        channel={{
          ...channel,
          group: channel.group_name || 'General',
          resolution: channel.resolution || '1080P'
        }}
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
        onEdit={onEdit}
        activeMode={activeMode}
        stats={stats}
      />
    </div>
  );
};
