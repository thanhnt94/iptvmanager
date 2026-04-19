import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Activity, 
  Copy, 
  Check, 
  Cpu, 
  Layers, 
  Radio,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { VideoEngine } from '../player/VideoEngine';
import type { VideoEngineRef } from '../player/VideoEngine';

interface PreviewModalProps {
  channel: {
    id: number;
    name: string;
    stream_url: string;
    stream_type?: string;
    stream_format?: string;
    play_links?: {
      smart: string;
      direct: string;
      tracking: string;
      hls: string;
      ts: string;
    };
  } | null;
  onClose: () => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({ channel, onClose }) => {
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<string>('smart');
  const [copied, setCopied] = useState(false);
  
  // Player Stats
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0); // Start muted
  const [isMuted, setIsMuted] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  
  const videoRef = useRef<VideoEngineRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (channel) {
      setActiveUrl(channel.play_links?.smart || `/api/channels/play/${channel.id}?token=${localStorage.getItem('api_token') || ''}`);
      setActiveMode('smart');
      setIsPlaying(true);
      setCurrentTime(0);
      setPlayerError(null);
    }
  }, [channel]);

  // Auto-hide controls
  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !playerError) setShowControls(false);
    }, 3000);
  };

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying, playerError]);

  if (!channel) return null;

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === Infinity) return "LIVE";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const togglePlay = () => {
    if (playerError) return;
    if (isPlaying) videoRef.current?.pause(); else videoRef.current?.play();
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    videoRef.current?.setMuted(newMuted);
    if (!newMuted && volume === 0) setVolume(0.5);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    videoRef.current?.setCurrentTime(time);
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    setPlayerError(null);
    const originalUrl = activeUrl;
    setActiveUrl(null); // Force unmount/remount
    
    try {
      // Trigger backend check to refresh source
      await fetch(`/api/channels/${channel.id}/check`, { method: 'POST' });
      // Restore URL
      setTimeout(() => {
        setActiveUrl(originalUrl);
        setIsRetrying(false);
        setIsPlaying(true);
      }, 500);
    } catch (err) {
      setPlayerError("Failed to trigger re-check. System unreachable.");
      setIsRetrying(false);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-slate-950/90 backdrop-blur-xl">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-slate-900 w-full max-w-4xl rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="px-6 md:px-8 py-6 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white/[0.02] border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 flex items-center justify-center text-indigo-400">
              <Activity size={20} />
            </div>
            <div>
              <h3 className="text-white font-black text-sm uppercase tracking-tight">{channel.name}</h3>
            </div>
          </div>
          <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto">
            {channel.play_links && (
              <div className="flex bg-slate-900/40 p-1 rounded-xl border border-white/5 relative items-center">
                {Object.entries(channel.play_links).map(([mode, url]) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setActiveUrl(url);
                      setActiveMode(mode);
                      setPlayerError(null);
                    }}
                    className={`relative px-3 md:px-4 py-2 rounded-lg flex items-center gap-2 transition-all duration-300 group ${
                      activeMode === mode ? 'text-white' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {activeMode === mode && (
                      <motion.div
                        layoutId="nav-pill"
                        className="absolute inset-0 bg-indigo-500/80 rounded-lg shadow-[0_0_15px_rgba(99,102,241,0.3)]"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                       {mode.toLowerCase() === 'smart' && <Cpu size={14} className={activeMode === mode ? 'text-white' : 'group-hover:text-indigo-400'} />}
                       {mode.toLowerCase() === 'hls' && <Layers size={14} className={activeMode === mode ? 'text-white' : 'group-hover:text-indigo-400'} />}
                       {mode.toLowerCase() === 'ts' && <Radio size={14} className={activeMode === mode ? 'text-white' : 'group-hover:text-indigo-400'} />}
                       <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">{mode}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <button 
              onClick={onClose}
              className="p-2.5 rounded-xl bg-white/5 text-slate-400 hover:text-rose-400 transition-all border border-white/5"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Video Area */}
        <div 
          ref={containerRef}
          onMouseMove={resetControlsTimeout}
          className="flex-grow aspect-video bg-black relative group overflow-hidden"
        >
          {activeUrl && (
            <VideoEngine 
              ref={videoRef}
              url={activeUrl}
              muted={isMuted}
              volume={volume}
              type={channel.stream_type as 'live' | 'vod'}
              format={channel.stream_format}
              onTimeUpdate={setCurrentTime}
              onDurationChange={setDuration}
              onPlayStateChange={setIsPlaying}
              onError={setPlayerError}
            />
          )}

          {/* Error Overlay */}
          <AnimatePresence>
            {playerError && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md z-50"
              >
                <div className="max-w-md w-full glass p-8 rounded-[2.5rem] border border-rose-500/30 text-center space-y-6">
                   <div className="w-16 h-16 rounded-3xl bg-rose-500/10 flex items-center justify-center text-rose-500 mx-auto">
                      <AlertCircle size={32} />
                   </div>
                   <div className="space-y-2">
                     <h4 className="text-white font-black uppercase tracking-widest">Signal Connection Failed</h4>
                     <p className="text-slate-400 text-xs leading-relaxed">{playerError}</p>
                   </div>
                   <div className="pt-4">
                     <button 
                      onClick={handleRetry}
                      disabled={isRetrying}
                      className="w-full flex items-center justify-center gap-2 bg-rose-500 hover:bg-rose-400 text-white font-black uppercase tracking-widest text-[10px] py-4 rounded-2xl transition-all active:scale-95 disabled:opacity-50"
                     >
                       {isRetrying ? <RefreshCw className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                       {isRetrying ? 'Re-checking Signal...' : 'Diagnostic & Retry'}
                     </button>
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Custom Player Controls HUD */}
          <AnimatePresence>
            {showControls && !playerError && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-6 space-y-4"
              >
                {/* Progress Bar */}
                <div className="relative h-1.5 group/progress">
                  <input 
                    type="range" 
                    min="0" 
                    max={duration || 0} 
                    step="0.1"
                    value={currentTime}
                    onChange={handleSeek}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    disabled={!duration || duration === Infinity}
                  />
                  <div className="absolute inset-0 bg-white/10 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                      style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-6">
                    {/* Play/Pause */}
                    <button onClick={togglePlay} className="text-white hover:text-indigo-400 transition-all active:scale-90">
                      {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                    </button>

                    {/* Volume */}
                    <div className="flex items-center gap-3">
                      <button onClick={toggleMute} className="text-white/60 hover:text-white transition-colors">
                        {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                      </button>
                      <input 
                        type="range" 
                        min="0" max="1" step="0.05"
                        value={volume}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setVolume(v);
                          setIsMuted(v === 0);
                        }}
                        className="w-20 accent-indigo-500 h-1 rounded-full cursor-pointer bg-white/20"
                      />
                    </div>

                    {/* Time */}
                    <div className="text-[10px] font-black text-white/40 uppercase tracking-widest tabular-nums">
                       <span className="text-white">{formatTime(currentTime)}</span>
                       <span className="mx-1">/</span>
                       <span>{formatTime(duration)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Fullscreen */}
                    <button onClick={toggleFullscreen} className="text-white/60 hover:text-white transition-colors">
                      {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Big Center Play/Pause button for touch */}
          <AnimatePresence>
            {!isPlaying && !playerError && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-white">
                  <Play size={40} fill="currentColor" className="ml-2" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Info Footer */}
        <div className="p-8 bg-white/[0.01] border-t border-white/5">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
               <div className="space-y-4 flex-grow">
                 <div className="flex items-center gap-2">
                   <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Active Link Gateway</p>
                   <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[9px] font-black uppercase border border-indigo-500/20">{activeMode} Proxy</span>
                 </div>
                <div className="flex items-center gap-3 w-full">
                   <div className="flex-grow group relative min-w-0">
                     <code className="text-[10px] text-indigo-400 font-mono truncate block bg-indigo-500/5 px-4 py-3 rounded-xl border border-indigo-500/10 transition-all group-hover:border-indigo-500/30">
                       {activeUrl}
                     </code>
                   </div>
                   
                   <div className="flex items-center gap-2 shrink-0">
                      <button 
                        onClick={() => {
                          if (activeUrl) {
                            navigator.clipboard.writeText(activeUrl);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }
                        }}
                        className={`w-[48px] h-[48px] rounded-xl transition-all border flex items-center justify-center shrink-0 ${
                          copied ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {copied ? <Check size={18} /> : <Copy size={18} />}
                      </button>

                      <button 
                        onClick={() => window.location.assign(`/api/channels/play/${channel.id}?token=${localStorage.getItem('api_token') || ''}&forced=vlc`)}
                        className="h-[48px] px-6 bg-orange-600 hover:bg-orange-500 text-white rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-orange-600/20 active:scale-95 border border-white/10 shrink-0"
                        title="Launch VLC Media Player"
                      >
                         <Play size={16} fill="currentColor" />
                         <div className="w-px h-4 bg-white/20" />
                         <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18.5 20H5.5L4 22H20L18.5 20Z" fill="white"/>
                            <path d="M12 2L8 15H16L12 2Z" fill="white"/>
                            <path d="M7 17L6 19H18L17 17H7Z" fill="white"/>
                         </svg>
                         <span className="text-[10px] font-black uppercase tracking-widest">Open in VLC</span>
                      </button>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
