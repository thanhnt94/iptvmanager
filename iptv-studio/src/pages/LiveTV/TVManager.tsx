import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Tv, Loader2, ArrowUp, ArrowDown } from 'lucide-react';

export const TVManager: React.FC = () => {
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState<any | null>(null);
  const [programs, setPrograms] = useState<any[]>([]);
  
  // Form states
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [logo, setLogo] = useState('');
  const [type, setType] = useState('loop');
  const [saving, setSaving] = useState(false);

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
    
    // Format programs for editing
    const formattedProgs = (ch.programs || []).map((p: any) => ({
      ...p,
      duration_minutes: Math.round(p.duration_seconds / 60),
      start_time_local: p.start_time ? new Date(p.start_time).toISOString().slice(0, 16) : ''
    }));
    setPrograms(formattedProgs);
  };

  const handleCreateNew = () => {
    setSelectedChannel({ isNew: true });
    setName('');
    setSlug('');
    setLogo('');
    setType('loop');
    setPrograms([]);
  };

  const handleSaveChannel = async () => {
    setSaving(true);
    try {
      const payload = { name, slug, logo, type, is_active: true };
      let channelId = selectedChannel?.id;
      
      if (selectedChannel?.isNew) {
        const res = await fetch('/api/livetv/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Failed to create channel");
        const newCh = await res.json();
        channelId = newCh.id;
      }
      
      // Save programs
      if (channelId) {
        const progsPayload = programs.map((p, idx) => ({
          channel_id: channelId,
          title: p.title,
          video_url: p.video_url,
          is_live_stream: p.is_live_stream || false,
          duration_seconds: (parseInt(p.duration_minutes) || 60) * 60,
          order_index: idx,
          start_time: p.start_time_local ? new Date(p.start_time_local).toISOString() : null
        }));
        
        await fetch(`/api/livetv/channels/${channelId}/programs/bulk`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ programs: progsPayload })
        });
      }
      
      await loadMyChannels();
      setSelectedChannel(null);
      alert('Đã lưu kênh thành công!');
    } catch (err) {
      alert('Có lỗi xảy ra khi lưu. Vui lòng kiểm tra lại (Lưu ý: Slug phải là duy nhất).');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const addProgram = () => {
    setPrograms([...programs, { title: '', video_url: '', duration_minutes: 60, is_live_stream: false, start_time_local: '' }]);
  };

  const updateProgram = (index: number, field: string, value: any) => {
    const newProgs = [...programs];
    newProgs[index][field] = value;
    setPrograms(newProgs);
  };

  const removeProgram = (index: number) => {
    setPrograms(programs.filter((_, i) => i !== index));
  };

  const moveProgram = (index: number, direction: number) => {
    if (index + direction < 0 || index + direction >= programs.length) return;
    const newProgs = [...programs];
    const temp = newProgs[index];
    newProgs[index] = newProgs[index + direction];
    newProgs[index + direction] = temp;
    setPrograms(newProgs);
  };

  if (loading) return <div className="p-8 text-white"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-[#070b14] text-slate-200">
      
      {/* Sidebar */}
      <div className="w-full md:w-80 bg-[#0f172a] border-r border-white/5 flex flex-col">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <h2 className="font-bold text-white flex items-center gap-2">
            <Tv size={20} className="text-indigo-400" />
            Các Kênh Của Tôi
          </h2>
          <button onClick={handleCreateNew} className="p-2 bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors text-white">
            <Plus size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {channels.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">Bạn chưa có kênh nào.</p>
          ) : (
            channels.map(ch => (
              <div 
                key={ch.id}
                onClick={() => handleSelectChannel(ch)}
                className={`p-3 rounded-xl cursor-pointer border transition-all ${selectedChannel?.id === ch.id ? 'bg-indigo-500/20 border-indigo-500/50 text-white' : 'bg-white/5 border-transparent hover:bg-white/10 text-slate-300'}`}
              >
                <div className="font-bold">{ch.name}</div>
                <div className="text-xs opacity-60">/{ch.slug} • {ch.type === 'loop' ? 'Phát lặp' : 'Lên lịch'}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 overflow-y-auto bg-[#070b14] p-4 md:p-8 custom-scrollbar">
        {!selectedChannel ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500">
            <Tv size={64} className="mb-4 opacity-20" />
            <p>Chọn một kênh bên trái hoặc tạo kênh mới để bắt đầu thiết lập.</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h1 className="text-2xl font-bold text-white">
                {selectedChannel.isNew ? 'Tạo Kênh Mới' : `Chỉnh sửa: ${selectedChannel.name}`}
              </h1>
              <button 
                onClick={handleSaveChannel} 
                disabled={saving || !name || !slug}
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-2 transition-colors"
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                Lưu Kênh
              </button>
            </div>

            {/* General Info */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-2">Tên Kênh</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500" placeholder="Ví dụ: VTV1 HD" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-2">Đường dẫn (Slug)</label>
                <input type="text" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500" placeholder="vi-du-vtv1" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-slate-400 mb-2">Logo URL (Tuỳ chọn)</label>
                <input type="text" value={logo} onChange={e => setLogo(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-indigo-500" placeholder="https://..." />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-slate-400 mb-2">Chế độ phát sóng</label>
                <div className="flex gap-4">
                  <label className={`flex-1 flex items-center gap-3 p-4 rounded-xl cursor-pointer border ${type === 'loop' ? 'bg-indigo-500/20 border-indigo-500/50' : 'bg-black/50 border-white/10'}`}>
                    <input type="radio" checked={type === 'loop'} onChange={() => setType('loop')} className="hidden" />
                    <div>
                      <div className="font-bold text-white">Playlist Lặp (Loop)</div>
                      <div className="text-xs text-slate-400">Phát liên tiếp các video trong danh sách vô hạn.</div>
                    </div>
                  </label>
                  <label className={`flex-1 flex items-center gap-3 p-4 rounded-xl cursor-pointer border ${type === 'schedule' ? 'bg-indigo-500/20 border-indigo-500/50' : 'bg-black/50 border-white/10'}`}>
                    <input type="radio" checked={type === 'schedule'} onChange={() => setType('schedule')} className="hidden" />
                    <div>
                      <div className="font-bold text-white">Lên lịch (EPG)</div>
                      <div className="text-xs text-slate-400">Chỉ định thời gian bắt đầu chính xác cho từng video.</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Programs List */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Nội Dung Phát Sóng</h2>
                <button onClick={addProgram} className="text-sm px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium flex items-center gap-2">
                  <Plus size={16} /> Thêm Video
                </button>
              </div>

              {programs.length === 0 ? (
                <div className="text-center py-10 bg-white/5 border border-white/10 rounded-2xl text-slate-500">
                  Chưa có video nào. Bấm "Thêm Video" để bắt đầu.
                </div>
              ) : (
                <div className="space-y-4">
                  {programs.map((prog, idx) => (
                    <div key={idx} className="bg-white/5 border border-white/10 rounded-xl p-4 flex gap-4">
                      {type === 'loop' && (
                        <div className="flex flex-col gap-1 justify-center">
                          <button onClick={() => moveProgram(idx, -1)} disabled={idx === 0} className="p-1 text-slate-500 hover:text-white disabled:opacity-30"><ArrowUp size={16} /></button>
                          <button onClick={() => moveProgram(idx, 1)} disabled={idx === programs.length - 1} className="p-1 text-slate-500 hover:text-white disabled:opacity-30"><ArrowDown size={16} /></button>
                        </div>
                      )}
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <input type="text" value={prog.title} onChange={e => updateProgram(idx, 'title', e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500" placeholder="Tên video..." />
                        </div>
                        <div>
                          <input type="text" value={prog.video_url} onChange={e => updateProgram(idx, 'video_url', e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500" placeholder="URL m3u8, mp4, Youtube..." />
                        </div>
                        <div className="flex items-center gap-4 md:col-span-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">Thời lượng (phút):</span>
                            <input type="number" value={prog.duration_minutes} onChange={e => updateProgram(idx, 'duration_minutes', e.target.value)} className="w-20 bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-white text-sm focus:border-indigo-500" />
                          </div>
                          {type === 'schedule' && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400">Bắt đầu lúc:</span>
                              <input type="datetime-local" value={prog.start_time_local} onChange={e => updateProgram(idx, 'start_time_local', e.target.value)} className="bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-white text-sm focus:border-indigo-500" />
                            </div>
                          )}
                          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer ml-auto">
                            <input type="checkbox" checked={prog.is_live_stream} onChange={e => updateProgram(idx, 'is_live_stream', e.target.checked)} className="rounded bg-black border-white/10" />
                            Tiếp sóng trực tiếp (bỏ qua tua)
                          </label>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <button onClick={() => removeProgram(idx)} className="p-2 text-red-400 hover:bg-red-400/20 rounded-lg transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
};
