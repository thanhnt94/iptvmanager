import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tv, ListVideo, Loader2, ArrowLeft } from 'lucide-react';
import { VideoEngine } from '../../components/player/VideoEngine';
import type { VideoEngineRef } from '../../components/player/VideoEngine';

export interface VideoSource {
  url: string | null;
  format: 'hls' | 'dash' | 'youtube' | 'mp4' | 'unknown';
  provider: 'video' | 'youtube';
}

function detectFormat(url: string | null): 'hls' | 'dash' | 'mp4' | 'unknown' {
  if (!url) return 'unknown';
  if (url.includes('.m3u8')) return 'hls';
  if (url.includes('.mpd')) return 'dash';
  if (url.includes('.mp4')) return 'mp4';
  return 'unknown';
}

function isYoutubeUrl(url: string | null): boolean {
  if (!url) return false;
  return (
    url.includes('youtube.com/watch') ||
    url.includes('youtu.be/') ||
    url.includes('youtube.com/live/')
  );
}

function extractYoutubeId(rawUrl: string): string | null {
  try {
    if (rawUrl.includes('youtu.be/')) return rawUrl.split('youtu.be/')[1].split(/[?&#]/)[0] || null;
    if (rawUrl.includes('youtube.com/live/')) return rawUrl.split('/live/')[1].split(/[?&#]/)[0] || null;
    if (rawUrl.includes('v=')) {
      const urlParams = new URLSearchParams(new URL(rawUrl).search);
      return urlParams.get('v') || null;
    }
  } catch { /* fallback */ }
  if (/^[A-Za-z0-9_-]{11}$/.test(rawUrl)) return rawUrl;
  return null;
}

function resolveSource(rawUrl: string | null): VideoSource {
  if (!rawUrl) return { url: null, format: 'hls', provider: 'video' };
  if (isYoutubeUrl(rawUrl)) {
    const ytId = extractYoutubeId(rawUrl);
    if (ytId) return { url: ytId, format: 'youtube', provider: 'youtube' };
  }
  if (/^[A-Za-z0-9_-]{11}$/.test(rawUrl.trim())) {
    return { url: rawUrl.trim(), format: 'youtube', provider: 'youtube' };
  }
  return { url: rawUrl, format: detectFormat(rawUrl), provider: 'video' };
}

export const LiveViewer: React.FC = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const videoEngineRef = useRef<VideoEngineRef>(null);
  const timerRef = useRef<number | null>(null);

  const loadCurrentProgram = async () => {
    try {
      const res = await fetch(`/api/livetv/channels/${slug}/current`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
        
        // Schedule next load based on remaining time of current program
        if (result.program) {
          const remaining = result.program.duration_seconds - result.seek_time;
          if (timerRef.current) window.clearTimeout(timerRef.current);
          if (remaining > 0) {
            timerRef.current = window.setTimeout(() => {
              loadCurrentProgram();
            }, remaining * 1000);
          }
        }
      } else {
        navigate('/tv');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCurrentProgram();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-black">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    );
  }

  if (!data) return null;

  const currentProg = data.program;
  const upcoming = data.upcoming || [];
  const src = currentProg ? resolveSource(currentProg.video_url) : null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col lg:flex-row overflow-hidden bg-[#070b14] animate-in fade-in duration-500 font-sans">
      
      {/* ── Left Column: Video Player ── */}
      <div className="flex-1 flex flex-col relative min-h-0 z-10 bg-black">
        <div className="absolute top-4 left-4 z-50">
          <button 
            onClick={() => navigate('/tv')}
            className="flex items-center gap-2 px-3 py-1.5 bg-black/50 hover:bg-black/80 backdrop-blur rounded-lg text-white transition-all border border-white/10"
          >
            <ArrowLeft size={16} />
            <span className="text-sm font-medium">Kênh khác</span>
          </button>
        </div>

        <div className="flex-1 relative w-full h-full flex items-center justify-center bg-black pointer-events-auto">
          {src ? (
            <div className="w-full h-full relative group">
              {src.provider === 'youtube' ? (
                <iframe
                  src={`https://www.youtube.com/embed/${src.url}?autoplay=1&controls=1&start=${Math.floor(data.seek_time)}&rel=0&showinfo=0&modestbranding=1&mute=0`}
                  allow="autoplay; encrypted-media; fullscreen"
                  allowFullScreen
                  className="w-full h-full border-none"
                />
              ) : (
                <VideoEngine
                  ref={videoEngineRef}
                  url={src.url}
                  format={src.format}
                  type="live" // Always treat as live to hide seek controls in CSS if needed
                  controls={true}
                  onPlaying={() => {
                    if (data.seek_time > 0 && !currentProg.is_live_stream) {
                      if (videoEngineRef.current) {
                        videoEngineRef.current.setCurrentTime(data.seek_time);
                      }
                    }
                  }}
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-500">
              <Tv size={64} className="mb-4 opacity-50" />
              <h2 className="text-2xl font-bold text-white mb-2">Đang chờ phát sóng</h2>
              <p>Chương trình tiếp theo sẽ sớm bắt đầu.</p>
            </div>
          )}
          
          <div className="absolute top-4 right-4 z-20 px-3 py-1 bg-red-600/90 backdrop-blur rounded text-white text-sm font-bold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            TRỰC TIẾP
          </div>
        </div>
      </div>

      {/* ── Right Column: EPG Schedule ── */}
      <div className="w-full lg:w-[350px] xl:w-[400px] flex flex-col bg-[#0b101e] border-l border-white/5 z-20 shrink-0 h-64 lg:h-auto">
        <div className="p-4 border-b border-white/5 bg-[#0f172a]">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ListVideo size={20} className="text-indigo-400" />
            Lịch Phát Sóng
          </h2>
          <p className="text-sm text-slate-400 mt-1">{data.channel_name}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {currentProg && (
            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-3 relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold mb-1">
                ĐANG PHÁT
              </div>
              <h3 className="font-bold text-white line-clamp-2">{currentProg.title}</h3>
              <p className="text-xs text-slate-400 mt-2">
                Thời lượng: {Math.round(currentProg.duration_seconds / 60)} phút
              </p>
            </div>
          )}

          {upcoming.map((prog: any, idx: number) => (
            <div key={idx} className="bg-white/5 border border-white/5 rounded-xl p-3">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-bold mb-1">
                TIẾP THEO
              </div>
              <h3 className="font-bold text-slate-300 line-clamp-2">{prog.title}</h3>
              <p className="text-xs text-slate-500 mt-2">
                Thời lượng: {Math.round(prog.duration_seconds / 60)} phút
              </p>
            </div>
          ))}

          {!currentProg && upcoming.length === 0 && (
            <div className="text-center py-10 text-slate-500">
              Chưa có lịch phát sóng nào.
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
