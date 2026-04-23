import React, { useEffect, useState, useMemo } from 'react';
import { 
  Plus, 
  RefreshCw, 
  Trash2, 
  Upload, 
  Link as LinkIcon, 
  Loader2, 
  FileText,
  Database,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Search,
  Layers,
  X,
  Edit3,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  format, 
  addDays, 
  subDays, 
  startOfDay, 
  endOfDay, 
  eachHourOfInterval, 
  differenceInMinutes,
  parseISO,
  isSameDay
} from 'date-fns';

interface EPGSource {
  id: number;
  name: string;
  url: string;
  priority: number;
  last_sync: string;
}

interface EPGProgram {
  id: number;
  epg_id: string;
  title: string;
  desc: string;
  start: string;
  stop: string;
  is_manual: boolean;
  priority: number;
}

const HOUR_WIDTH = 250; 

export const EPG: React.FC = () => {
  const [sources, setSources] = useState<EPGSource[]>([]);
  const [programs, setPrograms] = useState<EPGProgram[]>([]);
  const [activeTab, setActiveTab] = useState<'sources' | 'manual'>('sources');
  const [syncing, setSyncing] = useState<number | null>(null);

  // Studio State
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [focusChannel, setFocusChannel] = useState<string | null>(null);
  const [channelSearch, setChannelSearch] = useState('');

  // Modals
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [isProgramModalOpen, setIsProgramModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Form State
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourcePriority, setNewSourcePriority] = useState(0);
  const [newProgEpgId, setNewProgEpgId] = useState('');
  const [newProgTitle, setNewProgTitle] = useState('');
  const [newProgDesc, setNewProgDesc] = useState('');
  const [newProgStart, setNewProgStart] = useState('');
  const [newProgStop, setNewProgStop] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importUrl, setImportUrl] = useState('');
  const [importType, setImportType] = useState<'file' | 'url'>('file');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    fetchSources();
  }, []);

  useEffect(() => {
    fetchPrograms();
  }, [selectedDate]);

  const fetchSources = async () => {
    try {
      const res = await fetch('/api/epg/sources');
      const data = await res.json();
      setSources(data);
    } catch (e) { console.error(e); }
  };

  const fetchPrograms = async () => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/epg/programs?date=${dateStr}`);
      const data = await res.json();
      setPrograms(Array.isArray(data) ? data : []);
    } catch (e) { 
      console.error(e); 
      setPrograms([]);
    }
  };

  const handleSync = async (id: number) => {
    setSyncing(id);
    try {
      const res = await fetch(`/api/epg/sources/${id}/sync`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`Synced ${data.added} programs!`);
        fetchSources();
        fetchPrograms();
      } else {
        alert(data.error || 'Sync failed');
      }
    } catch (e) { alert('Sync error'); }
    setSyncing(null);
  };

  const handleDeleteSource = async (id: number) => {
    if (!confirm('Remove this EPG source?')) return;
    try {
      const res = await fetch(`/api/epg/sources/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.status === 'ok') fetchSources();
    } catch (e) { alert('Delete failed'); }
  };

  const handleDeleteProgram = async (id: number) => {
    try {
      const res = await fetch(`/api/epg/programs/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.status === 'ok') setPrograms(prev => prev.filter(p => p.id !== id));
    } catch (e) { alert('Delete failed'); }
  };

  const handleAddSource = async () => {
    setWorking(true);
    try {
      const res = await fetch('/api/epg/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSourceName, url: newSourceUrl, priority: newSourcePriority })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setIsSourceModalOpen(false);
        setNewSourceName('');
        setNewSourceUrl('');
        setNewSourcePriority(0);
        fetchSources();
      }
    } catch (e) { alert('Add failed'); }
    setWorking(false);
  };

  const handleAddProgram = async () => {
    setWorking(true);
    try {
      const res = await fetch('/api/epg/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          epg_id: newProgEpgId, 
          title: newProgTitle, 
          desc: newProgDesc, 
          start: newProgStart, 
          stop: newProgStop 
        })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setIsProgramModalOpen(false);
        setNewProgEpgId('');
        setNewProgTitle('');
        setNewProgDesc('');
        setNewProgStart('');
        setNewProgStop('');
        fetchPrograms();
      } else {
        alert(data.error || 'Failed to add program');
      }
    } catch (e) { alert('Add failed'); }
    setWorking(false);
  };

  const handleImport = async () => {
    if (importType === 'file' && !importFile) return;
    if (importType === 'url' && !importUrl) return;
    setWorking(true);
    try {
      let res;
      if (importType === 'file') {
        const formData = new FormData();
        formData.append('file', importFile!);
        res = await fetch('/api/epg/import-file', { method: 'POST', body: formData });
      } else {
        res = await fetch('/api/epg/import-url', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: importUrl }) 
        });
      }
      const data = await res.json();
      if (data.success) {
        alert(`Imported ${data.added} programs!`);
        setIsImportModalOpen(false);
        setImportFile(null);
        setImportUrl('');
        fetchPrograms();
      } else {
        alert(data.error || 'Import failed');
      }
    } catch (e) { alert('Import error'); }
    setWorking(false);
  };

  // Timeline & Grouping Logic
  const timeIntervals = useMemo(() => {
    return eachHourOfInterval({
      start: startOfDay(selectedDate),
      end: endOfDay(selectedDate)
    });
  }, [selectedDate]);

  const groupedPrograms = useMemo(() => {
    const ranked: Record<string, Record<string, EPGProgram>> = {};
    programs.forEach(p => {
      const pStart = parseISO(p.start);
      if (isSameDay(pStart, selectedDate)) {
        if (!ranked[p.epg_id]) ranked[p.epg_id] = {};
        const timeKey = p.start;
        if (!ranked[p.epg_id][timeKey] || p.priority > ranked[p.epg_id][timeKey].priority) {
          ranked[p.epg_id][timeKey] = p;
        }
      }
    });

    const finalGroups: Record<string, EPGProgram[]> = {};
    Object.keys(ranked).forEach(epgId => {
      finalGroups[epgId] = Object.values(ranked[epgId]).sort((a, b) => a.start.localeCompare(b.start));
    });
    return finalGroups;
  }, [programs, selectedDate]);

  const EPGIds = useMemo(() => {
    const ids = Object.keys(groupedPrograms);
    if (!channelSearch) return ids.sort();
    return ids.filter(id => id.toLowerCase().includes(channelSearch.toLowerCase())).sort();
  }, [groupedPrograms, channelSearch]);

  const getPosition = (timeStr: string) => {
    const date = parseISO(timeStr);
    const dayStart = startOfDay(selectedDate);
    const mins = differenceInMinutes(date, dayStart);
    return (mins / 60) * HOUR_WIDTH;
  };

  const getWidth = (start: string, stop: string) => {
    const mins = differenceInMinutes(parseISO(stop), parseISO(start));
    return (mins / 60) * HOUR_WIDTH;
  };

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col space-y-6 animate-in fade-in duration-700">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-black tracking-tighter text-white">EPG <span className="text-emerald-500">Registry Studio</span></h2>
          <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold mt-1">Multi-source unified scheduling platform</p>
        </div>
        <div className="flex gap-2">
           <button 
             onClick={() => setIsImportModalOpen(true)}
             className="bg-slate-800 hover:bg-slate-700 text-white h-10 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 border border-white/5"
           >
              <Upload size={14} /> Import
           </button>
           <button 
             onClick={() => activeTab === 'sources' ? setIsSourceModalOpen(true) : setIsProgramModalOpen(true)}
             className="bg-emerald-600 hover:bg-emerald-500 text-white h-10 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-emerald-600/20"
           >
              <Plus size={14} /> New {activeTab === 'sources' ? 'Source' : 'Entry'}
           </button>
        </div>
      </header>

      {/* Main Tabs & Date Picker */}
      <div className="flex items-center justify-between bg-slate-900/40 p-2 rounded-2xl border border-white/5 shrink-0">
          <div className="flex p-1 bg-slate-950/60 rounded-xl border border-white/5">
            <button 
              onClick={() => setActiveTab('sources')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'sources' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
            >
              <Database size={14} /> Registry
            </button>
            <button 
              onClick={() => setActiveTab('manual')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'manual' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
            >
              <Layers size={14} /> Studio
            </button>
          </div>

          {activeTab === 'manual' && (
            <div className="flex items-center gap-4">
               {focusChannel && (
                  <button 
                    onClick={() => setFocusChannel(null)}
                    className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 text-rose-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-500/20 transition-all"
                  >
                     <X size={14} /> Exit Editor
                  </button>
               )}
               <div className="flex items-center gap-1">
                  <button onClick={() => setSelectedDate(subDays(selectedDate, 1))} className="p-2 text-slate-500 hover:text-white transition-all"><ChevronLeft size={16} /></button>
                  <div className="px-4 py-2 bg-slate-950/60 rounded-xl border border-white/5 flex items-center gap-3">
                     <CalendarIcon size={14} className="text-emerald-500" />
                     <span className="text-[10px] font-black text-white uppercase tracking-widest">{format(selectedDate, 'EEEE, MMM dd')}</span>
                  </div>
                  <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} className="p-2 text-slate-500 hover:text-white transition-all"><ChevronRight size={16} /></button>
               </div>
            </div>
          )}
      </div>

      <div className="flex-1 overflow-hidden relative glass rounded-[2rem] border border-white/5">
        <AnimatePresence mode="wait">
          {activeTab === 'sources' ? (
            <motion.div 
              key="sources"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-full overflow-y-auto p-6 md:p-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sources.map((s) => (
                  <div key={s.id} className="bg-slate-950/40 p-6 rounded-[2rem] border border-white/5 hover:border-emerald-500/30 transition-all group">
                     <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center">
                           <LinkIcon size={20} />
                        </div>
                        <div className="overflow-hidden">
                           <h3 className="font-black text-white truncate pr-6">{s.name}</h3>
                           <div className="flex items-center gap-2 mt-1">
                             <p className="text-slate-500 text-[10px] truncate max-w-[120px]">{s.url}</p>
                             <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-[8px] font-black uppercase tracking-widest border border-emerald-500/20">Prio: {s.priority}</span>
                           </div>
                        </div>
                     </div>
                     <div className="flex items-center justify-between pt-6 border-t border-white/5">
                        <div className="flex flex-col">
                           <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Last Sync</span>
                           <span className="text-[10px] text-white font-medium">{s.last_sync}</span>
                        </div>
                        <div className="flex gap-2">
                           <button 
                             onClick={() => handleSync(s.id)}
                             disabled={syncing === s.id}
                             className={`p-2 rounded-xl transition-all ${syncing === s.id ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-400'}`}
                           >
                             {syncing === s.id ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                           </button>
                           <button onClick={() => handleDeleteSource(s.id)} className="p-2 hover:bg-rose-500/10 text-slate-500 hover:text-rose-500 rounded-xl transition-all"><Trash2 size={16} /></button>
                        </div>
                     </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div 
               key="manual"
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="h-full flex overflow-hidden"
            >
               {/* Fixed Left Sidebar for Channel Selection */}
               <div className="w-64 md:w-80 border-r border-white/10 flex flex-col bg-slate-950/40 shrink-0">
                  <div className="p-4 border-b border-white/10">
                     <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input 
                          type="text" 
                          placeholder="Find channel..." 
                          value={channelSearch}
                          onChange={e => setChannelSearch(e.target.value)}
                          className="w-full bg-slate-900 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                        />
                     </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-hide">
                     {EPGIds.map(id => (
                       <button 
                        key={id}
                        onClick={() => setFocusChannel(id)}
                        className={`w-full text-left px-4 py-3 rounded-xl transition-all group relative ${focusChannel === id ? 'bg-emerald-500/10 border border-emerald-500/20' : 'hover:bg-white/5'}`}
                       >
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-black uppercase tracking-tight truncate ${focusChannel === id ? 'text-emerald-400' : 'text-slate-400'}`}>{id}</span>
                            <div className="flex items-center gap-1">
                               <span className="text-[8px] font-black text-slate-600">{groupedPrograms[id].length}</span>
                               <ChevronDown size={12} className={`text-slate-600 transition-transform ${focusChannel === id ? '-rotate-90 text-emerald-500' : ''}`} />
                            </div>
                          </div>
                       </button>
                     ))}
                  </div>
               </div>

               {/* Right Content Area */}
               <div className="flex-1 overflow-hidden flex flex-col relative">
                  <AnimatePresence mode="wait">
                    {!focusChannel ? (
                      <motion.div 
                        key="overview"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="h-full flex flex-col"
                      >
                         <div className="flex-1 overflow-auto bg-slate-950/20 p-4 scrollbar-hide">
                            <div className="inline-block min-w-full">
                               {/* Timeline Header Row */}
                               <div className="flex bg-slate-900/60 sticky top-0 z-10 rounded-t-2xl border border-white/10">
                                  {timeIntervals.map((time, i) => (
                                    <div key={i} className="shrink-0 border-r border-white/5 flex flex-col justify-center px-4 h-16" style={{ width: HOUR_WIDTH }}>
                                       <span className="text-[10px] font-black text-white">{format(time, 'HH:mm')}</span>
                                       <span className="text-[8px] font-bold text-slate-600 uppercase tracking-tighter">{format(time, 'aa')}</span>
                                    </div>
                                  ))}
                               </div>
                               
                               {/* Rows Area */}
                               <div className="divide-y divide-white/5">
                                  {EPGIds.map(id => (
                                    <div key={id} className="relative h-20 group bg-slate-950/10 hover:bg-white/[0.02] transition-colors border-x border-white/10 flex items-center">
                                       {/* Hourly lines */}
                                       {timeIntervals.map((_, i) => (
                                          <div key={i} className="h-full border-r border-white/[0.03] absolute" style={{ left: i * HOUR_WIDTH, width: HOUR_WIDTH }} />
                                       ))}
                                       {/* Program Blocks */}
                                       {groupedPrograms[id].map(p => (
                                          <div 
                                            key={p.id}
                                            style={{
                                              left: getPosition(p.start),
                                              width: getWidth(p.start, p.stop)
                                            }}
                                            className={`absolute h-14 border rounded-xl p-2 flex flex-col justify-center overflow-hidden transition-all shadow-sm ${
                                              p.is_manual ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-indigo-500/10 border-indigo-500/20'
                                            }`}
                                          >
                                             <span className="text-[9px] font-black text-white truncate leading-none uppercase">{p.title}</span>
                                             <span className={`text-[7px] font-bold uppercase mt-1 ${p.is_manual ? 'text-emerald-500/60' : 'text-indigo-500/40'}`}>
                                               {format(parseISO(p.start), 'HH:mm')}
                                             </span>
                                          </div>
                                       ))}
                                       {/* Hover overlay to enter editor */}
                                       <button 
                                         onClick={() => setFocusChannel(id)}
                                         className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center bg-emerald-500/5 transition-all"
                                       >
                                          <div className="px-4 py-2 bg-emerald-500 text-white font-black text-[10px] rounded-full uppercase tracking-widest flex items-center gap-2 shadow-2xl">
                                             <Edit3 size={14} /> Open Vertical Editor
                                          </div>
                                       </button>
                                    </div>
                                  ))}
                               </div>
                            </div>
                         </div>
                      </motion.div>
                    ) : (
                      <motion.div 
                        key="focus"
                        initial={{ x: 50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 50, opacity: 0 }}
                        className="h-full flex flex-col p-8"
                      >
                         <header className="mb-8 flex items-center justify-between">
                            <div>
                               <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center">
                                     <ExternalLink size={20} />
                                  </div>
                                  <div>
                                     <h3 className="text-xl font-black text-white tracking-tight uppercase">{focusChannel}</h3>
                                     <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{groupedPrograms[focusChannel].length} Programs Scheduled</p>
                                  </div>
                               </div>
                            </div>
                            <button 
                              onClick={() => {setNewProgEpgId(focusChannel); setIsProgramModalOpen(true);}}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-xl shadow-emerald-600/20"
                            >
                               <Plus size={16} /> New Program
                            </button>
                         </header>

                         <div className="flex-1 overflow-y-auto space-y-3 pr-4 scrollbar-hide">
                            {groupedPrograms[focusChannel].length === 0 ? (
                               <div className="h-full flex flex-col items-center justify-center text-slate-700">
                                  <Layers size={64} className="opacity-10 mb-4" />
                                  <p className="text-xs font-black uppercase tracking-widest italic">No data discovered for this channel</p>
                               </div>
                            ) : groupedPrograms[focusChannel].map((p, idx) => (
                               <motion.div 
                                 initial={{ opacity: 0, y: 10 }}
                                 animate={{ opacity: 1, y: 0 }}
                                 transition={{ delay: idx * 0.03 }}
                                 key={p.id}
                                 className={`p-5 rounded-[2rem] border flex items-center justify-between hover:scale-[1.01] transition-all group ${
                                   p.is_manual ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-slate-900 border-white/5'
                                 }`}
                               >
                                  <div className="flex items-center gap-6">
                                     <div className="w-20 text-center border-r border-white/10 pr-6">
                                        <span className="text-xs font-black text-white">{format(parseISO(p.start), 'HH:mm')}</span>
                                        <div className="text-[9px] text-slate-500 font-bold uppercase mt-1">START</div>
                                     </div>
                                     <div>
                                        <div className="flex items-center gap-3">
                                          <h4 className="font-black text-white uppercase tracking-tight">{p.title}</h4>
                                          {p.is_manual ? (
                                             <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-[8px] font-black uppercase tracking-widest border border-emerald-500/20">MANUAL</span>
                                          ) : (
                                             <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded text-[8px] font-black uppercase tracking-widest border border-indigo-500/20">REGISTRY | PRIO: {p.priority}</span>
                                          )}
                                        </div>
                                        <p className="text-[10px] text-slate-500 mt-1 max-w-xl truncate line-clamp-1">{p.desc || 'No description provided'}</p>
                                     </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                     <div className="text-right border-l border-white/10 pl-6 mr-4">
                                        <span className="text-xs font-black text-slate-400">{format(parseISO(p.stop), 'HH:mm')}</span>
                                        <div className="text-[9px] text-slate-600 font-bold uppercase mt-1">STOP</div>
                                     </div>
                                     {p.is_manual && (
                                        <button 
                                          onClick={() => handleDeleteProgram(p.id)}
                                          className="p-3 bg-rose-500/10 text-rose-500 rounded-2xl opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-500 hover:text-white"
                                        >
                                           <Trash2 size={18} />
                                        </button>
                                     )}
                                  </div>
                               </motion.div>
                            ))}
                         </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
               </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modals remain the same but use shared form logic */}
      <AnimatePresence>
          {isSourceModalOpen && (
             <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsSourceModalOpen(false)} />
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
                   <h3 className="text-2xl font-black text-white tracking-tighter mb-8">Add <span className="text-emerald-500">EPG Source</span></h3>
                   <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                           <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Provider Name</label>
                           <input value={newSourceName} onChange={e => setNewSourceName(e.target.value)} placeholder="e.g. My EPG" className="w-full bg-slate-950/40 border border-white/5 rounded-2xl p-4 text-sm text-white" />
                         </div>
                         <div className="space-y-2">
                           <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Priority</label>
                           <input type="number" value={newSourcePriority} onChange={e => setNewSourcePriority(parseInt(e.target.value) || 0)} className="w-full bg-slate-950/40 border border-white/5 rounded-2xl p-4 text-sm text-white" />
                         </div>
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black uppercase text-slate-500 ml-1">XMLTV URL</label>
                         <input value={newSourceUrl} onChange={e => setNewSourceUrl(e.target.value)} placeholder="https://..." className="w-full bg-slate-950/40 border border-white/5 rounded-2xl p-4 text-sm text-white" />
                      </div>
                      <div className="flex gap-4 pt-4">
                         <button onClick={() => setIsSourceModalOpen(false)} className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] text-slate-500">Cancel</button>
                         <button onClick={handleAddSource} disabled={working || !newSourceName || !newSourceUrl} className="flex-[2] h-14 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px]">{working ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Add Source'}</button>
                      </div>
                   </div>
                </motion.div>
             </div>
          )}

          {isProgramModalOpen && (
             <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsProgramModalOpen(false)} />
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative w-full max-w-xl bg-slate-900 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
                   <h3 className="text-2xl font-black text-white tracking-tighter mb-8">Studio <span className="text-emerald-500">Program Entry</span></h3>
                   <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                           <label className="text-[10px] font-black uppercase text-slate-500 ml-1">EPG ID</label>
                           <input value={newProgEpgId} onChange={e => setNewProgEpgId(e.target.value)} className="w-full bg-slate-950/40 border border-white/5 rounded-2xl p-4 text-sm text-white" />
                         </div>
                         <div className="space-y-2">
                           <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Title</label>
                           <input value={newProgTitle} onChange={e => setNewProgTitle(e.target.value)} className="w-full bg-slate-950/40 border border-white/5 rounded-2xl p-4 text-sm text-white" />
                         </div>
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Description</label>
                         <textarea value={newProgDesc} onChange={e => setNewProgDesc(e.target.value)} className="w-full bg-slate-950/40 border border-white/5 rounded-2xl p-4 text-sm text-white h-20" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                           <label className="text-[10px] font-black uppercase text-slate-500 ml-1">Start</label>
                           <input type="datetime-local" value={newProgStart} onChange={e => setNewProgStart(e.target.value)} className="w-full bg-slate-950/40 border border-white/5 rounded-2xl p-4 text-sm text-white" />
                         </div>
                         <div className="space-y-2">
                           <label className="text-[10px] font-black uppercase text-slate-500 ml-1">End</label>
                           <input type="datetime-local" value={newProgStop} onChange={e => setNewProgStop(e.target.value)} className="w-full bg-slate-950/40 border border-white/5 rounded-2xl p-4 text-sm text-white" />
                         </div>
                      </div>
                      <div className="flex gap-4 pt-4">
                         <button onClick={() => setIsProgramModalOpen(false)} className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] text-slate-500">Cancel</button>
                         <button onClick={handleAddProgram} disabled={working || !newProgEpgId || !newProgTitle} className="flex-[2] h-14 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px]">{working ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Commit Program'}</button>
                      </div>
                   </div>
                </motion.div>
             </div>
          )}

          {isImportModalOpen && (
             <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsImportModalOpen(false)} />
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative w-full max-w-md bg-slate-900 border border-white/10 rounded-[3rem] p-10 shadow-2xl">
                   <h3 className="text-2xl font-black text-white tracking-tighter mb-8">Import <span className="text-emerald-500">EPG Data</span></h3>
                   <div className="flex p-1 bg-slate-950 rounded-2xl border border-white/5 mb-8">
                      <button onClick={() => setImportType('file')} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${importType === 'file' ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}>Local File</button>
                      <button onClick={() => setImportType('url')} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${importType === 'url' ? 'bg-white text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white'}`}>Remote URL</button>
                   </div>
                   <div className="space-y-8">
                      {importType === 'file' ? (
                        <div className="border-2 border-dashed border-white/10 rounded-[2rem] p-12 flex flex-col items-center justify-center gap-4 bg-slate-950/20 relative">
                           <input type="file" accept=".xml,.xmltv" onChange={e => setImportFile(e.target.files?.[0] || null)} className="absolute inset-0 opacity-0 cursor-pointer" />
                           <FileText size={32} className="text-emerald-500" />
                           <p className="text-[10px] text-white uppercase font-black">{importFile ? importFile.name : 'Choose XML'}</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                           <label className="text-[10px] font-black uppercase text-slate-500">URL</label>
                           <input type="url" value={importUrl} onChange={e => setImportUrl(e.target.value)} placeholder="https://..." className="w-full bg-slate-950/40 border border-white/5 rounded-2xl p-4 text-sm text-white" />
                        </div>
                      )}
                      <div className="flex gap-4">
                         <button onClick={() => setIsImportModalOpen(false)} className="flex-1 h-12 rounded-xl font-black uppercase text-[10px] text-slate-500">Cancel</button>
                         <button onClick={handleImport} disabled={working} className="flex-[2] h-12 bg-emerald-600 text-white rounded-xl font-black uppercase text-[10px]">{working ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Start Import'}</button>
                      </div>
                   </div>
                </motion.div>
             </div>
          )}
      </AnimatePresence>
    </div>
  );
};
