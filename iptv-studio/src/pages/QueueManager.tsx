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
  PlayCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Link2
} from 'lucide-react';

interface QueueItem {
  id: number;
  channel_id: number;
  channel_name: string;
  channel_logo: string | null;
  stream_url: string;
  status: string;
  priority: number;
  error_message: string | null;
  created_at: string | null;
  processed_at: string | null;
}

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
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Queue Items List States (Vocaburn style)
  const [items, setItems] = useState<QueueItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loadingItems, setLoadingItems] = useState(false);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

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
    }
  };

  const fetchQueueItems = async () => {
    setLoadingItems(true);
    try {
      let url = `/api/health/queue/items?page=${page}&per_page=15`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (debouncedSearch) url += `&search=${encodeURIComponent(debouncedSearch)}`;
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
        setTotalItems(data.total);
      }
    } catch (err) {
      console.error("Failed to fetch queue items:", err);
    } finally {
      setLoadingItems(false);
    }
  };

  useEffect(() => {
    fetchQueueStatus();
    // Poll queue status every 3 seconds
    const interval = setInterval(fetchQueueStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchQueueItems();
  }, [page, statusFilter, debouncedSearch]);

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
        fetchQueueItems();
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
    if (!confirm("Are you sure you want to clear the entire scan queue?")) return;
    try {
      const res = await fetch('/api/health/queue/clear', { method: 'POST' });
      if (res.ok) {
        showMsg('success', 'Scan queue cleared');
        fetchQueueStatus();
        setPage(1);
        fetchQueueItems();
      } else {
        showMsg('error', 'Failed to clear queue');
      }
    } catch (err) {
      showMsg('error', 'Failed to clear queue');
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    try {
      const res = await fetch(`/api/health/queue/items/${itemId}`, { method: 'DELETE' });
      if (res.ok) {
        showMsg('success', 'Item removed from queue');
        fetchQueueStatus();
        fetchQueueItems();
      } else {
        showMsg('error', 'Failed to delete item');
      }
    } catch (err) {
      showMsg('error', 'Error deleting item');
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

  if (!queueStatus) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '—';
    }
  };

  const totalPages = Math.ceil(totalItems / 15);
  const counts = queueStatus?.counts || { unscanned: 0, scanned: 0, die: 0, live: 0, all: 0 };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tighter mb-2">Scan <span className="text-indigo-500 italic">Queue</span></h1>
          <p className="text-slate-400 font-medium">Asynchronous background health check queue manager</p>
        </div>
        <button 
          onClick={() => { fetchQueueStatus(); fetchQueueItems(); }}
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

                <div className="flex gap-3 font-semibold">
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

      {/* Queue Items Table Section (Vocaburn style) */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-500 ml-2">Active Task List</h3>
          
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
              <input 
                type="text" 
                placeholder="Search channel name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-slate-900/50 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 w-56 font-bold"
              />
            </div>
            
            <select 
              value={statusFilter} 
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="bg-slate-900/50 border border-white/5 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50 font-black uppercase tracking-wider cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        {/* Table Glass Container */}
        <div className="bg-slate-900/20 rounded-[2rem] border border-white/5 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-slate-950/20">
                  <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Task Info</th>
                  <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Channel Name</th>
                  <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Stream Source</th>
                  <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-500">Status</th>
                  <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loadingItems ? (
                  <tr>
                    <td colSpan={5} className="p-20 text-center">
                      <Loader2 className="animate-spin text-indigo-500 inline-block" size={24} />
                      <p className="text-xs text-slate-500 mt-2 font-bold">Querying tasks registry...</p>
                    </td>
                  </tr>
                ) : items.length > 0 ? (
                  items.map(item => (
                    <tr key={item.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-all">
                      <td className="p-5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-slate-300">#{item.id}</span>
                            {item.priority === 1 && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                                <Sparkles size={8} /> PRIORITY
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold">
                            <Clock size={10} />
                            <span>Enqueued {formatTime(item.created_at)}</span>
                          </div>
                        </div>
                      </td>

                      <td className="p-5">
                        <div className="flex items-center gap-3">
                          {item.channel_logo ? (
                            <img src={item.channel_logo} className="w-8 h-8 rounded-lg object-contain bg-slate-950/40 p-1 border border-white/5" alt="" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 text-xs font-black uppercase">
                              {item.channel_name.substring(0, 2)}
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-bold text-white leading-tight">{item.channel_name}</p>
                            <p className="text-[10px] text-slate-500 font-mono">ID: {item.channel_id}</p>
                          </div>
                        </div>
                      </td>

                      <td className="p-5">
                        <div className="flex items-center gap-2 max-w-xs sm:max-w-md">
                          <Link2 size={12} className="text-slate-500 flex-shrink-0" />
                          <span className="text-[10px] font-mono text-slate-400 truncate select-all" title={item.stream_url}>
                            {item.stream_url}
                          </span>
                        </div>
                      </td>

                      <td className="p-5">
                        {item.status === 'processing' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-black uppercase tracking-widest">
                            <Loader2 className="animate-spin" size={10} /> Checking
                          </span>
                        ) : item.status === 'success' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest">
                            <CheckCircle2 size={10} /> Passed
                          </span>
                        ) : item.status === 'failed' ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-black uppercase tracking-widest">
                              <AlertCircle size={10} /> Failed
                            </span>
                            {item.error_message && (
                              <p className="text-[9px] text-rose-400/80 font-bold max-w-xs truncate" title={item.error_message}>
                                {item.error_message}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-slate-400 border border-white/5 text-[10px] font-black uppercase tracking-widest">
                            <Clock size={10} /> Pending
                          </span>
                        )}
                      </td>

                      <td className="p-5 text-right">
                        <button 
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-2 rounded-xl hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 border border-transparent hover:border-rose-500/20 transition-all active:scale-90"
                          title="Remove from queue"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-20 text-center">
                      <PlayCircle size={32} className="text-slate-800 inline-block mb-3" />
                      <p className="text-slate-500 font-bold">No tasks matching filters</p>
                      <p className="text-[10px] text-slate-600 mt-1">Select a filter filter above to feed new channels to the queue.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="p-5 border-t border-white/5 bg-slate-950/20 flex items-center justify-between">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                Page {page} of {totalPages} ({totalItems.toLocaleString()} items total)
              </span>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
                >
                  <ChevronLeft size={16} />
                </button>
                <button 
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-all"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
