import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Zap, 
  WifiOff, 
  HelpCircle, 
  Activity, 
  Search, 
  Play, 
  Square, 
  Terminal,
  Filter,
  Layers,
  History,
  Loader2
} from 'lucide-react';

interface ScanLog {
  time: string;
  name: string;
  status: string;
  error?: string;
}

interface ScanStatus {
  is_running: boolean;
  total: number;
  current: number;
  current_name: string;
  current_id: number | null;
  live_count: number;
  die_count: number;
  unknown_count: number;
  stop_requested: boolean;
  mode: string;
  group: string;
  playlist_id: number | null;
  logs: ScanLog[];
}

interface ScanOptions {
  groups: string[];
  playlists: { id: number; name: string }[];
}

export const Diagnostics: React.FC = () => {
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [options, setOptions] = useState<ScanOptions | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [mode, setMode] = useState('all');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [selectedPlaylist, setSelectedPlaylist] = useState<number | string>('all');
  const [days, setDays] = useState(7);
  const [scanDelay, setScanDelay] = useState(1);
  const logTopRef = useRef<HTMLDivElement>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/health/status');
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error("Status fetch error:", err);
    }
  };

  const fetchOptions = async () => {
    try {
      const res = await fetch('/api/health/options');
      const data = await res.json();
      setOptions(data);
    } catch (err) {
      console.error("Options fetch error:", err);
    }
  };

  useEffect(() => {
    fetchOptions();
    
    let timeoutId: any;
    let isMounted = true;
    
    const poll = async () => {
      if (!isMounted) return;
      try {
        const res = await fetch('/api/health/status');
        const data = await res.json();
        if (isMounted) setStatus(data);
        const delay = data.is_running ? 2000 : 8000;
        timeoutId = setTimeout(poll, delay);
      } catch (err) {
        console.error("Status fetch error:", err);
        if (isMounted) timeoutId = setTimeout(poll, 8000);
      }
    };
    
    poll();
    
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (logTopRef.current && status?.is_running) {
      logTopRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [status?.logs]);

  const startScan = async () => {
    setLoading(true);
    try {
      await fetch('/api/health/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          group: selectedGroup === 'all' ? null : selectedGroup,
          playlist_id: selectedPlaylist === 'all' ? null : selectedPlaylist,
          days,
          delay: scanDelay
        })
      });
      fetchStatus();
    } catch (err) {
      console.error("Start scan error:", err);
    } finally {
      setLoading(false);
    }
  };

  const stopScan = async () => {
    try {
      await fetch('/api/health/stop', { method: 'POST' });
      // Immediately reset UI — don't wait for next poll
      setStatus(prev => prev ? { ...prev, is_running: false, stop_requested: true, current_name: '' } : prev);
    } catch (err) {
      console.error("Stop scan error:", err);
    }
  };

  if (!status || !options) {
    return (
      <div className="h-full flex items-center justify-center p-20">
        <Loader2 className="animate-spin text-indigo-500" size={40} />
      </div>
    );
  }

  const progress = status.total > 0 ? Math.round((status.current / status.total) * 100) : 0;

  const modeOptions = [
    { id: 'all', label: 'Full Spectrum', desc: 'Scan all channels', icon: <Zap size={16} /> },
    { id: 'never', label: 'Unknown Signals', desc: 'New channels only', icon: <HelpCircle size={16} /> },
    { id: 'die', label: 'Reconnect Broken', desc: 'Dead channels only', icon: <WifiOff size={16} /> },
    { id: 'outdated', label: 'Outdated Health', desc: 'Checked > X days', icon: <History size={16} /> },
  ];

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tighter text-white uppercase italic">
            Advanced <span className="text-indigo-500">Diagnostics</span>
          </h2>
          <p className="text-slate-400 text-sm mt-1 uppercase tracking-widest font-bold opacity-60">Phase 6: Multi-Signal Integrity Verification</p>
        </div>
        
        <div className="flex items-center gap-3">
           <div className={`glass px-4 py-2 rounded-xl flex items-center gap-3 border shadow-lg ${status.is_running ? 'border-indigo-500/50' : 'border-white/5'}`}>
              <div className={`w-2 h-2 rounded-full ${status.is_running ? 'bg-indigo-500 animate-pulse' : 'bg-slate-600'}`} />
              <span className="text-[10px] uppercase font-black tracking-widest text-white">
                {status.is_running ? 'Scanner Online' : 'Idle State'}
              </span>
           </div>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Configuration Panel */}
        <div className="xl:col-span-2 space-y-6">
          <div className="glass-card p-8 rounded-[2.5rem] relative overflow-hidden group border border-white/5 shadow-2xl">
            <div className="absolute -right-4 -top-4 w-48 h-48 bg-indigo-500/5 blur-[80px] pointer-events-none" />
            
            <div className="flex items-center gap-3 mb-8">
               <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                  <Filter size={20} />
               </div>
               <h3 className="font-black text-sm uppercase tracking-widest text-white">Scanner Configuration</h3>
            </div>

            <div className="space-y-8">
              {/* Mode Selector */}
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-4 block">Analysis Intensity</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {modeOptions.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setMode(m.id)}
                      className={`p-4 rounded-2xl border text-left transition-all ${
                        mode === m.id 
                        ? 'bg-indigo-500/10 border-indigo-500/40 shadow-lg shadow-indigo-500/5' 
                        : 'bg-slate-950/20 border-white/5 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${mode === m.id ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
                           {m.icon}
                        </div>
                        <div>
                           <p className={`text-xs font-black uppercase ${mode === m.id ? 'text-white' : 'text-slate-300'}`}>{m.label}</p>
                           <p className="text-[10px] text-slate-500 mt-0.5">{m.desc}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-white/5">
                {/* Filters */}
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3 block">Target Group</label>
                    <div className="relative group">
                      <Layers className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                      <select 
                        value={selectedGroup}
                        onChange={(e) => setSelectedGroup(e.target.value)}
                        className="w-full bg-slate-950/40 border border-white/5 rounded-xl pl-12 pr-4 py-3 text-xs text-white font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 appearance-none hover:bg-slate-900 transition-all cursor-pointer"
                      >
                        <option value="all">ALL GROUPS</option>
                        {options.groups.map(g => (
                          <option key={g} value={g}>{g.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3 block">Target Playlist</label>
                    <div className="relative group">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                      <select 
                        value={selectedPlaylist}
                        onChange={(e) => setSelectedPlaylist(e.target.value)}
                        className="w-full bg-slate-950/40 border border-white/5 rounded-xl pl-12 pr-4 py-3 text-xs text-white font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 appearance-none hover:bg-slate-900 transition-all cursor-pointer"
                      >
                        <option value="all">ALL PLATFORMS</option>
                        {options.playlists.map(p => (
                          <option key={p.id} value={p.id}>{p.name.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-end">
                   <div className="mb-6 space-y-4">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3 block">Scan Delay (Seconds)</label>
                        <input 
                          type="range" min="0" max="600" step="1" value={scanDelay}
                          onChange={(e) => setScanDelay(Number(e.target.value))}
                          className="w-full accent-indigo-500 bg-white/5 rounded-lg h-2"
                        />
                        <div className="flex justify-between mt-2 font-black text-indigo-400 text-[10px]">
                            <span>0s (FAST)</span>
                            <span className="bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">{scanDelay >= 60 ? `${(scanDelay/60).toFixed(1)}m` : `${scanDelay}s`} DELAY</span>
                            <span>10m (SAFE)</span>
                        </div>
                      </div>

                      {mode === 'outdated' && (
                        <div className="animate-in slide-in-from-bottom-2">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3 block">Threshold (Days)</label>
                            <input 
                              type="range" min="1" max="30" value={days}
                              onChange={(e) => setDays(Number(e.target.value))}
                              className="w-full accent-indigo-500 bg-white/5 rounded-lg h-2"
                            />
                            <div className="flex justify-between mt-2 font-black text-indigo-400 text-[10px]">
                              <span>1 DAY</span>
                              <span className="bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">{days} DAYS</span>
                              <span>30 DAYS</span>
                            </div>
                        </div>
                      )}
                   </div>

                   <div className="flex gap-3">
                      {!status.is_running ? (
                         <button 
                          onClick={startScan}
                          disabled={loading}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest text-[11px] py-4 rounded-2xl shadow-xl shadow-indigo-600/20 transition-all flex items-center justify-center gap-3 group"
                         >
                            <Play size={16} className="fill-current group-hover:scale-110 transition-transform" />
                            Initiate Scan
                         </button>
                      ) : (
                        <button 
                         onClick={stopScan}
                         className="flex-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-500 border border-rose-500/20 font-black uppercase tracking-widest text-[11px] py-4 rounded-2xl transition-all flex items-center justify-center gap-3 group"
                        >
                           <Square size={16} className="fill-current group-hover:scale-95 transition-transform" />
                           Terminate
                        </button>
                      )}
                   </div>
                </div>
              </div>
            </div>
          </div>

          {/* Progress Section */}
          <AnimatePresence>
            {status.is_running && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="glass-card p-8 rounded-[2.5rem] border border-white/5 relative overflow-hidden"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                   <div className="flex items-center gap-6">
                      <div className="relative w-20 h-20 shrink-0">
                         <svg className="w-full h-full transform -rotate-90">
                           <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-white/5" />
                           <motion.circle 
                             cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="6" fill="transparent" 
                             strokeDasharray={226}
                             strokeDashoffset={226 - (226 * progress) / 100}
                             className="text-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]" 
                           />
                         </svg>
                         <div className="absolute inset-0 flex items-center justify-center flex-col">
                            <span className="text-lg font-black text-white italic leading-none">{progress}%</span>
                         </div>
                      </div>

                      <div className="space-y-1">
                         <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Currently Verifying</p>
                         <p className="text-xl font-black text-white truncate max-w-[200px] sm:max-w-xs">{status.current_name || 'Standby...'}</p>
                         <p className="text-[10px] font-black text-indigo-400/60 transition-all font-mono uppercase">
                            Signal {status.current} of {status.total}
                         </p>
                      </div>
                   </div>

                   <div className="flex items-center gap-4">
                      <div className="text-center px-4 border-r border-white/5">
                         <p className="text-[9px] font-black text-emerald-400/60 uppercase tracking-widest mb-1">Live</p>
                         <p className="text-xl font-black text-white">{status.live_count}</p>
                      </div>
                      <div className="text-center px-4 border-r border-white/5">
                         <p className="text-[9px] font-black text-rose-400/60 uppercase tracking-widest mb-1">Broken</p>
                         <p className="text-xl font-black text-white">{status.die_count}</p>
                      </div>
                      <div className="text-center px-4">
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Pass</p>
                         <p className="text-xl font-black text-white">{status.unknown_count}</p>
                      </div>
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Console / Log Terminal */}
        <div className="glass flex flex-col rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl h-[500px] xl:h-auto xl:max-h-[85vh]">
           <div className="p-6 bg-slate-900/50 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <Terminal size={18} className="text-indigo-400" />
                 <h4 className="font-black text-xs uppercase tracking-widest text-white">System Signal Stream</h4>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/5">
                 <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                 <span className="text-[8px] font-black uppercase text-slate-200">Realtime</span>
              </div>
           </div>

           <div className="flex-1 overflow-y-auto p-6 font-mono text-[11px] space-y-3 no-scrollbar scroll-smooth bg-slate-950/40">
              <div ref={logTopRef} />
              <div className="text-green-500/40 mb-4 tracking-tighter">
                 [SYSTEM] Integrity Scanner v2.0 Initialization Complete<br/>
                 [READY] Waiting for signal feed...
              </div>
              
              {status.logs && status.logs.map((log, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={i} 
                  className={`flex gap-3 border-l-2 pl-3 py-1 ${
                    log.status === 'live' ? 'border-emerald-500/20' : 
                    log.status === 'die' ? 'border-rose-500/20' : 'border-white/5'
                  }`}
                >
                   <span className="text-slate-600 shrink-0">[{log.time}]</span>
                   <div className="flex-1 min-w-0">
                      <span className="text-white font-bold">{log.name}</span>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 font-black uppercase text-[10px]">
                         <span className={log.status === 'live' ? 'text-emerald-400' : log.status === 'die' ? 'text-rose-400' : 'text-slate-400'}>
                            {log.status}
                         </span>
                         {log.error && <span className="text-slate-600 truncate italic tracking-tighter capitalize font-medium">({log.error})</span>}
                      </div>
                   </div>
                </motion.div>
              ))}
              
              {!status.logs.length && !status.is_running && (
                <div className="flex flex-col items-center justify-center h-full text-slate-800 text-center space-y-4">
                   <Activity size={48} className="opacity-10" />
                   <p className="text-xs uppercase tracking-widest font-black opacity-20">Awaiting diagnostic sequence</p>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};
