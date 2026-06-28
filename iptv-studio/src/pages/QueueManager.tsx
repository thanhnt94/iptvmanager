import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Zap, 
  Trash2, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  RefreshCw,
  PlayCircle
} from 'lucide-react';

interface QueueStatus {
  pending: number;
  processing: number;
  success: number;
  failed: number;
  delay_seconds: number;
  counts: {
    unscanned: number;
    scanned: number;
    die: number;
    live: number;
    all: number;
  };
}

export const QueueManager: React.FC = () => {
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [selectedQueueFilter, setSelectedQueueFilter] = useState('unscanned');
  const [queueDelayInput, setQueueDelayInput] = useState('5');
  const [addingToQueue, setAddingToQueue] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const fetchQueueStatus = async () => {
    try {
      const res = await fetch('/api/health/queue/status');
      if (res.ok) {
        const data = await res.json();
        setQueueStatus(data);
        setQueueDelayInput(data.delay_seconds.toString());
      }
    } catch (err) {
      console.error("Queue status fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueueStatus();
    // Poll queue status every 3 seconds
    const interval = setInterval(fetchQueueStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleAddToQueue = async () => {
    setAddingToQueue(true);
    try {
      const res = await fetch('/api/health/queue/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: selectedQueueFilter })
      });
      if (res.ok) {
        const data = await res.json();
        showMsg('success', `Added ${data.added} channels to scan queue`);
        fetchQueueStatus();
      } else {
        showMsg('error', 'Failed to add channels');
      }
    } catch (err) {
      showMsg('error', 'Failed to add to queue');
    } finally {
      setAddingToQueue(false);
    }
  };

  const handleClearQueue = async () => {
    if (!confirm("Are you sure you want to clear the scan queue?")) return;
    try {
      const res = await fetch('/api/health/queue/clear', { method: 'POST' });
      if (res.ok) {
        showMsg('success', 'Scan queue cleared');
        fetchQueueStatus();
      } else {
        showMsg('error', 'Failed to clear queue');
      }
    } catch (err) {
      showMsg('error', 'Failed to clear queue');
    }
  };

  const handleSaveQueueSettings = async () => {
    const delay = parseInt(queueDelayInput);
    if (isNaN(delay) || delay < 1) {
      showMsg('error', 'Delay must be at least 1 second');
      return;
    }
    try {
      const res = await fetch('/api/health/queue/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delay_seconds: delay })
      });
      if (res.ok) {
        showMsg('success', 'Queue settings updated');
        fetchQueueStatus();
      } else {
        showMsg('error', 'Failed to update settings');
      }
    } catch (err) {
      showMsg('error', 'Failed to update queue settings');
    }
  };

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  if (loading && !queueStatus) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  const counts = queueStatus?.counts || { unscanned: 0, scanned: 0, die: 0, live: 0, all: 0 };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tighter mb-2">Scan <span className="text-indigo-500 italic">Queue</span></h1>
          <p className="text-slate-400 font-medium">Asynchronous background health check queue manager</p>
        </div>
        <button 
          onClick={fetchQueueStatus}
          className="p-3 rounded-2xl bg-white/5 text-slate-400 hover:text-white border border-white/10 transition-all active:scale-95 shadow-lg"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Persistence Message */}
      <AnimatePresence>
        {message && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-8 right-8 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 font-bold text-sm ${
              message.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Controls Card */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-light p-8 rounded-[2.5rem] border border-white/5 space-y-6">
            <div className="flex items-center gap-3 text-indigo-400">
              <PlayCircle size={22} />
              <h3 className="font-black text-white text-lg uppercase tracking-tight">Queue Operation Feed</h3>
            </div>
            
            <p className="text-slate-400 text-xs leading-relaxed font-semibold">
              Select a filter subset to batch-enqueue channels for background health scan verification. 
              The system will continuously process them one by one.
            </p>

            <div className="space-y-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Channel Status Group Filter</label>
              <div className="flex flex-col sm:flex-row gap-4">
                <select 
                  value={selectedQueueFilter} 
                  onChange={e => setSelectedQueueFilter(e.target.value)} 
                  className="bg-slate-950/50 border border-white/5 rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-xs font-black uppercase tracking-widest cursor-pointer flex-1 appearance-none shadow-inner"
                >
                  <option value="unscanned">Unscanned Channels (Unknown) — ({counts.unscanned.toLocaleString()} channels)</option>
                  <option value="scanned">Scanned Channels — ({counts.scanned.toLocaleString()} channels)</option>
                  <option value="die">Offline Channels (Die) — ({counts.die.toLocaleString()} channels)</option>
                  <option value="live">Online Channels (Live) — ({counts.live.toLocaleString()} channels)</option>
                  <option value="all">All Registry Channels — ({counts.all.toLocaleString()} channels)</option>
                </select>

                <div className="flex gap-3">
                  <button 
                    onClick={handleAddToQueue}
                    disabled={addingToQueue}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white h-[52px] px-8 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl shadow-indigo-600/20"
                  >
                    {addingToQueue ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                    Add to queue
                  </button>
                  <button 
                    onClick={handleClearQueue}
                    className="px-6 h-[52px] rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 text-xs font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2"
                  >
                    <Trash2 size={16} />
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Settings Card */}
        <div className="glass-light p-8 rounded-[2.5rem] border border-white/5 space-y-6">
          <div className="flex items-center gap-3 text-indigo-400">
            <Clock size={22} />
            <h3 className="font-black text-white text-lg uppercase tracking-tight">Queue Loop Delay</h3>
          </div>
          
          <p className="text-slate-400 text-xs leading-relaxed font-semibold">
            Define the pause interval (in seconds) that the background worker sleeps after scanning each signal. This prevents CPU usage spikes and avoids getting blocked by servers.
          </p>

          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Delay Interval (Seconds)</label>
            <div className="flex gap-4">
              <input 
                type="number" 
                value={queueDelayInput}
                onChange={e => setQueueDelayInput(e.target.value)}
                className="bg-slate-950/50 border border-white/5 rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm font-black w-28 text-center shadow-inner" 
              />
              <button 
                onClick={handleSaveQueueSettings}
                className="bg-indigo-600/10 border border-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center transition-all active:scale-95 flex-1 shadow-lg"
              >
                Update Delay
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Queue Status Dashboard */}
      <div className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-500 ml-2">Queue Status Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="bg-slate-900/40 p-6 rounded-3xl border border-white/5 space-y-2">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Queue Pending</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{queueStatus?.pending || 0}</span>
              <span className="text-xs text-slate-500">signals</span>
            </div>
          </div>
          <div className="bg-slate-900/40 p-6 rounded-3xl border border-white/5 space-y-2">
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Currently Processing</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-indigo-400">{queueStatus?.processing || 0}</span>
              <span className="text-xs text-slate-500">running</span>
            </div>
          </div>
          <div className="bg-emerald-500/5 p-6 rounded-3xl border border-emerald-500/10 space-y-2">
            <p className="text-emerald-500/60 text-[10px] font-black uppercase tracking-widest">Success (Live)</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-400">{queueStatus?.success || 0}</span>
              <span className="text-xs text-emerald-500/60">passed</span>
            </div>
          </div>
          <div className="bg-rose-500/5 p-6 rounded-3xl border border-rose-500/10 space-y-2">
            <p className="text-rose-500/60 text-[10px] font-black uppercase tracking-widest">Failed (Die)</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-rose-400">{queueStatus?.failed || 0}</span>
              <span className="text-xs text-rose-500/60">failed</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
