import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Zap, 
  WifiOff, 
  HelpCircle, 
  Activity, 
  Server, 
  Tv, 
  Layers,
  ChevronRight,
  Loader2,
  Users,
  ZapOff
} from 'lucide-react';

interface Stats {
  channels: {
    total: number;
    live: number;
    die: number;
    unknown: number;
    passthrough: number;
  };
  playlists: {
    total: number;
  };
  users: {
    total: number;
  };
  active_streams: number;
  server: {
    cpu: number;
    ram: number;
  };
  scan: {
    is_scanning: boolean;
    progress: number;
    current: string;
    total: number;
  };
}

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = () => {
    fetch('/api/dashboard/stats')
      .then(res => res.json())
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(err => console.error("Stats fetch error:", err));
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Polling every 5s
    return () => clearInterval(interval);
  }, []);

  if (loading || !stats) {
    return (
      <div className="h-full flex items-center justify-center p-20">
        <Loader2 className="animate-spin text-indigo-500" size={40} />
      </div>
    );
  }

  const statCards = [
    { label: 'Total Channels', value: stats.channels.total, icon: <Tv size={24} />, color: 'blue' },
    { label: 'Active Streams', value: stats.active_streams, icon: <Activity size={24} />, color: 'emerald' },
    { label: 'Registry Profiles', value: stats.playlists.total, icon: <Layers size={24} />, color: 'indigo' },
    { label: 'Registered Users', value: stats.users.total, icon: <Users size={24} />, color: 'orange' },
  ];

  const channelHealth = [
    { label: 'Live', value: stats.channels.live, icon: <Zap size={16} />, color: 'bg-emerald-500', text: 'text-emerald-400' },
    { label: 'Offline', value: stats.channels.die, icon: <WifiOff size={16} />, color: 'bg-rose-500', text: 'text-rose-400' },
    { label: 'Unknown', value: stats.channels.unknown, icon: <HelpCircle size={16} />, color: 'bg-slate-500', text: 'text-slate-400' },
    { label: 'Passthrough', value: stats.channels.passthrough, icon: <ZapOff size={16} />, color: 'bg-rose-950/30', text: 'text-rose-400' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black tracking-tighter text-white">Command <span className="text-indigo-500">Center</span></h2>
          <p className="text-slate-400 text-sm mt-1">Real-time ecosystem metrics and health monitoring.</p>
        </div>
        <div className="hidden sm:flex gap-2">
           <div className="glass px-4 py-2 rounded-xl flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">System Online</span>
           </div>
        </div>
      </header>

      {/* Primary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={card.label} 
            className="glass-card p-6 rounded-3xl relative overflow-hidden group"
          >
            <div className={`absolute -right-4 -top-4 w-32 h-32 bg-${card.color}-500/5 blur-[60px] group-hover:bg-${card.color}-500/10 transition-all`} />
            <div className={`w-12 h-12 rounded-2xl bg-${card.color}-500/10 flex items-center justify-center text-${card.color}-400 mb-6 group-hover:scale-110 transition-transform`}>
              {card.icon}
            </div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">{card.label}</p>
            <p className="text-4xl font-black text-white mt-1">{card.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel Health Grid */}
        <div className="glass-card p-8 rounded-[2.5rem] flex flex-col justify-between">
           <div className="flex items-center justify-between mb-8">
              <h3 className="font-black text-xs uppercase tracking-[0.2em] text-white/40">Continuity Health</h3>
              <Tv className="text-slate-700" size={20} />
           </div>
           
           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {channelHealth.map(item => (
                <div key={item.label} className="bg-slate-950/40 p-5 rounded-2xl border border-white/5">
                   <div className="flex items-center gap-2 mb-3">
                      <div className={`w-1.5 h-1.5 rounded-full ${item.color}`} />
                      <span className={`text-[10px] font-black uppercase tracking-widest ${item.text}`}>{item.label}</span>
                   </div>
                   <p className="text-2xl font-black text-white">{item.value}</p>
                </div>
              ))}
           </div>

           <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-between">
              <p className="text-xs text-slate-500 font-medium">Auto-sync active every 30 minutes</p>
              <button className="text-xs font-black text-indigo-400 flex items-center gap-1 hover:text-indigo-300 transition-colors uppercase tracking-widest">
                Full Scan <ChevronRight size={14} />
              </button>
           </div>
        </div>

        {/* Server Resources */}
        <div className="glass p-8 rounded-[2.5rem]">
           <div className="flex items-center justify-between mb-8">
              <h3 className="font-black text-xs uppercase tracking-[0.2em] text-white/40">Resource Capacity</h3>
              <Server className="text-slate-700" size={20} />
           </div>

           <div className="space-y-8">
              <div className="space-y-4">
                 <div className="flex justify-between items-end">
                    <span className="text-xs font-black text-white uppercase">Compute Load (CPU)</span>
                    <span className="text-xs font-black text-indigo-400 italic">{stats.server.cpu}%</span>
                 </div>
                 <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${stats.server.cpu}%` }}
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500" 
                    />
                 </div>
              </div>

              <div className="space-y-4">
                 <div className="flex justify-between items-end">
                    <span className="text-xs font-black text-white uppercase">Memory Allocation (RAM)</span>
                    <span className="text-xs font-black text-indigo-400 italic">{stats.server.ram}%</span>
                 </div>
                 <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${stats.server.ram}%` }}
                      className="h-full bg-gradient-to-r from-indigo-500 to-purple-500" 
                    />
                 </div>
              </div>
           </div>

           <div className="mt-12 p-5 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400">
                <Activity size={20} />
              </div>
              <div>
                 <p className="text-xs font-black text-white uppercase tracking-widest">Active Watchers</p>
                 <p className="text-slate-400 text-[10px] mt-0.5">{stats.active_streams} concurrent players across the network.</p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
