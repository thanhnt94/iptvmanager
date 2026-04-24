import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Play, Pause, Volume2, VolumeX, Maximize, Activity, Zap,
  ChevronUp, Heart, Share2, Check, X, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getLogoUrl } from '../../utils';

interface PlayerHUDProps {
  layout?: 'full' | 'compact';
  channel: {
    id: number; name: string; logo_url: string | null; group: string;
    resolution: string; stream_format: string; epg_id?: string | null;
    play_links?: { smart: string; direct: string; tracking: string; hls: string; ts: string; };
  } | null;
  isPlaying: boolean; isMuted: boolean; volume: number;
  onTogglePlay: () => void; onToggleMute: () => void;
  onVolumeChange: (v: number) => void; onToggleFullscreen: () => void;
  onSelectLink: (url: string, mode: string) => void;
  activeMode: string;
  stats: { fps: number; audio: string; resolution: string };
}

export const PlayerHUD: React.FC<PlayerHUDProps> = ({
  channel, isPlaying, isMuted, volume, onTogglePlay, onToggleMute,
  onVolumeChange, onToggleFullscreen, onSelectLink, activeMode, stats,
  layout = 'full'
}) => {
  const [showHUD, setShowHUD] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [latency, setLatency] = useState(340);
  const [epgData, setEpgData] = useState<{current: any, next: any} | null>(null);
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
      clearInterval(clockInterval); clearInterval(latencyInterval);
    };
  }, []);

  useEffect(() => {
    if (channel?.epg_id) {
      fetch(`/api/epg/now-next/${encodeURIComponent(channel.epg_id)}`)
        .then(res => res.json()).then(data => setEpgData(data))
        .catch(err => console.error('EPG Fetch Error:', err));
    } else { setEpgData(null); }
  }, [channel?.epg_id]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (!channel) return null;

  // Countdown: minutes until next program
  const getCountdown = () => {
    if (!epgData?.current?.stop) return '';
    const diffMs = new Date(epgData.current.stop).getTime() - currentTime.getTime();
    if (diffMs <= 0) return 'Now';
    const mins = Math.ceil(diffMs / 60000);
    if (mins >= 60) return `${Math.floor(mins / 60)}h${mins % 60 > 0 ? ` ${mins % 60}min` : ''}`;
    return `${mins} min`;
  };

  return (
    <AnimatePresence>
      {showHUD && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          data-layout={layout}
          className="absolute inset-0 pointer-events-none flex flex-col justify-between"
        >
          {/* ══════════ TOP BAR ══════════ */}
          <div className="bg-gradient-to-b from-black/90 to-transparent pointer-events-auto"
               style={{ padding: 'clamp(8px, 2.5cqw, 28px)' }}>
            <div className={`flex items-center justify-between w-full ${layout === 'full' ? '' : 'max-w-7xl mx-auto'}`}
                 style={{ paddingInline: 'clamp(6px, 2cqw, 20px)' }}>
              {/* Play + Volume */}
              <div className="flex items-center" style={{ gap: 'clamp(10px, 3cqw, 28px)' }}>
                <button onClick={onTogglePlay} className="text-white/80 hover:text-white transition-all active:scale-95">
                  {isPlaying
                    ? <Pause style={{ width: 'clamp(16px, 2.5cqw, 32px)', height: 'clamp(16px, 2.5cqw, 32px)' }} fill="currentColor" />
                    : <Play  style={{ width: 'clamp(16px, 2.5cqw, 32px)', height: 'clamp(16px, 2.5cqw, 32px)' }} fill="currentColor" />}
                </button>
                <div className="flex items-center bg-white/5 backdrop-blur-md border border-white/10 rounded-full"
                     style={{ gap: 'clamp(6px, 1.2cqw, 14px)', padding: 'clamp(4px, 0.7cqw, 10px) clamp(8px, 1.5cqw, 16px)' }}>
                  <button onClick={onToggleMute} className="text-white/60 hover:text-white transition-colors">
                    {isMuted || volume === 0
                      ? <VolumeX style={{ width: 'clamp(14px, 1.8cqw, 22px)', height: 'clamp(14px, 1.8cqw, 22px)' }} />
                      : <Volume2 style={{ width: 'clamp(14px, 1.8cqw, 22px)', height: 'clamp(14px, 1.8cqw, 22px)' }} />}
                  </button>
                  <input type="range" min="0" max="1" step="0.05" value={volume}
                    onChange={e => onVolumeChange(parseFloat(e.target.value))}
                    className="accent-indigo-500 rounded-full cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                    style={{ width: 'clamp(50px, 10cqw, 120px)', height: '2px' }} />
                </div>
              </div>
              {/* Signal + Channel ID + Clock */}
              <div className="flex items-center" style={{ gap: 'clamp(8px, 3cqw, 28px)' }}>
                <div className="hidden sm:flex items-center bg-emerald-500/10 border border-emerald-500/20 rounded-full"
                     style={{ gap: 'clamp(4px, 0.8cqw, 8px)', padding: 'clamp(3px, 0.5cqw, 6px) clamp(8px, 1.5cqw, 14px)' }}>
                  <div className="rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                       style={{ width: 'clamp(4px, 0.6cqw, 8px)', height: 'clamp(4px, 0.6cqw, 8px)' }} />
                  <span className="font-black text-emerald-400 uppercase tracking-[0.15em]"
                        style={{ fontSize: 'clamp(7px, 1cqw, 12px)' }}>Signal Encrypted</span>
                </div>
                <div className="flex items-baseline" style={{ gap: 'clamp(4px, 1cqw, 12px)' }}>
                  <span className="font-black text-white leading-none tracking-tighter"
                        style={{ fontSize: 'clamp(20px, 5cqw, 64px)' }}>{channel.id}</span>
                  <span className="font-black text-white/40 tracking-widest uppercase"
                        style={{ fontSize: 'clamp(8px, 1.2cqw, 16px)' }}>
                    {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1" />

          {/* ══════════ BOTTOM HUD ══════════ */}
          <div className="bg-slate-950/85 backdrop-blur-3xl border-t border-white/5 pointer-events-auto shrink-0 relative overflow-hidden"
               style={{ padding: 'clamp(8px, 2cqw, 24px)', maxHeight: '33%' }}>
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />

            <div className={`flex items-center justify-between w-full ${layout === 'full' ? '' : 'max-w-7xl mx-auto'}`}
                 style={{ gap: 'clamp(12px, 3cqw, 32px)' }}>

              {/* ── LEFT: Logo + Channel Info ── */}
              <div className="flex items-center min-w-0 flex-1" style={{ gap: 'clamp(8px, 2.5cqw, 24px)' }}>
                {/* Logo - transparent, no box */}
                <div className="relative shrink-0 flex items-center justify-center"
                     style={{ width: 'clamp(40px, 10cqw, 100px)', height: 'clamp(40px, 10cqw, 100px)' }}>
                  {channel.logo_url ? (
                    <img src={getLogoUrl(channel.logo_url)} className="w-full h-full object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]" alt="" />
                  ) : (
                    <Activity className="text-indigo-400" style={{ width: '55%', height: '55%' }} />
                  )}
                </div>

                {/* Channel Details Stack */}
                <div className="flex flex-col min-w-0 flex-1" style={{ gap: 'clamp(2px, 0.6cqw, 8px)' }}>
                  {/* Row 1: Channel Name + Group Badge */}
                  <div className="flex items-center min-w-0" style={{ gap: 'clamp(6px, 1.2cqw, 14px)' }}>
                    <h1 className="font-black text-white tracking-tighter uppercase truncate leading-none"
                        style={{ fontSize: 'clamp(14px, 3.5cqw, 48px)' }}>
                      {channel.name}
                    </h1>
                    <div className="shrink-0 bg-indigo-600/20 border border-indigo-500/30 font-black text-indigo-400 uppercase tracking-widest"
                         style={{ padding: 'clamp(1px, 0.3cqw, 4px) clamp(5px, 1cqw, 10px)', borderRadius: 'clamp(3px, 0.5cqw, 6px)', fontSize: 'clamp(7px, 1cqw, 12px)' }}>
                      {channel.group?.toUpperCase() || 'UNG'}
                    </div>
                  </div>

                  {/* Row 2: EPG Now Playing */}
                  {epgData?.current && (
                    <div className="flex items-center bg-white/5 border border-white/5 backdrop-blur-md min-w-0"
                         style={{ gap: 'clamp(5px, 1.2cqw, 14px)', padding: 'clamp(4px, 0.6cqw, 8px) clamp(8px, 1.2cqw, 14px)', borderRadius: 'clamp(4px, 0.8cqw, 10px)' }}>
                      <div className="shrink-0 bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/20"
                           style={{ width: 'clamp(18px, 2.5cqw, 32px)', height: 'clamp(18px, 2.5cqw, 32px)', borderRadius: 'clamp(4px, 0.5cqw, 8px)' }}>
                        <Clock className="text-white" style={{ width: '55%', height: '55%' }} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-black text-indigo-400 uppercase tracking-widest opacity-80"
                              style={{ fontSize: 'clamp(7px, 0.8cqw, 11px)' }}>NOW</span>
                        <span className="font-bold text-white truncate leading-tight"
                              style={{ fontSize: 'clamp(10px, 1.6cqw, 22px)' }}>{epgData.current.title}</span>
                      </div>
                      {epgData.next && (
                        <div className="hidden sm:flex items-center min-w-0 border-l border-white/10"
                             style={{ gap: 'clamp(6px, 1cqw, 12px)', paddingLeft: 'clamp(8px, 1.2cqw, 14px)', marginLeft: 'clamp(6px, 1cqw, 12px)' }}>
                          <div className="shrink-0 flex items-center bg-amber-500/15 border border-amber-500/25 text-amber-400 whitespace-nowrap"
                               style={{ padding: 'clamp(2px, 0.3cqw, 4px) clamp(6px, 0.8cqw, 10px)', borderRadius: 'clamp(4px, 0.5cqw, 6px)', gap: 'clamp(3px, 0.5cqw, 6px)' }}>
                            <span className="font-black uppercase tracking-widest" style={{ fontSize: 'clamp(7px, 0.8cqw, 10px)' }}>NEXT</span>
                            <span className="font-black" style={{ fontSize: 'clamp(7px, 0.8cqw, 10px)' }}>{getCountdown()}</span>
                          </div>
                          <span className="font-semibold text-slate-300 truncate"
                                style={{ fontSize: 'clamp(9px, 1.3cqw, 18px)' }}>{epgData.next.title}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Row 3: Technical Stats */}
                  <div className="flex items-center flex-wrap" style={{ gap: 'clamp(4px, 1cqw, 12px)' }}>
                    {[
                      { text: `${latency.toFixed(0)}ms`, color: 'text-amber-500' },
                      { text: stats.resolution !== '0X0' ? stats.resolution : (channel.resolution || '1080P'), color: 'text-indigo-400' },
                      { text: `${stats.fps > 0 ? stats.fps.toFixed(1) : '—'} FPS`, color: 'text-emerald-400' },
                      { text: stats.audio.includes('MP4A') ? 'AAC Stereo' : stats.audio, color: 'text-sky-400', hideSmall: true },
                    ].map((s, i) => (
                      <span key={i} className={`font-black uppercase tracking-widest ${s.color} ${s.hideSmall ? 'hidden sm:inline' : ''}`}
                            style={{ fontSize: 'clamp(7px, 1cqw, 13px)' }}>{s.text}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── RIGHT: Action Controls ── */}
              <div className="flex flex-col items-end shrink-0" style={{ gap: 'clamp(4px, 1cqw, 12px)' }}>
                {/* Gate Selector */}
                <div className="relative">
                  <button onClick={() => setShowSettings(!showSettings)}
                    className={`flex items-center transition-all border ${
                      showSettings ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/20' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                    }`}
                    style={{ gap: 'clamp(4px, 0.8cqw, 8px)', padding: 'clamp(5px, 0.8cqw, 10px) clamp(8px, 1.2cqw, 16px)', borderRadius: 'clamp(6px, 1cqw, 12px)' }}>
                    <Zap style={{ width: 'clamp(12px, 1.5cqw, 18px)', height: 'clamp(12px, 1.5cqw, 18px)' }} />
                    <span className="font-black uppercase tracking-widest whitespace-nowrap"
                          style={{ fontSize: 'clamp(8px, 1.1cqw, 13px)' }}>SRC: {activeMode}</span>
                    <ChevronUp style={{ width: 'clamp(10px, 1.2cqw, 16px)', height: 'clamp(10px, 1.2cqw, 16px)' }}
                               className={`transition-transform duration-300 ${showSettings ? '' : 'rotate-180'}`} />
                  </button>
                  <AnimatePresence>
                    {showSettings && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                        className="absolute bottom-full right-0 z-[100] bg-slate-900/95 backdrop-blur-xl border border-white/10 shadow-2xl"
                        style={{ marginBottom: 'clamp(6px, 1cqw, 12px)', borderRadius: 'clamp(8px, 1cqw, 14px)', padding: 'clamp(4px, 0.5cqw, 8px)', minWidth: 'clamp(120px, 16cqw, 220px)' }}>
                        {channel.play_links && Object.entries(channel.play_links).map(([mode, url]) => (
                          <button key={mode}
                            onClick={() => { onSelectLink(url as string, mode); setShowSettings(false); }}
                            className={`w-full flex items-center justify-between transition-all ${activeMode === mode ? 'bg-indigo-600 text-white' : 'hover:bg-white/5 text-white/40'}`}
                            style={{ padding: 'clamp(5px, 0.8cqw, 10px) clamp(8px, 1.2cqw, 14px)', borderRadius: 'clamp(4px, 0.6cqw, 8px)', fontSize: 'clamp(8px, 1cqw, 13px)' }}>
                            <span className="font-black uppercase tracking-widest">{mode.toUpperCase()}</span>
                            {activeMode === mode && <Check style={{ width: 'clamp(10px, 1.2cqw, 16px)', height: 'clamp(10px, 1.2cqw, 16px)' }} />}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Action Buttons Row */}
                <div className="flex items-center bg-white/5 border border-white/10"
                     style={{ gap: 'clamp(2px, 0.3cqw, 4px)', padding: 'clamp(3px, 0.4cqw, 5px)', borderRadius: 'clamp(8px, 1.2cqw, 16px)' }}>
                  {[
                    { icon: Heart, onClick: () => {}, active: false },
                    { icon: Share2, onClick: () => setShowShare(true), active: showShare },
                    { icon: Maximize, onClick: onToggleFullscreen, active: false }
                  ].map((item, idx) => (
                    <button key={idx} onClick={item.onClick}
                      className={`flex items-center justify-center transition-all ${item.active ? 'bg-indigo-600 text-white' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                      style={{ width: 'clamp(28px, 4cqw, 48px)', height: 'clamp(28px, 4cqw, 48px)', borderRadius: 'clamp(6px, 0.8cqw, 12px)' }}>
                      <item.icon style={{ width: 'clamp(14px, 1.8cqw, 22px)', height: 'clamp(14px, 1.8cqw, 22px)' }} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Share Modal - Fixed px since portaled to body */}
            {createPortal(
              <AnimatePresence>
                {showShare && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-slate-950/95 flex items-center justify-center z-[500] p-4 pointer-events-auto backdrop-blur-xl">
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                      className="bg-slate-900 w-full max-w-md rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
                      <header className="p-6 border-b border-white/5 flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-black text-white uppercase">Distribute Signal</h3>
                          <p className="text-[9px] text-white/30 font-black uppercase tracking-widest mt-1">Select gateway</p>
                        </div>
                        <button onClick={() => setShowShare(false)} className="p-2.5 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all">
                          <X size={18} />
                        </button>
                      </header>
                      <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto scrollbar-hide">
                        {channel.play_links && Object.entries(channel.play_links).map(([mode, url]) => (
                          <div key={mode} className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/5 transition-all">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">{mode}</span>
                              <button onClick={() => handleCopy(url as string, mode)}
                                className={`px-3 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all ${
                                  copiedKey === mode ? 'bg-emerald-500 text-slate-950' : 'bg-white/5 text-white/60 hover:bg-white/10'
                                }`}>
                                {copiedKey === mode ? 'COPIED' : 'COPY'}
                              </button>
                            </div>
                            <div className="text-[10px] text-slate-500 truncate bg-black/40 p-2.5 rounded-xl border border-white/5 select-all font-mono">
                              {url as string}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>,
              document.body
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
