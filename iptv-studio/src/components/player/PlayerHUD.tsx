import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Activity,
  Zap,
  ChevronUp,
  Heart,
  Share2,
  Copy,
  Check,
  X,
  CalendarCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getLogoUrl } from '../../utils';

interface PlayerHUDProps {
  layout?: 'full' | 'compact';
  channel: {
    id: number;
    name: string;
    logo_url: string | null;
    group: string;
    resolution: string;
    stream_format: string;
    epg_id?: string | null;
    play_links?: {
      smart: string;
      direct: string;
      tracking: string;
      hls: string;
      ts: string;
    };
  } | null;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onVolumeChange: (v: number) => void;
  onToggleFullscreen: () => void;
  onSelectLink: (url: string, mode: string) => void;
  activeMode: string;
  stats: { fps: number; audio: string; resolution: string };
}

export const PlayerHUD: React.FC<PlayerHUDProps> = ({
  channel,
  isPlaying,
  isMuted,
  volume,
  onTogglePlay,
  onToggleMute,
  onVolumeChange,
  onToggleFullscreen,
  onSelectLink,
  activeMode,
  stats,
  layout = 'full'
}) => {
  const [showHUD, setShowHUD] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [latency, setLatency] = useState(340);
  let timeout: any;

  const handleMouseMove = () => {
    setShowHUD(true);
    clearTimeout(timeout);
    timeout = setTimeout(() => setShowHUD(false), 4000);
  };

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    const latencyInterval = setInterval(() => {
        setLatency(prev => Math.max(100, Math.min(600, prev + (Math.random() * 40 - 20))));
    }, 2000);
    
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        clearInterval(clockInterval);
        clearInterval(latencyInterval);
    };
  }, []);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (!channel) return null;

  return (
    <AnimatePresence>
      {showHUD && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          data-layout={layout}
          className="absolute inset-0 pointer-events-none flex flex-col justify-between"
        >
          {/* Top Bar - Pro OSD & Action Central */}
          <div className="bg-gradient-to-b from-black/90 to-transparent p-[clamp(12px,2.5cqw,24px)] pointer-events-auto">
             <div className="flex items-center justify-between w-full max-max-7xl mx-auto">
                <div className="flex items-center gap-[clamp(12px,2.5cqw,24px)]">
                   <button onClick={onTogglePlay} className="text-white hover:text-indigo-400 transition-all hover:scale-110 active:scale-95">
                      {isPlaying ? <Pause size="clamp(20px,3cqw,28px)" fill="currentColor" /> : <Play size="clamp(20px,3cqw,28px)" fill="currentColor" />}
                   </button>
                   
                   {/* Pro Volume Control - Enabled for all viewports */}
                   <div className="flex items-center gap-[clamp(8px,1.5cqw,12px)] bg-white/5 px-[clamp(8px,1.5cqw,10px)] py-[clamp(4px,0.8cqw,6px)] rounded-xl border border-white/5">
                      <button onClick={onToggleMute} className="text-white/60 hover:text-white transition-colors">
                         {isMuted || volume === 0 ? <VolumeX size="clamp(12px,2cqw,16px)" /> : <Volume2 size="clamp(12px,2cqw,16px)" />}
                      </button>
                      <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.05" 
                        value={volume}
                        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                        className="accent-indigo-500 h-[2px] rounded-full cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                        style={{ width: 'clamp(40px, 8cqw, 100px)' }}
                      />
                   </div>
                </div>

                <div className="flex items-center gap-[clamp(8px,1.5cqw,24px)]">
                   <div className="hidden sm:flex bg-emerald-500/10 border border-emerald-500/20 px-[clamp(8px,2cqw,12px)] py-[clamp(3px,0.6cqw,5px)] rounded-full items-center gap-[clamp(4px,1cqw,8px)]">
                      <div className="rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" style={{ width: 'clamp(4px,0.8cqw,6px)', height: 'clamp(4px,0.8cqw,6px)' }} />
                      <span className="font-black text-emerald-400 uppercase tracking-[0.2em]" style={{ fontSize: 'clamp(8px,1cqw,10px)' }}>Live Encrypted</span>
                   </div>
                   
                   {/* Pro TV OSD Info Bundle */}
                   <div className="flex items-baseline gap-[1.5cqw]">
                      <div className="font-black text-white leading-none tracking-tighter" style={{ fontSize: 'clamp(24px, 5cqw, 64px)' }}>
                        {channel.id}
                      </div>
                      <div className="font-black text-white/40 tracking-[0.1em]" style={{ fontSize: 'clamp(10px, 1.2cqw, 16px)' }}>
                        {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                      </div>
                   </div>
                </div>
             </div>
          </div>

          <div className="flex-1" />

          {/* Bottom HUD - Unified High-Contrast Area */}
          <div className="bg-slate-950/95 backdrop-blur-3xl border-t border-white/5 p-[2cqw] pb-[3cqw] pointer-events-auto shrink-0 relative">
             <div className="flex items-center justify-between gap-[3cqw] max-w-7xl mx-auto">
                <div className="flex items-center gap-[3cqw] min-w-0 w-full lg:w-auto">
                   {/* Unified Logo Box - Constant Aspect */}
                   <div className="rounded-[1.5cqw] bg-white p-[0.8cqw] shadow-2xl border border-white/10 flex items-center justify-center shrink-0 w-[10cqw] h-[10cqw] overflow-hidden">
                      {channel.logo_url ? (
                        <img 
                          src={getLogoUrl(channel.logo_url)} 
                          className="w-full h-full object-contain" 
                          alt="" 
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const parent = target.parentElement;
                            if (parent) {
                              const fallback = parent.querySelector('.hud-logo-fallback');
                              if (fallback) (fallback as HTMLElement).style.display = 'flex';
                            }
                          }}
                        />
                      ) : null}
                      <div className={`hud-logo-fallback items-center justify-center w-full h-full ${channel.logo_url ? 'hidden' : 'flex'}`}>
                         <Activity className="text-indigo-400" style={{ width: '50%', height: '50%' }} />
                      </div>
                   </div>

                   <div className="space-y-[1cqw] min-w-0 flex-1">
                       <div className="flex items-center gap-[1.2cqw] min-w-0">
                          <h1 className="font-black text-white tracking-tighter uppercase truncate max-w-[clamp(150px,40cqw,600px)] text-[3.5cqw]">
                            {channel.name}
                          </h1>
                          <div className="flex items-center gap-1">
                             <div className="shrink-0 bg-blue-600 rounded shadow-lg px-[clamp(6px,1cqw,10px)] h-[clamp(14px,1.5cqw,18px)] flex items-center justify-center">
                                 <span className="text-white font-black uppercase tracking-widest text-[clamp(6px,0.8cqw,9px)] leading-none -mt-[0.5px]">
                                    {channel.group?.toUpperCase() || 'UNG'}
                                 </span>
                             </div>
                          </div>
                       </div>
                       
                       {/* High Density Pro Status Bar - Unified Container Query Layout */}
                       <div className="flex items-center gap-x-3 lg:gap-x-[clamp(6px,2cqw,12px)] gap-y-1 flex-wrap">
                          <div className="flex items-center gap-[clamp(5px,1.5cqw,12px)] bg-white/5 border border-white/10 px-[clamp(6px,2cqw,16px)] py-[clamp(2px,0.8cqw,6px)] rounded-xl">
                             <div className="flex items-center gap-2 lg:gap-3">
                                <span className="font-black text-amber-400 uppercase tracking-widest whitespace-nowrap" style={{ fontSize: 'clamp(7px,1cqw,11px)' }}>
                                   {latency.toFixed(1)}ms
                                </span>
                                <div className="w-px bg-white/10 h-[clamp(6px,1.5cqw,12px)]" />
                                <span className="font-black text-indigo-400 uppercase tracking-widest" style={{ fontSize: 'clamp(7px,1cqw,11px)' }}>
                                   {stats.resolution !== '0X0' ? stats.resolution : (channel.resolution || '1080P')}
                                </span>
                                <div className="hidden sm:block w-px bg-white/10 h-[clamp(6px,1.5cqw,12px)]" />
                                <span className="hidden sm:inline font-black text-emerald-400 uppercase tracking-widest" style={{ fontSize: 'clamp(7px,1cqw,11px)' }}>
                                   {stats.fps > 0 ? `${stats.fps.toFixed(1)} FPS` : 'SCANNING...'}
                                </span>
                                <div className="hidden md:block w-px bg-white/10 h-[clamp(6px,1.5cqw,12px)]" />
                                <span className="hidden md:inline font-black text-sky-400 uppercase tracking-widest" style={{ fontSize: 'clamp(7px,1cqw,11px)' }}>
                                   {stats.audio.includes('MP4A') ? 'AAC STEREO' : stats.audio}
                                </span>
                                {channel.epg_id && (
                                  <>
                                    <div className="w-px bg-white/10 h-[clamp(6px,1.5cqw,12px)]" />
                                    <div className="flex items-center gap-[0.5cqw] px-[0.8cqw] py-[0.3cqw] bg-indigo-500/20 rounded-md border border-indigo-500/30">
                                       <CalendarCheck size="0.8cqw" className="text-indigo-400" />
                                       <span className="font-black text-indigo-400 uppercase tracking-widest" style={{ fontSize: 'clamp(6px,0.8cqw,9px)' }}>EPG</span>
                                    </div>
                                  </>
                                )}
                             </div>
                          </div>
                       </div>
                   </div>
                </div>

                {/* Unified Action Row */}
                <div className="flex flex-col items-end gap-[1.5cqw] w-auto shrink-0 relative">
                   
                   {/* Source Selector Overlay - Now absolute to this column */}
                   <AnimatePresence>
                      {showSettings && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 10 }}
                          className="absolute bottom-full right-0 mb-[1.5cqw] z-[500] bg-slate-950/95 backdrop-blur-xl rounded-[1cqw] border border-white/10 p-[0.8cqw] shadow-3xl pointer-events-auto min-w-[20cqw]"
                        >
                          <div className="space-y-[0.4cqw]">
                              <span className="font-black text-white/20 uppercase tracking-[0.2em] px-[0.8cqw] block mb-[0.6cqw]" style={{ fontSize: '0.7cqw' }}>Link Gateway</span>
                              {channel.play_links && Object.entries(channel.play_links).map(([mode, url]) => {
                                const labelMap: Record<string, string> = {
                                  'hls': 'HLS Cache',
                                  'ts': 'TLS Cache',
                                  'tracking': 'Tracking',
                                  'original': 'Original',
                                  'smart': 'SMart'
                                };
                                const displayLabel = labelMap[mode.toLowerCase()] || mode.toUpperCase();
                                return (
                                  <button 
                                    key={mode}
                                    onClick={() => {
                                      onSelectLink(url as string, mode);
                                      setShowSettings(false);
                                    }}
                                    className={`w-full flex items-center justify-between px-[1cqw] py-[0.8cqw] rounded-[0.5cqw] transition-all ${
                                      activeMode === mode ? 'bg-indigo-600 text-white' : 'hover:bg-white/5 text-white/40'
                                    }`}
                                  >
                                    <span className="font-black uppercase tracking-widest" style={{ fontSize: '0.9cqw' }}>{displayLabel}</span>
                                    {activeMode === mode && <div className="w-[0.5cqw] h-[30%] rounded-full bg-white animate-pulse" />}
                                  </button>
                                );
                              })}
                          </div>
                        </motion.div>
                      )}
                   </AnimatePresence>

                   {/* Source Toggle Button */}
                   <button 
                     onClick={() => setShowSettings(!showSettings)}
                     className={`flex items-center gap-[0.5cqw] px-[1.5cqw] py-[0.8cqw] rounded-[1cqw] transition-all border ${
                       showSettings 
                       ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_0_15px_rgba(79,70,229,0.4)]' 
                       : 'bg-white/5 border-white/10 text-indigo-400 hover:text-white hover:bg-white/10'
                     }`}
                   >
                      <Zap size="1.2cqw" className={showSettings ? 'animate-pulse' : ''} />
                      <span className="font-black uppercase tracking-widest" style={{ fontSize: '1cqw' }}>SRC: {activeMode}</span>
                      <ChevronUp size="1.2cqw" className={`transition-transform duration-300 ${showSettings ? '' : 'rotate-180'}`} />
                   </button>

                   {/* Pro Action Buttons */}
                   <div className="flex items-center gap-[0.8cqw]">
                      <div className="flex items-center gap-[0.5cqw]">
                        <button className="bg-white/5 border border-white/5 w-[4cqw] h-[4cqw] rounded-[1cqw] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all">
                           <Heart size="40%" />
                        </button>
                        <button 
                          onClick={() => setShowShare(true)}
                          className="bg-white/5 border border-white/5 w-[4cqw] h-[4cqw] rounded-[1cqw] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                        >
                           <Share2 size="40%" />
                        </button>
                        <button 
                          onClick={onToggleFullscreen}
                          className="bg-white/10 border border-white/10 w-[4cqw] h-[4cqw] rounded-[1cqw] flex items-center justify-center text-white/60 hover:text-white transition-all"
                        >
                           <Maximize size="40%" />
                        </button>
                      </div>
                   </div>
                </div>
             </div>

             {/* DELETED Source Selector Overlay - NO PORTAL */}

             {/* Share Links Modal - Portal persistent for exit animations */}
             {createPortal(
               <AnimatePresence>
                  {showShare && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 bg-slate-950/95 flex items-center justify-center z-[500] p-4 lg:p-10 pointer-events-auto"
                    >
                        <motion.div 
                          initial={{ scale: 0.9, opacity: 0, y: 20 }}
                          animate={{ scale: 1, opacity: 1, y: 0 }}
                          exit={{ scale: 0.9, opacity: 0, y: 20 }}
                          className="bg-slate-900 w-full max-w-lg rounded-[2rem] border border-white/10 overflow-hidden shadow-2xl relative"
                        >
                          <header className="p-8 border-b border-white/5 flex items-center justify-between">
                              <div>
                                <h3 className="text-xl font-black text-white tracking-tight uppercase">Distribute Signal</h3>
                                <p className="text-[10px] text-white/30 font-black uppercase tracking-widest mt-1">Select gateway and copy to clipboard</p>
                              </div>
                              <button 
                                onClick={() => setShowShare(false)}
                                className="p-3 bg-white/5 rounded-2xl text-slate-400 hover:text-white transition-all active:scale-90"
                              >
                                  <X size={20} />
                              </button>
                          </header>

                          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto scrollbar-hide">
                              {channel.play_links && Object.entries(channel.play_links).map(([mode, url]) => {
                                const labelMap: Record<string, string> = {
                                  'smart': 'SMart Dynamic Gateway',
                                  'tracking': 'Direct Landing Track',
                                  'original': 'Original Source Link',
                                  'hls': 'HLS Edge Cache',
                                  'ts': 'TS Stream Proxy'
                                };
                                const label = labelMap[mode.toLowerCase()] || mode.toUpperCase();
                                
                                return (
                                  <div 
                                    key={mode}
                                    className="p-4 rounded-3xl bg-white/[0.03] border border-white/5 group hover:bg-white/5 transition-all"
                                  >
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{label}</span>
                                        <button 
                                          onClick={() => handleCopy(url as string, mode)}
                                          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest ${
                                            copiedKey === mode 
                                            ? 'bg-emerald-500 text-slate-950 scale-95' 
                                            : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
                                          }`}
                                        >
                                            {copiedKey === mode ? (
                                                <><Check size={14} /> Copied</>
                                            ) : (
                                                <><Copy size={12} /> Copy link</>
                                            )}
                                        </button>
                                      </div>
                                      <div className="text-[11px] font-medium text-slate-500 truncate bg-black/20 p-3 rounded-xl border border-white/5 select-all">
                                        {url as string}
                                      </div>
                                  </div>
                                );
                              })}
                          </div>

                          <div className="p-8 border-t border-white/5 bg-indigo-500/5 text-center">
                              <p className="text-[10px] font-black text-indigo-400/60 uppercase tracking-[0.2em]">Ecosystem Distribution Terminal v2.0</p>
                          </div>
                        </motion.div>
                    </motion.div>
                  )}
               </AnimatePresence>,
               document.getElementById('portal-root') || document.body
             )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
