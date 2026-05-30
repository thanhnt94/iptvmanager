import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tv, ListVideo, Loader2, ArrowLeft, Play, Pause, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react';
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
  
  // Player State
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const videoEngineRef = useRef<VideoEngineRef>(null);
  const ytPlayerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const hasSeekedRef = useRef(false);
  const ytContainerId = `yt-player-${slug}`;

  const loadCurrentProgram = async () => {
    try {
      const res = await fetch(`/api/livetv/channels/${slug}/current`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
        
        // Schedule next load based on remaining time of current program
        if (timerRef.current) window.clearTimeout(timerRef.current);
        
        if (result.program) {
          const remaining = result.program.duration_seconds - result.seek_time;
          let timeoutTime = remaining * 1000 + 500; // 500ms buffer
          
          // If the next program is scheduled to start BEFORE the current program naturally ends
          if (result.upcoming && result.upcoming.length > 0 && result.upcoming[0].start_time) {
            const timeStr = result.upcoming[0].start_time.endsWith('Z') ? result.upcoming[0].start_time : result.upcoming[0].start_time + 'Z';
            const nextStartMs = new Date(timeStr).getTime();
            const timeToNext = nextStartMs - new Date().getTime();
            if (timeToNext > 0 && timeToNext < timeoutTime) {
              timeoutTime = timeToNext + 1000; // 1s buffer after start
            }
          }

          if (timeoutTime > 0) {
            timerRef.current = window.setTimeout(() => {
              loadCurrentProgram();
            }, Math.min(timeoutTime, 15000)); // Cập nhật tối đa mỗi 15s để bắt sự kiện thay đổi lịch
          }
        } else if (result.upcoming && result.upcoming.length > 0) {
          const nextProg = result.upcoming[0];
          if (nextProg.start_time) {
            const timeStr = nextProg.start_time.endsWith('Z') ? nextProg.start_time : nextProg.start_time + 'Z';
            const startTimeMs = new Date(timeStr).getTime();
            const diff = startTimeMs - new Date().getTime();
            if (diff > 0) {
              timerRef.current = window.setTimeout(() => {
                loadCurrentProgram();
              }, Math.min(diff + 1000, 15000)); // 1s buffer, max 15s poll
            } else {
              timerRef.current = window.setTimeout(() => loadCurrentProgram(), 5000);
            }
          } else {
            timerRef.current = window.setTimeout(() => loadCurrentProgram(), 10000);
          }
        } else {
          // No program and no upcoming. Check back periodically.
          timerRef.current = window.setTimeout(() => loadCurrentProgram(), 30000);
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

  // YouTube API Initialization
  useEffect(() => {
    if (!data || !data.program) return;
    const src = resolveSource(data.program.video_url);
    if (src.provider !== 'youtube' || !src.url) return;

    const initYoutubePlayer = () => {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.loadVideoById(src.url, data.seek_time || 0);
          ytPlayerRef.current.playVideo();
          return;
        } catch (e) { console.error(e); }
      }

      const setupPlayer = () => {
        ytPlayerRef.current = new (window as any).YT.Player(ytContainerId, {
          height: '100%',
          width: '100%',
          videoId: src.url,
          playerVars: {
            start: Math.floor(data.seek_time || 0),
            autoplay: 1,
            mute: 1,
            controls: 0,
            rel: 0,
            showinfo: 0,
            disablekb: 1,
            modestbranding: 1
          },
          events: {
            onStateChange: (event: any) => {
              if (event.data === 1) setIsPlaying(true);
              else if (event.data === 2) setIsPlaying(false);
            }
          }
        });
      };

      if ((window as any).YT?.Player) {
        setupPlayer();
      } else {
        (window as any).onYouTubeIframeAPIReady = setupPlayer;
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      }
    };

    initYoutubePlayer();
  }, [data?.program?.video_url, slug]);

  useEffect(() => {
    hasSeekedRef.current = false;
  }, [data?.program?.id]);

  const handleTogglePlay = () => {
    const next = !isPlaying;
    setIsPlaying(next);
    const src = resolveSource(data?.program?.video_url);

    if (src.provider === 'video' && videoEngineRef.current) {
      if (next) videoEngineRef.current.play();
      else videoEngineRef.current.pause();
    } else if (src.provider === 'youtube' && ytPlayerRef.current) {
      if (next) ytPlayerRef.current.playVideo();
      else ytPlayerRef.current.pauseVideo();
    }
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      playerContainerRef.current?.requestFullscreen().catch(console.error);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.error);
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

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

        <div ref={playerContainerRef} className="flex-1 relative w-full h-full flex items-center justify-center bg-black group/player">
          {src ? (
            <div className="w-full h-full relative">
              {src.provider === 'youtube' ? (
                <div className="w-full h-full">
                  <div id={ytContainerId} className="w-full h-full pointer-events-none" />
                </div>
              ) : (
                <VideoEngine
                  ref={videoEngineRef}
                  url={src.url}
                  format={src.format}
                  type="live"
                  controls={false}
                  autoPlay={true}
                  muted={isMuted}
                  volume={volume}
                  onPlayStateChange={setIsPlaying}
                  onPlaying={() => {
                    if (data.seek_time > 0 && !currentProg.is_live_stream && !hasSeekedRef.current) {
                      if (videoEngineRef.current) {
                        videoEngineRef.current.setCurrentTime(data.seek_time);
                        hasSeekedRef.current = true;
                      }
                    }
                  }}
                />
              )}
              {/* Overlay to block user clicks from pausing the video (true TV feel) */}
              <div className="absolute inset-0 z-[12]" />

              {/* Custom Controls */}
              <div className="absolute bottom-0 left-0 right-0 z-[20] bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover/player:opacity-100 transition-opacity duration-300 pt-16 pb-4 px-4 md:px-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleTogglePlay}
                      className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-indigo-600 text-white transition-all"
                    >
                      {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const next = !isMuted;
                          setIsMuted(next);
                          if (src.provider === 'youtube' && ytPlayerRef.current) {
                            next ? ytPlayerRef.current.mute() : ytPlayerRef.current.unMute();
                          }
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white transition-all"
                      >
                        {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={volume}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setVolume(v);
                          setIsMuted(v === 0);
                          if (src.provider === 'youtube' && ytPlayerRef.current) {
                            ytPlayerRef.current.setVolume(v * 100);
                            if (v > 0) ytPlayerRef.current.unMute();
                          }
                        }}
                        className="w-20 h-1 accent-indigo-500 cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleToggleFullscreen}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white transition-all"
                    >
                      {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                    </button>
                  </div>
                </div>
              </div>
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
              <h3 className="font-bold text-white text-lg leading-snug">{currentProg.title}</h3>
              <div className="text-xs text-indigo-200 mt-2 flex items-center gap-2 flex-wrap">
                <span>Thời lượng: {Math.round(currentProg.duration_seconds / 60)} phút</span>
                {data.channel_type === 'schedule' && currentProg.start_time && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-indigo-400"></span>
                    <span className="font-bold">
                      Bắt đầu: {new Date(currentProg.start_time.endsWith('Z') ? currentProg.start_time : currentProg.start_time + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {upcoming.map((prog: any, idx: number) => (
            <div key={idx} className="bg-white/5 border border-white/5 rounded-xl p-3">
              <div className="flex items-center gap-2 text-slate-500 text-xs font-bold mb-1">
                TIẾP THEO
              </div>
              <h3 className="font-bold text-slate-300 line-clamp-2">{prog.title}</h3>
              <div className="text-xs text-slate-500 mt-2 flex items-center gap-2 flex-wrap">
                <span>Thời lượng: {Math.round(prog.duration_seconds / 60)} phút</span>
                {data.channel_type === 'schedule' && prog.start_time && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                    <span className="text-indigo-400 font-bold">
                      Bắt đầu: {new Date(prog.start_time.endsWith('Z') ? prog.start_time : prog.start_time + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </>
                )}
              </div>
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
