import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { GitMerge, Search, HelpCircle, Loader2, ArrowRight, X, CheckCircle } from 'lucide-react';

interface Channel {
  id: number;
  name: string;
  stream_url: string;
  group_name: string;
}

export const MergeChannels: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [sourceSearch, setSourceSearch] = useState('');
  const [targetSearch, setTargetSearch] = useState('');
  
  const [sourceResults, setSourceResults] = useState<Channel[]>([]);
  const [targetResults, setTargetResults] = useState<Channel[]>([]);
  
  const [selectedSource, setSelectedSource] = useState<Channel | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<Channel | null>(null);
  const [mergeSuccess, setMergeSuccess] = useState(false);

  // Search source channels
  useEffect(() => {
    if (sourceSearch.trim().length < 2) {
      setSourceResults([]);
      return;
    }
    const delay = setTimeout(() => {
      fetch(`/api/channels?search=${encodeURIComponent(sourceSearch)}&per_page=10`)
        .then(res => res.json())
        .then(data => {
          setSourceResults(data.channels || []);
        })
        .catch(err => console.error(err));
    }, 300);
    return () => clearTimeout(delay);
  }, [sourceSearch]);

  // Search target channels
  useEffect(() => {
    if (targetSearch.trim().length < 2) {
      setTargetResults([]);
      return;
    }
    const delay = setTimeout(() => {
      fetch(`/api/channels?search=${encodeURIComponent(targetSearch)}&per_page=10`)
        .then(res => res.json())
        .then(data => {
          setTargetResults(data.channels || []);
        })
        .catch(err => console.error(err));
    }, 300);
    return () => clearTimeout(delay);
  }, [targetSearch]);

  const handleMerge = async () => {
    if (!selectedSource || !selectedTarget) return;
    if (selectedSource.id === selectedTarget.id) {
      alert("Source and Target channels must be different!");
      return;
    }

    if (!confirm(`Bạn có chắc chắn muốn chuyển link của "${selectedSource.name}" sang "${selectedTarget.name}"?\n\nKênh "${selectedSource.name}" sẽ bị XOÁ sau khi chuyển.`)) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/channels/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_id: selectedSource.id,
          target_id: selectedTarget.id
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        setMergeSuccess(true);
        setTimeout(() => {
          setSelectedSource(null);
          setSelectedTarget(null);
          setMergeSuccess(false);
        }, 3000);
      } else {
        alert(data.detail || 'Hợp nhất thất bại');
      }
    } catch {
      alert('Đã xảy ra lỗi khi gọi API');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-600/20 flex items-center justify-center text-amber-400">
          <GitMerge size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Merge Channels</h1>
          <p className="text-slate-500 text-xs font-semibold mt-0.5">Hợp nhất link stream — Lấy link kênh nguồn cập nhật cho kênh đích, xoá kênh nguồn</p>
        </div>
      </div>

      {/* Success Banner */}
      {mergeSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3"
        >
          <CheckCircle className="text-emerald-400" size={20} />
          <p className="text-emerald-400 text-sm font-bold">Hợp nhất & Cập nhật link kênh thành công!</p>
        </motion.div>
      )}

      {/* Main Content */}
      <div className="bg-slate-900/50 rounded-[2rem] border border-white/5 overflow-hidden">
        <div className="p-8 space-y-8">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Source Selection */}
            <div className="space-y-4">
              <label className="text-[10px] font-black text-amber-400 uppercase tracking-widest block">
                🔗 Kênh Nguồn (Source — Chứa link mới)
              </label>
              <p className="text-[10px] text-slate-600 leading-relaxed">
                Kênh mới import vào, có chứa link stream m3u8 bạn muốn lấy. Kênh này sẽ bị xoá sau khi merge.
              </p>
              
              {selectedSource ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20 relative"
                >
                  <h4 className="text-sm font-bold text-white">{selectedSource.name}</h4>
                  <p className="text-[10px] text-amber-400/60 mt-1.5 truncate font-mono">{selectedSource.stream_url}</p>
                  <span className="inline-block mt-2.5 px-2.5 py-1 bg-amber-500/10 text-amber-400 text-[8px] font-black rounded-lg uppercase tracking-wider">
                    {selectedSource.group_name}
                  </span>
                  <button
                    onClick={() => setSelectedSource(null)}
                    className="absolute top-4 right-4 p-1.5 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors"
                  >
                    <X size={14} />
                  </button>
                </motion.div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="text"
                    placeholder="Tìm kênh nguồn chứa link mới..."
                    value={sourceSearch}
                    onChange={(e) => setSourceSearch(e.target.value)}
                    className="w-full bg-slate-950/60 border border-white/5 rounded-2xl pl-11 pr-4 py-3.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-colors"
                  />
                  
                  {sourceResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-950 border border-white/10 rounded-2xl overflow-hidden z-10 shadow-2xl max-h-60 overflow-y-auto">
                      {sourceResults.map(ch => (
                        <button
                          key={ch.id}
                          onClick={() => {
                            setSelectedSource(ch);
                            setSourceSearch('');
                            setSourceResults([]);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-amber-500/5 border-b border-white/5 transition-colors flex flex-col"
                        >
                          <span className="text-xs font-bold text-white">{ch.name}</span>
                          <span className="text-[9px] text-slate-500 truncate mt-0.5 font-mono">{ch.stream_url}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Target Selection */}
            <div className="space-y-4">
              <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block">
                📺 Kênh Đích (Target — Kênh cũ nhận link)
              </label>
              <p className="text-[10px] text-slate-600 leading-relaxed">
                Kênh đã tồn tại trong hệ thống, sẽ được cập nhật link stream mới từ kênh nguồn.
              </p>

              {selectedTarget ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-5 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 relative"
                >
                  <h4 className="text-sm font-bold text-white">{selectedTarget.name}</h4>
                  <p className="text-[10px] text-indigo-400/60 mt-1.5 truncate font-mono">{selectedTarget.stream_url}</p>
                  <span className="inline-block mt-2.5 px-2.5 py-1 bg-indigo-500/10 text-indigo-400 text-[8px] font-black rounded-lg uppercase tracking-wider">
                    {selectedTarget.group_name}
                  </span>
                  <button
                    onClick={() => setSelectedTarget(null)}
                    className="absolute top-4 right-4 p-1.5 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-colors"
                  >
                    <X size={14} />
                  </button>
                </motion.div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="text"
                    placeholder="Tìm kênh đích cần cập nhật link..."
                    value={targetSearch}
                    onChange={(e) => setTargetSearch(e.target.value)}
                    className="w-full bg-slate-950/60 border border-white/5 rounded-2xl pl-11 pr-4 py-3.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                  />

                  {targetResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-950 border border-white/10 rounded-2xl overflow-hidden z-10 shadow-2xl max-h-60 overflow-y-auto">
                      {targetResults.map(ch => (
                        <button
                          key={ch.id}
                          onClick={() => {
                            setSelectedTarget(ch);
                            setTargetSearch('');
                            setTargetResults([]);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-indigo-500/5 border-b border-white/5 transition-colors flex flex-col"
                        >
                          <span className="text-xs font-bold text-white">{ch.name}</span>
                          <span className="text-[9px] text-slate-500 truncate mt-0.5 font-mono">{ch.stream_url}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* Preview Action box */}
          {selectedSource && selectedTarget && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 space-y-5"
            >
              <h4 className="text-[10px] font-black text-white/40 uppercase tracking-widest">Xem trước thay đổi</h4>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Link mới (Từ Kênh Nguồn)</p>
                  <p className="text-xs font-mono text-amber-400 truncate mt-1">{selectedSource.stream_url}</p>
                </div>
                <div className="shrink-0 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                    <ArrowRight size={18} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Kênh đích sẽ được cập nhật</p>
                  <p className="text-xs font-bold text-white mt-1">{selectedTarget.name}</p>
                  <p className="text-[9px] text-slate-500 truncate font-mono mt-0.5">Link cũ sẽ bị đè: {selectedTarget.stream_url}</p>
                </div>
              </div>

              <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10 flex gap-3 text-amber-400/80 text-[10px]">
                <HelpCircle size={16} className="shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Sau khi nhấn <strong>Merge</strong>, link stream của <strong>{selectedTarget.name}</strong> sẽ đổi thành link của <strong>{selectedSource.name}</strong>. Đồng thời kênh <strong>{selectedSource.name}</strong> sẽ tự động xóa khỏi danh sách. Kênh đích sẽ được đưa về trạng thái "Unknown" để kiểm tra kết nối lại.
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  disabled={loading}
                  onClick={handleMerge}
                  className="px-8 py-3.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2.5 transition-all shadow-lg shadow-indigo-500/20"
                >
                  {loading ? <Loader2 className="animate-spin" size={14} /> : <GitMerge size={14} />}
                  Merge & Update
                </button>
              </div>
            </motion.div>
          )}

        </div>
      </div>
    </div>
  );
};
