import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, GitMerge, Search, HelpCircle, Loader2, ArrowRight } from 'lucide-react';

interface Channel {
  id: number;
  name: string;
  stream_url: string;
  group_name: string;
}

interface MergeChannelsModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const MergeChannelsModal: React.FC<MergeChannelsModalProps> = ({ onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [sourceSearch, setSourceSearch] = useState('');
  const [targetSearch, setTargetSearch] = useState('');
  
  const [sourceResults, setSourceResults] = useState<Channel[]>([]);
  const [targetResults, setTargetResults] = useState<Channel[]>([]);
  
  const [selectedSource, setSelectedSource] = useState<Channel | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<Channel | null>(null);

  // Search source channels
  useEffect(() => {
    if (sourceSearch.trim().length < 2) {
      setSourceResults([]);
      return;
    }
    const delay = setTimeout(() => {
      fetch(`/api/channels?search=${encodeURIComponent(sourceSearch)}&per_page=5`)
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
      fetch(`/api/channels?search=${encodeURIComponent(targetSearch)}&per_page=5`)
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
        alert('Hợp nhất & Cập nhật link kênh thành công!');
        onSuccess();
        onClose();
      } else {
        alert(data.detail || 'Hợp nhất thất bại');
      }
    } catch (err) {
      alert('Đã xảy ra lỗi khi gọi API');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-slate-900 w-full max-w-3xl rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl flex flex-col relative"
      >
        {/* Header */}
        <div className="px-8 py-6 flex items-center justify-between bg-white/[0.02] border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-600/20 flex items-center justify-center text-amber-400">
              <GitMerge size={20} />
            </div>
            <div>
              <h3 className="text-white font-black text-sm uppercase tracking-tight">Merge & Update Links</h3>
              <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mt-0.5">Hợp nhất và cập nhật link m3u8 động</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl bg-white/5 text-slate-400 hover:text-rose-400 transition-all border border-white/5 z-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Source Selection (Kênh mới import có link tốt) */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-amber-400 uppercase tracking-widest block">
                Kênh Nguồn (Source - Chứa link mới)
              </label>
              
              {selectedSource ? (
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-amber-500/30 relative">
                  <h4 className="text-sm font-bold text-white">{selectedSource.name}</h4>
                  <p className="text-[10px] text-slate-500 mt-1 truncate">{selectedSource.stream_url}</p>
                  <span className="inline-block mt-2 px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[8px] font-black rounded-lg uppercase">
                    {selectedSource.group_name}
                  </span>
                  <button
                    onClick={() => setSelectedSource(null)}
                    className="absolute top-4 right-4 p-1 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="text"
                    placeholder="Search channel to get stream url..."
                    value={sourceSearch}
                    onChange={(e) => setSourceSearch(e.target.value)}
                    className="w-full bg-slate-950/40 border border-white/5 rounded-2xl pl-10 pr-4 py-3 text-xs text-white focus:outline-none focus:border-amber-500/50"
                  />
                  
                  {sourceResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-950 border border-white/10 rounded-2xl overflow-hidden z-10 shadow-2xl">
                      {sourceResults.map(ch => (
                        <button
                          key={ch.id}
                          onClick={() => {
                            setSelectedSource(ch);
                            setSourceSearch('');
                            setSourceResults([]);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-white/5 border-b border-white/5 transition-colors flex flex-col"
                        >
                          <span className="text-xs font-bold text-white">{ch.name}</span>
                          <span className="text-[9px] text-slate-500 truncate mt-0.5">{ch.stream_url}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Target Selection (Kênh cũ cần giữ cấu hình, playlist) */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block">
                Kênh Đích (Target - Kênh cũ nhận link)
              </label>

              {selectedTarget ? (
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-indigo-500/30 relative">
                  <h4 className="text-sm font-bold text-white">{selectedTarget.name}</h4>
                  <p className="text-[10px] text-slate-500 mt-1 truncate">{selectedTarget.stream_url}</p>
                  <span className="inline-block mt-2 px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[8px] font-black rounded-lg uppercase">
                    {selectedTarget.group_name}
                  </span>
                  <button
                    onClick={() => setSelectedTarget(null)}
                    className="absolute top-4 right-4 p-1 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="text"
                    placeholder="Search channel to be updated..."
                    value={targetSearch}
                    onChange={(e) => setTargetSearch(e.target.value)}
                    className="w-full bg-slate-950/40 border border-white/5 rounded-2xl pl-10 pr-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-500/50"
                  />

                  {targetResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-slate-950 border border-white/10 rounded-2xl overflow-hidden z-10 shadow-2xl">
                      {targetResults.map(ch => (
                        <button
                          key={ch.id}
                          onClick={() => {
                            setSelectedTarget(ch);
                            setTargetSearch('');
                            setTargetResults([]);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-white/5 border-b border-white/5 transition-colors flex flex-col"
                        >
                          <span className="text-xs font-bold text-white">{ch.name}</span>
                          <span className="text-[9px] text-slate-500 truncate mt-0.5">{ch.stream_url}</span>
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
              className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 space-y-4"
            >
              <h4 className="text-[10px] font-black text-white/40 uppercase tracking-widest">Xem trước thay đổi</h4>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Link mới (Từ Kênh Nguồn)</p>
                  <p className="text-xs font-mono text-amber-400 truncate mt-1">{selectedSource.stream_url}</p>
                </div>
                <div className="shrink-0 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-500">
                    <ArrowRight size={16} />
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
                  Sau khi bạn nhấn Merge, link stream của <strong>{selectedTarget.name}</strong> sẽ đổi thành link của <strong>{selectedSource.name}</strong>. Đồng thời kênh <strong>{selectedSource.name}</strong> sẽ tự động xóa khỏi danh sách. Kênh cũ sẽ được đưa về trạng thái "Unknown" để kiểm tra kết nối lại.
                </p>
              </div>
            </motion.div>
          )}

        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-slate-950/40 border-t border-white/5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-3 bg-white/5 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:text-white transition-all border border-white/5"
          >
            Hủy bỏ
          </button>
          <button
            disabled={loading || !selectedSource || !selectedTarget}
            onClick={handleMerge}
            className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/10"
          >
            {loading ? <Loader2 className="animate-spin" size={14} /> : <GitMerge size={14} />}
            Merge & Update
          </button>
        </div>

      </motion.div>
    </div>
  );
};
