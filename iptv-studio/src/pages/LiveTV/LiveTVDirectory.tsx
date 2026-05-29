import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tv, MonitorPlay, Loader2 } from 'lucide-react';

export const LiveTVDirectory: React.FC = () => {
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const loadChannels = async () => {
      try {
        const res = await fetch('/api/livetv/channels');
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
    loadChannels();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-[#070b14] text-slate-200">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
            <Tv className="text-indigo-400" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Đài Truyền Hình</h1>
            <p className="text-slate-400 text-sm">Xem các kênh phát sóng liên tục</p>
          </div>
        </div>

        {channels.length === 0 ? (
          <div className="text-center py-20 bg-white/5 rounded-2xl border border-white/10">
            <MonitorPlay size={48} className="mx-auto text-slate-600 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Chưa có kênh nào</h3>
            <p className="text-slate-400">Vui lòng quay lại sau.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {channels.map((channel) => (
              <div
                key={channel.id}
                onClick={() => navigate(`/tv/${channel.slug}`)}
                className="group cursor-pointer bg-white/5 rounded-2xl border border-white/10 overflow-hidden hover:bg-white/10 hover:border-indigo-500/30 transition-all"
              >
                <div className="aspect-video bg-black relative flex items-center justify-center">
                  {channel.logo ? (
                    <img src={channel.logo} alt={channel.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                  ) : (
                    <Tv size={48} className="text-slate-700" />
                  )}
                  <div className="absolute top-3 right-3 px-2 py-1 bg-red-500 text-white text-xs font-bold rounded flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    TRỰC TIẾP
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-lg text-white mb-1">{channel.name}</h3>
                  <p className="text-sm text-slate-400 line-clamp-2">{channel.description || 'Kênh phát sóng tự động'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
