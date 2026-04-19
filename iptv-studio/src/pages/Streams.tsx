import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  User, 
  Globe, 
  Trash2, 
  Tv, 
  Monitor, 
  Smartphone,
  Cpu,
  Loader2
} from 'lucide-react';

interface ActiveStream {
  key: string;
  channel_name: string;
  channel_logo: string | null;
  user: string;
  ip: string;
  type: string;
  source: string;
  bandwidth_kbps: number;
  start_time: string;
  duration: string;
}

export const Streams: React.FC = () => {
  const [streams, setStreams] = useState<ActiveStream[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStreams = () => {
    fetch('/api/streams/active')
      .then(res => res.json())
      .then(data => {
        setStreams(data);
        setLoading(false);
      })
      .catch(err => console.error("Streams fetch error:", err));
  };

  useEffect(() => {
    fetchStreams();
    const interval = setInterval(fetchStreams, 5000);
    return () => clearInterval(interval);
  }, []);

  const killStream = async (key: string) => {
    if (!confirm('Force close this session?')) return;
    try {
      const res = await fetch(`/api/streams/${encodeURIComponent(key)}`, { method: 'DELETE' });
      if (res.ok) fetchStreams();
    } catch (err) { alert('Operation failed'); }
  };

  const getSourceIcon = (source: string) => {
    const s = source.toLowerCase();
    if (s.includes('web')) return <Globe size={16} />;
    if (s.includes('smartphone') || s.includes('android')) return <Smartphone size={16} />;
    if (s.includes('vlc') || s.includes('tivimate')) return <Tv size={16} />;
    return <Monitor size={16} />;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black tracking-tighter text-white">Live <span className="text-indigo-500">Monitoring</span></h2>
          <p className="text-slate-400 text-sm mt-1">Real-time session tracking and bandwidth allocation.</p>
        </div>
        <div className="glass px-4 py-2 rounded-xl flex items-center gap-3">
           <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
           <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">{streams.length} Active Sessions</span>
        </div>
      </header>

      {loading ? (
        <div className="p-40 text-center">
           <Loader2 className="animate-spin text-indigo-500 mx-auto" size={40} />
        </div>
      ) : streams.length === 0 ? (
        <div className="p-20 text-center glass rounded-[3rem]">
           <Activity className="text-slate-800 mx-auto mb-4" size={48} />
           <h3 className="text-xl font-bold text-slate-400">Silence in the wires</h3>
           <p className="text-slate-600 text-sm mt-1">No active streams detected. Your server is breathing easy.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AnimatePresence mode="popLayout">
            {streams.map((stream) => (
              <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={stream.key} 
                className="glass p-6 rounded-[2.5rem] relative overflow-hidden group hover:bg-slate-900/60 transition-colors"
              >
                <div className="flex items-start justify-between">
                   <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-slate-950 flex items-center justify-center border border-white/5 shadow-inner">
                         {stream.channel_logo ? (
                           <img src={stream.channel_logo} className="w-full h-full object-contain p-2" alt="" />
                         ) : (
                           <Tv className="text-slate-700" size={28} />
                         )}
                      </div>
                      <div>
                         <h4 className="text-lg font-black text-white tracking-tight">{stream.channel_name}</h4>
                         <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2 py-0.5 rounded-md">
                               {stream.type}
                            </span>
                            <span className="text-slate-600 text-xs tracking-tighter">{stream.duration} elapsed</span>
                         </div>
                      </div>
                   </div>
                   <button 
                    onClick={() => killStream(stream.key)}
                    className="p-3 text-slate-700 hover:text-rose-400 hover:bg-rose-500/10 rounded-2xl transition-all"
                   >
                      <Trash2 size={20} />
                   </button>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-4">
                   <div className="bg-slate-950/40 p-5 rounded-2xl border border-white/5 space-y-3">
                      <div className="flex items-center gap-2 text-slate-500">
                         <User size={14} />
                         <span className="text-[10px] font-black uppercase tracking-widest">Audience</span>
                      </div>
                      <div>
                         <p className="text-sm font-black text-white">{stream.user}</p>
                         <p className="text-[10px] text-slate-500 font-medium">{stream.ip}</p>
                      </div>
                   </div>
                   <div className="bg-slate-950/40 p-5 rounded-2xl border border-white/5 space-y-3">
                      <div className="flex items-center gap-2 text-slate-500">
                         {getSourceIcon(stream.source)}
                         <span className="text-[10px] font-black uppercase tracking-widest">Client</span>
                      </div>
                      <div>
                         <p className="text-sm font-black text-white">{stream.source}</p>
                         <p className="text-[10px] text-slate-500 font-medium whitespace-nowrap overflow-hidden text-ellipsis">Connection Established</p>
                      </div>
                   </div>
                </div>

                <div className="mt-6 p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                         <Cpu size={16} />
                      </div>
                      <span className="text-[10px] font-black text-white uppercase tracking-[0.1em]">Allocated Bitrate</span>
                   </div>
                   <div className="text-right">
                      <span className="text-xl font-black text-indigo-400">{(stream.bandwidth_kbps / 1024).toFixed(1)} <span className="text-[10px] uppercase">Mbps</span></span>
                   </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
