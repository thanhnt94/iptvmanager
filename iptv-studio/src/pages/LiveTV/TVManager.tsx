import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Save, Tv, Loader2, ArrowUp, ArrowDown, Settings2, Image as ImageIcon, Video, CalendarDays, GripVertical, CheckCircle2, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatInTimeZone, toDate } from 'date-fns-tz';

const TIMEZONES = [
  'UTC', 'Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Tokyo', 'Asia/Seoul', 
  'Europe/London', 'America/New_York', 'America/Los_Angeles'
];

export const TVManager: React.FC = () => {
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState<any | null>(null);
  const [programs, setPrograms] = useState<any[]>([]);
  
  // Tabs
  const [activeTab, setActiveTab] = useState<'general' | 'programming'>('general');

  // Form states
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [logo, setLogo] = useState('');
  const [type, setType] = useState('loop');
  const [timezone, setTimezone] = useState('Asia/Ho_Chi_Minh');
  const [showWatermark, setShowWatermark] = useState(true);
  const [saving, setSaving] = useState(false);

  // EPG Active Date
  const [activeDate, setActiveDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  useEffect(() => {
    loadMyChannels();
  }, []);

  const loadMyChannels = async () => {
    try {
      const res = await fetch('/api/livetv/my');
      if (res.ok) {
        const data = await res.json();
        setChannels(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectChannel = (ch: any) => {
    setSelectedChannel(ch);
    setName(ch.name);
    setSlug(ch.slug);
    setLogo(ch.logo || '');
    setType(ch.type);
    setTimezone(ch.timezone || 'Asia/Ho_Chi_Minh');
    setShowWatermark(ch.show_watermark !== false); // default true
    setActiveTab('general');
    
    // Format programs for editing
    const chTz = ch.timezone || 'Asia/Ho_Chi_Minh';
    const formattedProgs = (ch.programs || []).map((p: any) => {
      let bDate = '';
      let bTime = '';
      if (p.start_time) {
        // p.start_time is returned as UTC from server. It might miss 'Z'.
        const utcStr = p.start_time.endsWith('Z') ? p.start_time : p.start_time + 'Z';
        bDate = formatInTimeZone(utcStr, chTz, 'yyyy-MM-dd');
        bTime = formatInTimeZone(utcStr, chTz, 'HH:mm:ss');
      }
      return {
        ...p,
        duration_minutes: Math.round(p.duration_seconds / 60),
        broadcast_date: bDate,
        broadcast_time: bTime,
        uid: Math.random().toString(36).substr(2, 9)
      };
    });
    setPrograms(formattedProgs);
    
    // Auto-set activeDate to the first program's date if available
    if (ch.type === 'schedule' && formattedProgs.length > 0) {
      const firstDate = formattedProgs.find((p: any) => p.broadcast_date)?.broadcast_date;
      if (firstDate) setActiveDate(firstDate);
    }
  };

  const handleCreateNew = () => {
    setSelectedChannel({ isNew: true });
    setName('');
    setSlug('');
    setLogo('');
    setType('loop');
    setTimezone('Asia/Ho_Chi_Minh');
    setShowWatermark(true);
    setPrograms([]);
    setActiveTab('general');
  };

  const handleSaveChannel = async () => {
    setSaving(true);
    try {
      const payload = { name, slug, logo, type, timezone, show_watermark: showWatermark, is_active: true };
      let channelId = selectedChannel?.id;
      
      if (selectedChannel?.isNew) {
        const res = await fetch('/api/livetv/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail);
        channelId = data.id;
      } else {
        const res = await fetch(`/api/livetv/channels/${channelId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Update failed');
      }
      
      // Save programs
      if (channelId) {
        const progsPayload = programs.map((p, idx) => {
          let st = null;
          if (type === 'schedule' && p.broadcast_date && p.broadcast_time) {
            try {
              const bTime = p.broadcast_time.split(':').length === 2 ? p.broadcast_time + ':00' : p.broadcast_time;
              const dateObj = toDate(`${p.broadcast_date}T${bTime}`, { timeZone: timezone });
              st = dateObj.toISOString();
            } catch(e) { console.error(e); }
          }
          return {
            channel_id: channelId,
            title: p.title,
            video_url: p.video_url,
            is_live_stream: p.is_live_stream || false,
            duration_seconds: (parseInt(p.duration_minutes) || 60) * 60,
            order_index: idx,
            start_time: st
          };
        });
        
        await fetch(`/api/livetv/channels/${channelId}/programs/bulk`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ programs: progsPayload })
        });
      }
      
      await loadMyChannels();
      
      const res = await fetch('/api/livetv/my');
      const data = await res.json();
      const updated = data.find((c: any) => c.id === channelId);
      if (updated) handleSelectChannel(updated);
      
      alert('Đã lưu đài truyền hình thành công!');
    } catch (err) {
      alert('Có lỗi xảy ra khi lưu. Vui lòng kiểm tra lại slug hoặc thông tin.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const addProgram = () => {
    setPrograms([...programs, { 
      uid: Math.random().toString(36).substr(2, 9),
      title: '', 
      video_url: '', 
      duration_minutes: 60, 
      is_live_stream: false, 
      broadcast_date: type === 'schedule' ? activeDate : '',
      broadcast_time: ''
    }]);
  };

  const updateProgram = (uid: string, field: string, value: any) => {
    setPrograms(programs.map(p => p.uid === uid ? { ...p, [field]: value } : p));
  };

  const removeProgram = (uid: string) => {
    setPrograms(programs.filter(p => p.uid !== uid));
  };

  const moveProgram = (uid: string, direction: number) => {
    const index = programs.findIndex(p => p.uid === uid);
    if (index + direction < 0 || index + direction >= programs.length) return;
    const newProgs = [...programs];
    const temp = newProgs[index];
    newProgs[index] = newProgs[index + direction];
    newProgs[index + direction] = temp;
    setPrograms(newProgs);
  };

  const visiblePrograms = useMemo(() => {
    if (type !== 'schedule') return programs;
    return programs.filter(p => p.broadcast_date === activeDate).sort((a, b) => {
      if (!a.broadcast_time) return 1;
      if (!b.broadcast_time) return -1;
      return a.broadcast_time.localeCompare(b.broadcast_time);
    });
  }, [programs, type, activeDate]);

  if (loading) return <div className="p-8 text-white h-full flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={48} /></div>;

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-slate-950 text-slate-200 relative">
      
      {/* Background Decorators */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Sidebar */}
      <div className="w-full md:w-80 bg-slate-900/50 backdrop-blur-xl border-r border-white/5 flex flex-col z-10">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tighter">My Stations</h2>
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-1">TV Management</p>
          </div>
          <button onClick={handleCreateNew} className="w-10 h-10 bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all text-white flex items-center justify-center shadow-lg shadow-indigo-600/20 active:scale-95">
            <Plus size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {channels.length === 0 ? (
            <div className="p-8 text-center bg-white/5 rounded-3xl border border-white/5">
               <Tv className="mx-auto text-slate-600 mb-3" size={32} />
               <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">No Stations</p>
            </div>
          ) : (
            channels.map((ch, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                key={ch.id}
                onClick={() => handleSelectChannel(ch)}
                className={`p-4 rounded-2xl cursor-pointer border transition-all ${selectedChannel?.id === ch.id ? 'bg-indigo-500/10 border-indigo-500/50 shadow-xl shadow-indigo-500/5' : 'bg-slate-950/40 border-white/5 hover:border-white/20'}`}
              >
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-center p-1.5 shrink-0">
                     {ch.logo ? <img src={ch.logo} className="w-full h-full object-contain" alt="" /> : <Tv size={16} className="text-slate-600" />}
                   </div>
                   <div className="min-w-0">
                     <div className="font-black text-white truncate text-sm">{ch.name}</div>
                     <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">/{ch.slug}</span>
                        <span className={`px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase tracking-widest ${ch.type === 'loop' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                          {ch.type === 'loop' ? 'Loop' : 'EPG'}
                        </span>
                     </div>
                   </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 overflow-y-auto bg-transparent p-4 md:p-8 custom-scrollbar z-10">
        {!selectedChannel ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
            <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
               <Tv size={48} className="text-slate-700" />
            </div>
            <p className="font-black text-sm uppercase tracking-widest">Select a station to configure</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <header className="glass p-6 rounded-[2rem] border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-20">
              <div className="flex items-center gap-4">
                 <div className="w-14 h-14 rounded-2xl bg-slate-950 border border-white/10 flex items-center justify-center p-2 shrink-0">
                    {logo ? <img src={logo} className="w-full h-full object-contain" alt="" /> : <Tv size={24} className="text-slate-600" />}
                 </div>
                 <div>
                   <h1 className="text-2xl font-black text-white tracking-tighter uppercase">
                     {selectedChannel.isNew ? 'Create New Station' : name}
                   </h1>
                   <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mt-0.5">{selectedChannel.isNew ? 'Configuration' : 'Station Editor'}</p>
                 </div>
              </div>
              
              <div className="flex items-center gap-3">
                {!selectedChannel.isNew && (
                  <button 
                    onClick={(e) => {
                      const url = `${window.location.origin}/api/livetv/channels/${slug}/stream`;
                      navigator.clipboard.writeText(url);
                      const btn = e.currentTarget;
                      const originalText = btn.innerHTML;
                      btn.innerHTML = 'COPIED!';
                      setTimeout(() => { btn.innerHTML = originalText; }, 2000);
                    }}
                    className="px-4 py-3 bg-white/5 hover:bg-white/10 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 border border-white/10"
                    title="Copy direct stream URL for Smart TV or External IPTV Players"
                  >
                    Copy Link
                  </button>
                )}
                <button 
                  onClick={handleSaveChannel} 
                  disabled={saving || !name || !slug}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl shadow-indigo-600/20"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Commit Changes
                </button>
              </div>
            </header>

            {/* Tabs Navigation */}
            <div className="flex items-center gap-2 p-1.5 bg-white/5 rounded-2xl border border-white/5 w-fit">
               <button 
                 onClick={() => setActiveTab('general')}
                 className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'general' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-500 hover:text-white'}`}
               >
                  <Settings2 size={14} /> General Config
               </button>
               <button 
                 onClick={() => setActiveTab('programming')}
                 className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'programming' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-500 hover:text-white'}`}
               >
                  <Video size={14} /> Programming
               </button>
            </div>

            <AnimatePresence mode="wait">
              {activeTab === 'general' && (
                <motion.div 
                  key="general"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className="glass border border-white/5 rounded-[2rem] p-8 space-y-8"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                         <Tv size={12} /> Station Name
                      </label>
                      <input 
                        type="text" 
                        value={name} 
                        onChange={e => {
                          setName(e.target.value);
                          if (!slug || selectedChannel?.isNew) {
                            setSlug(e.target.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''));
                          }
                        }} 
                        className="w-full bg-slate-950/50 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm font-black focus:outline-none focus:border-indigo-500 focus:bg-slate-900 transition-all" 
                        placeholder="e.g. VTV1 HD" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                         Routing Slug
                      </label>
                      <input type="text" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} className="w-full bg-slate-950/50 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm font-black focus:outline-none focus:border-indigo-500 focus:bg-slate-900 transition-all" placeholder="e.g. vtv1-hd" />
                    </div>
                    <div className="md:col-span-2 space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                         <ImageIcon size={12} /> Branding Logo URL
                      </label>
                      <input type="text" value={logo} onChange={e => setLogo(e.target.value)} className="w-full bg-slate-950/50 border border-white/10 rounded-2xl px-5 py-4 text-slate-300 text-sm font-mono focus:outline-none focus:border-indigo-500 focus:bg-slate-900 transition-all" placeholder="https://..." />
                    </div>
                  </div>
                  <div className="pt-6 border-t border-white/5 space-y-4">
                    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                       Broadcasting Mode
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className={`flex items-start gap-4 p-5 rounded-3xl cursor-pointer border transition-all ${type === 'loop' ? 'bg-indigo-500/10 border-indigo-500/50 shadow-lg shadow-indigo-500/10' : 'bg-slate-950/30 border-white/5 hover:border-white/20'}`}>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${type === 'loop' ? 'border-indigo-500' : 'border-slate-600'}`}>
                           {type === 'loop' && <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />}
                           <input type="radio" className="hidden" checked={type === 'loop'} onChange={() => setType('loop')} />
                        </div>
                        <div>
                          <div className="font-black text-white uppercase tracking-tight">Loop Playlist</div>
                          <div className="text-[11px] text-slate-400 font-medium leading-relaxed mt-1">Seamlessly loop a sequence of videos endlessly. Best for 24/7 continuous music or movie channels.</div>
                        </div>
                      </label>
                      <label className={`flex items-start gap-4 p-5 rounded-3xl cursor-pointer border transition-all ${type === 'schedule' ? 'bg-indigo-500/10 border-indigo-500/50 shadow-lg shadow-indigo-500/10' : 'bg-slate-950/30 border-white/5 hover:border-white/20'}`}>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${type === 'schedule' ? 'border-indigo-500' : 'border-slate-600'}`}>
                           {type === 'schedule' && <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />}
                           <input type="radio" className="hidden" checked={type === 'schedule'} onChange={() => setType('schedule')} />
                        </div>
                        <div>
                          <div className="font-black text-white uppercase tracking-tight">EPG Schedule</div>
                          <div className="text-[11px] text-slate-400 font-medium leading-relaxed mt-1">Strictly schedule programs with exact broadcast dates and times. Missing slots will display a placeholder.</div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-white/5 space-y-4">
                    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                       Timezone Settings
                    </label>
                    <div className="flex flex-col gap-2">
                      <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
                        Select the timezone for this station. All EPG Schedule times will be interpreted and displayed in this timezone.
                      </p>
                      <select 
                        value={timezone} 
                        onChange={e => setTimezone(e.target.value)} 
                        className="w-full md:w-1/2 bg-slate-950/50 border border-white/10 rounded-2xl px-5 py-3 text-white text-sm font-black focus:outline-none focus:border-indigo-500 focus:bg-slate-900 transition-all cursor-pointer"
                      >
                        {TIMEZONES.map(tz => (
                          <option key={tz} value={tz}>{tz}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-white/5 space-y-4">
                    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                       Player Settings
                    </label>
                    <label className="flex items-center gap-4 cursor-pointer">
                      <div className="relative inline-block w-12 h-6 rounded-full transition-colors" style={{ backgroundColor: showWatermark ? '#6366f1' : '#334155' }}>
                        <input type="checkbox" className="hidden" checked={showWatermark} onChange={e => setShowWatermark(e.target.checked)} />
                        <span className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${showWatermark ? 'translate-x-6' : 'translate-x-0'}`} />
                      </div>
                      <span className="text-sm font-bold text-white">Show Logo Watermark on Player</span>
                    </label>
                  </div>
                </motion.div>
              )}

              {activeTab === 'programming' && (
                <motion.div 
                  key="programming"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {/* Scheduling Header (If EPG) */}
                  {type === 'schedule' && (
                    <div className="glass border border-white/5 rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                       <div className="space-y-1">
                          <h3 className="text-lg font-black text-white tracking-tighter uppercase flex items-center gap-2">
                            <CalendarDays size={18} className="text-indigo-400" /> Broadcast Day
                          </h3>
                          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Select a day to manage its programming schedule</p>
                       </div>
                       <div className="relative">
                          <input 
                            type="date" 
                            value={activeDate}
                            onChange={(e) => setActiveDate(e.target.value)}
                            className="bg-slate-950/80 border border-white/10 rounded-2xl pl-12 pr-6 py-3 text-white text-sm font-black focus:outline-none focus:border-indigo-500 w-full md:w-auto appearance-none [&::-webkit-calendar-picker-indicator]:invert" 
                          />
                          <CalendarDays className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" size={16} />
                       </div>
                    </div>
                  )}

                  {/* Programs List */}
                  <div className="glass border border-white/5 rounded-[2.5rem] p-4 md:p-8">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                         <h2 className="text-xl font-black text-white tracking-tighter uppercase">Program Blocks</h2>
                         <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">
                           {type === 'schedule' ? `Showing ${visiblePrograms.length} programs for ${activeDate}` : `Total ${programs.length} programs in sequence`}
                         </p>
                      </div>
                      <button onClick={addProgram} className="h-10 px-4 bg-white/5 hover:bg-white/10 rounded-xl text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-colors border border-white/5">
                        <Plus size={14} /> Add Block
                      </button>
                    </div>

                    {visiblePrograms.length === 0 ? (
                      <div className="text-center py-16 bg-slate-950/30 border border-white/5 rounded-3xl text-slate-500">
                        <Video size={48} className="mx-auto text-slate-700 mb-4" />
                        <p className="font-black text-sm uppercase tracking-widest">No programming defined</p>
                        <p className="text-xs mt-2">Click "Add Block" to append a media source.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <AnimatePresence>
                        {visiblePrograms.map((prog, index) => (
                          <motion.div 
                            key={prog.uid}
                            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-slate-950/60 border border-white/5 rounded-3xl p-5 flex flex-col md:flex-row gap-5 group hover:border-white/10 transition-colors"
                          >
                            {/* Drag handles for Loop mode */}
                            {type === 'loop' && (
                              <div className="flex flex-row md:flex-col gap-1 items-center justify-center shrink-0">
                                <button onClick={() => moveProgram(prog.uid, -1)} disabled={index === 0} className="p-1.5 text-slate-600 hover:text-white hover:bg-white/10 rounded-lg disabled:opacity-20 transition-all"><ArrowUp size={16} /></button>
                                <GripVertical size={16} className="text-slate-800 hidden md:block" />
                                <button onClick={() => moveProgram(prog.uid, 1)} disabled={index === visiblePrograms.length - 1} className="p-1.5 text-slate-600 hover:text-white hover:bg-white/10 rounded-lg disabled:opacity-20 transition-all"><ArrowDown size={16} /></button>
                              </div>
                            )}

                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Program Title</label>
                                <input type="text" value={prog.title} onChange={e => updateProgram(prog.uid, 'title', e.target.value)} className="w-full bg-slate-900 border border-white/5 rounded-xl px-4 py-2.5 text-white text-sm font-bold focus:border-indigo-500 focus:outline-none transition-all" placeholder="e.g. Breaking News" />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 ml-1">Media URL (m3u8, mp4, youtube)</label>
                                <input type="text" value={prog.video_url} onChange={e => updateProgram(prog.uid, 'video_url', e.target.value)} className="w-full bg-slate-900 border border-white/5 rounded-xl px-4 py-2.5 text-slate-300 text-sm font-mono focus:border-indigo-500 focus:outline-none transition-all" placeholder="https://..." />
                              </div>
                              
                              <div className="md:col-span-2 flex flex-wrap items-center gap-4 bg-white/[0.02] p-3 rounded-2xl border border-white/5">
                                <div className="flex items-center gap-3 bg-slate-950/50 px-3 py-1.5 rounded-xl border border-white/5">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Duration (Min)</span>
                                  <input type="number" value={prog.duration_minutes} onChange={e => updateProgram(prog.uid, 'duration_minutes', e.target.value)} className="w-16 bg-transparent border-none text-white text-sm font-bold focus:outline-none text-right" />
                                </div>

                                {type === 'schedule' && (
                                  <>
                                    <div className="flex items-center gap-3 bg-slate-950/50 px-3 py-1.5 rounded-xl border border-white/5">
                                      <CalendarDays size={12} className="text-indigo-400" />
                                      <input 
                                        type="date" 
                                        value={prog.broadcast_date} 
                                        onChange={e => updateProgram(prog.uid, 'broadcast_date', e.target.value)} 
                                        className="bg-transparent border-none text-indigo-300 text-[11px] font-black focus:outline-none appearance-none [&::-webkit-calendar-picker-indicator]:invert w-[110px]" 
                                        title="Chuyển video này sang ngày khác"
                                      />
                                    </div>
                                    <div className="flex items-center gap-3 bg-slate-950/50 px-3 py-1.5 rounded-xl border border-white/5">
                                      <Clock size={12} className="text-indigo-400" />
                                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Start Time</span>
                                      <input 
                                        type="time" 
                                        step="1"
                                        value={prog.broadcast_time} 
                                        onChange={e => updateProgram(prog.uid, 'broadcast_time', e.target.value)} 
                                        className="bg-transparent border-none text-indigo-300 text-sm font-black focus:outline-none appearance-none [&::-webkit-calendar-picker-indicator]:invert" 
                                      />
                                    </div>
                                  </>
                                )}
                                
                                <label className="flex items-center gap-2 cursor-pointer ml-auto mr-2 group/check">
                                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${prog.is_live_stream ? 'bg-rose-500 border-rose-400' : 'bg-slate-900 border-white/20 group-hover/check:border-rose-500/50'}`}>
                                     {prog.is_live_stream && <CheckCircle2 size={12} className="text-white" />}
                                  </div>
                                  <input type="checkbox" checked={prog.is_live_stream} onChange={e => updateProgram(prog.uid, 'is_live_stream', e.target.checked)} className="hidden" />
                                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover/check:text-slate-300">Live Stream Relay</span>
                                </label>
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-end">
                              <button onClick={() => removeProgram(prog.uid)} className="w-10 h-10 bg-slate-900 hover:bg-rose-500 text-slate-600 hover:text-white rounded-xl transition-all flex items-center justify-center border border-white/5">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </motion.div>
                        ))}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};
