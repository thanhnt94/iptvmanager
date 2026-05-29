import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Users,
  Send,
  Settings,
  Share2,
  Crown,
  Home,
  Loader2,
  Check,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Maximize,
  Minimize,
  Tv,
  Link2,
  Radio,
  SkipForward,
  MonitorPlay,
  WifiOff
} from 'lucide-react';
import { VideoEngine } from '../components/player/VideoEngine';
import type { VideoEngineRef } from '../components/player/VideoEngine';

/* ═══════════════════════ Types ═══════════════════════ */

interface RoomDetail {
  id: string;
  name: string;
  host_id: number;
  host_username: string;
  current_video_id: string | null;
  is_playing: boolean;
  current_time: number;
  allow_guest_control: boolean;
  is_public: boolean;
  is_host: boolean;
  has_password: boolean;
}

interface ChatMessage {
  id: number;
  username: string;
  message: string;
  video_id: string | null;
  timestamp: number | null;
  reactions: string;
  created_at: string | null;
}

interface IPTVChannel {
  id: number;
  name: string;
  play_url: string;
  play_links?: {
    original: string;
    smart: string;
    ts: string;
    hls: string;
  };
  logo_url?: string;
  status?: string;
}

interface VideoSource {
  url: string | null;
  format: string;
  provider: 'video' | 'youtube';
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

/* ═══════════════════════ Helpers ═══════════════════════ */

function detectFormat(url: string | null): string {
  if (!url) return 'hls';
  const low = url.toLowerCase();
  if (low.includes('.m3u8') || low.includes('hls-manifest') || low.includes('proxy_hls_manifest')) return 'hls';
  if (low.includes('.ts') || low.includes('/play/') || low.includes('proxy_stream')) return 'ts';
  if (low.includes('.mp4')) return 'mp4';
  if (low.includes('.flv')) return 'flv';
  return 'hls';
}

function isYoutubeUrl(url: string): boolean {
  return (
    url.includes('youtube.com/watch') ||
    url.includes('youtube.com/embed') ||
    url.includes('youtube.com/shorts') ||
    url.includes('youtu.be/') ||
    url.includes('youtube.com/live/')
  );
}

function extractYoutubeId(rawUrl: string): string | null {
  try {
    if (rawUrl.includes('youtu.be/')) {
      return rawUrl.split('youtu.be/')[1].split(/[?&#]/)[0] || null;
    }
    if (rawUrl.includes('youtube.com/shorts/')) {
      return rawUrl.split('/shorts/')[1].split(/[?&#]/)[0] || null;
    }
    if (rawUrl.includes('youtube.com/live/')) {
      return rawUrl.split('/live/')[1].split(/[?&#]/)[0] || null;
    }
    if (rawUrl.includes('youtube.com/embed/')) {
      return rawUrl.split('/embed/')[1].split(/[?&#]/)[0] || null;
    }
    if (rawUrl.includes('v=')) {
      const urlParams = new URLSearchParams(new URL(rawUrl).search);
      return urlParams.get('v') || null;
    }
  } catch { /* fallback */ }
  // Bare 11-char video ID (e.g. "dQw4w9WgXcQ")
  if (/^[A-Za-z0-9_-]{11}$/.test(rawUrl)) return rawUrl;
  return null;
}

function resolveSource(rawUrl: string | null): VideoSource {
  if (!rawUrl) return { url: null, format: 'hls', provider: 'video' };

  if (isYoutubeUrl(rawUrl)) {
    const ytId = extractYoutubeId(rawUrl);
    if (ytId) return { url: ytId, format: 'youtube', provider: 'youtube' };
  }
  // Bare 11-char ID
  if (/^[A-Za-z0-9_-]{11}$/.test(rawUrl.trim())) {
    return { url: rawUrl.trim(), format: 'youtube', provider: 'youtube' };
  }

  return { url: rawUrl, format: detectFormat(rawUrl), provider: 'video' };
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* ═══════════════════════ Component ═══════════════════════ */

export const WatchRoom: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const pw = searchParams.get('pw') || '';
  const navigate = useNavigate();

  // Core Room State
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [userMe, setUserMe] = useState<{ id: number; username: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Real-time Chat and Presence
  const [socket, setSocket] = useState<Socket | null>(null);
  const [presence, setPresence] = useState({ total: 1, members: 0, guests: 1, host_online: true });
  const [chatList, setChatList] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');

  // Host Controls
  const [customUrl, setCustomUrl] = useState('');
  const [systemChannels, setSystemChannels] = useState<IPTVChannel[]>([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [roomSettings, setRoomSettings] = useState({ name: '', is_public: true, password: '', allow_guest_control: false });
  const [copied, setCopied] = useState(false);

  // Player State — single source of truth
  const [videoSource, setVideoSource] = useState<VideoSource>({ url: null, format: 'hls', provider: 'video' });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [showChat, setShowChat] = useState(true);

  // Refs
  const videoEngineRef = useRef<VideoEngineRef>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const ignoreNextEvent = useRef(false);
  const ytPlayerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<RoomDetail | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const isPlayingRef = useRef(false);
  const videoSourceRef = useRef<VideoSource>(videoSource);
  const pendingSeekTime = useRef<number | null>(null);
  const hasResumedRef = useRef(false);

  const ytContainerId = 'yt-player-element';

  // Keep refs in sync
  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { videoSourceRef.current = videoSource; }, [videoSource]);

  /* ── Socket Emit Helpers ── */

  const emitSyncState = useCallback((state: 'playing' | 'paused', time: number) => {
    const s = socketRef.current;
    const r = roomRef.current;
    if (!s || !r) return;
    s.emit('sync_state', {
      room_id: r.id,
      state,
      time,
      video_id: r.current_video_id,
      is_host: r.is_host
    });
  }, []);

  const emitSeek = useCallback((time: number) => {
    const s = socketRef.current;
    const r = roomRef.current;
    if (!s || !r) return;
    s.emit('host_seek', {
      room_id: r.id,
      time,
      is_host: r.is_host
    });
  }, []);

  /* ── Fetch Room Data ── */

  const fetchRoomData = async () => {
    try {
      const userRes = await fetch('/api/auth/me');
      if (userRes.ok) {
        const u = await userRes.json();
        setUserMe(u);
      }

      const res = await fetch(`/api/watchtogether/rooms/${id}?pw=${encodeURIComponent(pw)}`);
      if (!res.ok) {
        if (res.status === 403) throw new Error('Mật khẩu phòng không đúng hoặc thiếu mật khẩu.');
        throw new Error('Không thể tải phòng xem chung.');
      }
      const data = await res.json();
      setRoom(data);
      setRoomSettings({
        name: data.name,
        is_public: data.is_public,
        password: '',
        allow_guest_control: data.allow_guest_control
      });

      // Initialize video source atomically
      const src = resolveSource(data.current_video_id);
      setVideoSource(src);
      setIsPlaying(data.is_playing);
      setCurrentTime(data.current_time || 0);

      // Save pending seek time so the player resumes from last position
      if (data.current_time && data.current_time > 0 && src.url) {
        pendingSeekTime.current = data.current_time;
        hasResumedRef.current = false;
      }

      // Show the URL in the input
      if (data.current_video_id) {
        setCustomUrl(data.current_video_id);
      }

      // If Host, load system channels
      if (data.is_host) {
        fetch('/api/channels?per_page=200')
          .then(r => r.json())
          .then(channelsData => {
            const list = Array.isArray(channelsData) ? channelsData : (channelsData.channels || []);
            setSystemChannels(list);
          })
          .catch(e => console.error("Error loading channels list:", e));
      }

      setLoading(false);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  /* ── YouTube Player ── */

  const initYoutubePlayer = (videoId: string, startTime: number) => {
    if (ytPlayerRef.current) {
      try {
        ytPlayerRef.current.loadVideoById(videoId, startTime);
        if (roomRef.current?.is_playing) ytPlayerRef.current.playVideo();
        else ytPlayerRef.current.pauseVideo();
        return;
      } catch (e) { console.error(e); }
    }

    const setupPlayer = () => {
      const r = roomRef.current;
      ytPlayerRef.current = new window.YT.Player(ytContainerId, {
        height: '100%',
        width: '100%',
        videoId,
        playerVars: {
          start: startTime,
          autoplay: r?.is_playing ? 1 : 0,
          controls: (r?.is_host || r?.allow_guest_control) ? 1 : 0,
          rel: 0,
          showinfo: 0
        },
        events: {
          onStateChange: (event: any) => {
            const r2 = roomRef.current;
            const isCtrl = r2?.is_host || r2?.allow_guest_control;
            if (!isCtrl || ignoreNextEvent.current) {
              ignoreNextEvent.current = false;
              return;
            }
            if (event.data === 1) emitSyncState('playing', ytPlayerRef.current.getCurrentTime());
            else if (event.data === 2) emitSyncState('paused', ytPlayerRef.current.getCurrentTime());
          }
        }
      });
    };

    if (window.YT?.Player) {
      setupPlayer();
    } else {
      window.onYouTubeIframeAPIReady = setupPlayer;
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }
  };

  /* ── Player Actions ── */

  const handleTogglePlay = () => {
    const next = !isPlaying;
    setIsPlaying(next);

    let t = 0;
    if (videoSource.provider === 'video' && videoEngineRef.current) {
      if (next) videoEngineRef.current.play();
      else videoEngineRef.current.pause();
      t = videoEngineRef.current.videoElement?.currentTime || 0;
    } else if (videoSource.provider === 'youtube' && ytPlayerRef.current) {
      if (next) ytPlayerRef.current.playVideo();
      else ytPlayerRef.current.pauseVideo();
      t = ytPlayerRef.current.getCurrentTime?.() || 0;
    }

    emitSyncState(next ? 'playing' : 'paused', t);
  };

  const handleSeek = (newTime: number) => {
    setCurrentTime(newTime);

    if (videoSource.provider === 'video' && videoEngineRef.current) {
      videoEngineRef.current.setCurrentTime(newTime);
    } else if (videoSource.provider === 'youtube' && ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(newTime, true);
    }

    emitSeek(newTime);
  };

  const handleSeekEnd = () => {
    setIsSeeking(false);
    emitSyncState(isPlaying ? 'playing' : 'paused', currentTime);
  };

  const handleChangeVideo = (url: string) => {
    if (!socket || !room) return;
    socket.emit('change_video', {
      room_id: room.id,
      video_id: url,
      start_time: 0,
      is_host: room.is_host
    });
  };

  const handleToggleFullscreen = async () => {
    if (!playerContainerRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        await playerContainerRef.current.requestFullscreen();
        setIsFullscreen(true);
        if (window.screen?.orientation?.lock) {
          try { await (window.screen.orientation.lock as any)('landscape'); } catch { }
        }
      }
    } catch (err) { console.error('Fullscreen error:', err); }
  };

  /* ── Chat ── */

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket || !room) return;

    let t = 0;
    if (videoSource.provider === 'video' && videoEngineRef.current?.videoElement) {
      t = videoEngineRef.current.videoElement.currentTime;
    } else if (videoSource.provider === 'youtube' && ytPlayerRef.current?.getCurrentTime) {
      t = ytPlayerRef.current.getCurrentTime();
    }

    socket.emit('chat_message', {
      room_id: room.id,
      username: userMe?.username || 'Khách Vãng Lai',
      message: chatInput.trim(),
      video_id: room.current_video_id,
      timestamp: Math.floor(t)
    });
    setChatInput('');
  };

  const handleAddReaction = (messageId: number, emoji: string) => {
    if (!socket || !room) return;
    socket.emit('add_reaction', {
      room_id: room.id,
      message_id: messageId,
      emoji,
      username: userMe?.username || 'Khách Vãng Lai'
    });
  };

  const handleUpdateRoomSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room) return;
    try {
      const res = await fetch(`/api/watchtogether/rooms/${room.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roomSettings.name,
          is_public: roomSettings.is_public,
          password: roomSettings.password || undefined,
          allow_guest_control: roomSettings.allow_guest_control
        })
      });
      if (res.ok) {
        setShowSettingsModal(false);
        setRoom(prev => prev ? {
          ...prev,
          name: roomSettings.name,
          is_public: roomSettings.is_public,
          allow_guest_control: roomSettings.allow_guest_control
        } : null);
      }
    } catch (e) { console.error(e); }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /* ═══════════════════════ Effects ═══════════════════════ */

  // Pause if host goes offline
  useEffect(() => {
    if (!room) return;
    const isCtrl = room.is_host || room.allow_guest_control;
    if (!isCtrl && !presence.host_online) {
      setIsPlaying(false);
      if (videoEngineRef.current) {
        videoEngineRef.current.pause();
      } else if (ytPlayerRef.current?.pauseVideo) {
        ytPlayerRef.current.pauseVideo();
      }
    }
  }, [presence.host_online, room]);

  // Periodic host sync
  useEffect(() => {
    if (!room?.is_host) return;
    const interval = setInterval(() => {
      let t = 0;
      const src = videoSourceRef.current;
      if (src.provider === 'video' && videoEngineRef.current?.videoElement) {
        t = videoEngineRef.current.videoElement.currentTime;
      } else if (src.provider === 'youtube' && ytPlayerRef.current?.getCurrentTime) {
        t = ytPlayerRef.current.getCurrentTime();
      }
      emitSyncState(isPlayingRef.current ? 'playing' : 'paused', t);
    }, 15000);
    return () => clearInterval(interval);
  }, [room?.is_host, emitSyncState]);

  // Connect Socket.IO & fetch room
  useEffect(() => {
    fetchRoomData();

    const socketUrl = `${window.location.origin}/watchtogether`;
    const newSocket = io(socketUrl, {
      path: '/watchtogether/socket.io',
      transports: ['polling', 'websocket']
    });
    setSocket(newSocket);

    return () => { newSocket.close(); };
  }, [id]);

  // Handle Socket Events
  useEffect(() => {
    if (!socket || !room) return;

    const handleJoinEmit = () => {
      socket.emit('join', {
        room_id: room.id,
        username: userMe?.username || 'Khách Vãng Lai',
        user_id: userMe?.id || null
      });
    };

    socket.on('connect', handleJoinEmit);
    if (socket.connected) handleJoinEmit();

    socket.on('presence_update', (data) => setPresence(data));

    socket.on('system_message', (data) => {
      setChatList(prev => [...prev, {
        id: Math.random(),
        username: 'Hệ thống',
        message: data.msg,
        video_id: null,
        timestamp: null,
        reactions: '{}',
        created_at: new Date().toISOString()
      }]);
    });

    socket.on('chat_history', (history) => setChatList(history));
    socket.on('chat_message', (msg) => setChatList(prev => [...prev, msg]));

    socket.on('reaction_updated', (data) => {
      setChatList(prev => prev.map(m => m.id === data.message_id ? { ...m, reactions: data.reactions } : m));
    });

    socket.on('video_changed', (data) => {
      // Atomically update video source — format + url at the same time
      const src = resolveSource(data.video_id);
      setVideoSource(src);
      setIsPlaying(true);
      setCurrentTime(data.start_time || 0);
      setDuration(0);

      // Show the playing URL in the input field for host
      setCustomUrl(data.video_id || '');

      setRoom(prev => prev ? { ...prev, current_video_id: data.video_id } : null);

      // Trigger play after state update
      setTimeout(() => {
        if (src.provider === 'video' && videoEngineRef.current) {
          videoEngineRef.current.setCurrentTime(data.start_time || 0);
          videoEngineRef.current.play();
        } else if (src.provider === 'youtube' && src.url) {
          initYoutubePlayer(src.url, data.start_time || 0);
        }
      }, 300);
    });

    socket.on('receive_state', (data) => {
      const isCtrl = room.is_host || room.allow_guest_control;
      if (isCtrl) return; // Don't sync if I'm the controller

      ignoreNextEvent.current = true;
      setIsPlaying(data.state === 'playing');

      const src = videoSourceRef.current;
      if (src.provider === 'video' && videoEngineRef.current?.videoElement) {
        const diff = Math.abs(videoEngineRef.current.videoElement.currentTime - data.time);
        if (diff > 2.0) videoEngineRef.current.setCurrentTime(data.time);
        if (data.state === 'playing') videoEngineRef.current.play();
        else videoEngineRef.current.pause();
      } else if (src.provider === 'youtube' && ytPlayerRef.current?.getCurrentTime) {
        const diff = Math.abs(ytPlayerRef.current.getCurrentTime() - data.time);
        if (diff > 2.0) ytPlayerRef.current.seekTo(data.time, true);
        if (data.state === 'playing') ytPlayerRef.current.playVideo();
        else ytPlayerRef.current.pauseVideo();
      }
    });

    socket.on('receive_seek', (data) => {
      const isCtrl = room.is_host || room.allow_guest_control;
      if (isCtrl) return;

      const src = videoSourceRef.current;
      if (src.provider === 'video' && videoEngineRef.current) {
        videoEngineRef.current.setCurrentTime(data.time);
      } else if (src.provider === 'youtube' && ytPlayerRef.current) {
        ytPlayerRef.current.seekTo(data.time, true);
      }
      setCurrentTime(data.time);
    });

    socket.on('request_sync_from_host', () => {
      if (room.is_host) {
        let t = 0;
        const src = videoSourceRef.current;
        if (src.provider === 'video' && videoEngineRef.current?.videoElement) {
          t = videoEngineRef.current.videoElement.currentTime;
        } else if (src.provider === 'youtube' && ytPlayerRef.current?.getCurrentTime) {
          t = ytPlayerRef.current.getCurrentTime();
        }
        emitSyncState(isPlayingRef.current ? 'playing' : 'paused', t);
      }
    });

    socket.on('video_history', () => { /* received but not shown in current UI */ });

    return () => {
      socket.off('connect', handleJoinEmit);
      socket.off('presence_update');
      socket.off('system_message');
      socket.off('chat_history');
      socket.off('chat_message');
      socket.off('reaction_updated');
      socket.off('video_changed');
      socket.off('receive_state');
      socket.off('receive_seek');
      socket.off('request_sync_from_host');
      socket.off('video_history');
    };
  }, [socket, room]);

  // YouTube Player side effect
  useEffect(() => {
    if (videoSource.provider === 'youtube' && videoSource.url) {
      initYoutubePlayer(videoSource.url, currentTime);
    }
  }, [videoSource.provider, videoSource.url]);

  // Scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatList]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Send final sync before tab close (so DB has accurate time for resume)
  useEffect(() => {
    const handleBeforeUnload = () => {
      const r = roomRef.current;
      const s = socketRef.current;
      if (!r?.is_host || !s) return;

      let t = 0;
      const src = videoSourceRef.current;
      if (src.provider === 'video' && videoEngineRef.current?.videoElement) {
        t = videoEngineRef.current.videoElement.currentTime;
      } else if (src.provider === 'youtube' && ytPlayerRef.current?.getCurrentTime) {
        t = ytPlayerRef.current.getCurrentTime();
      }

      // Use sendBeacon-style emit (sync_state) before socket disconnects
      s.emit('sync_state', {
        room_id: r.id,
        state: isPlayingRef.current ? 'playing' : 'paused',
        time: t,
        video_id: r.current_video_id,
        is_host: true
      });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  /* ═══════════════════════ Render ═══════════════════════ */

  if (loading) {
    return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 z-[100] fixed inset-0">
        <Loader2 className="animate-spin text-indigo-500" size={48} />
        <span className="text-xs font-black uppercase tracking-[0.2em] text-white">Connecting watch room...</span>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center gap-6 z-[100] fixed inset-0 text-center px-6">
        <h2 className="text-3xl font-black text-rose-500 uppercase tracking-tighter">Connection Failed</h2>
        <p className="text-slate-400 max-w-md text-sm">{error || "Phòng xem không tồn tại hoặc lỗi xác thực."}</p>
        <button
          onClick={() => navigate('/watch')}
          className="px-6 py-3 rounded-xl bg-slate-800 text-white text-xs font-bold uppercase hover:bg-slate-700 transition-all"
        >
          Quay lại sảnh
        </button>
      </div>
    );
  }

  const isControlMaster = room.is_host || room.allow_guest_control;
  const hasVideo = !!videoSource.url;
  const isLive = hasVideo && videoSource.format === 'hls' && (duration === 0 || !isFinite(duration) || duration > 43200);
  const progress = duration > 0 && isFinite(duration) ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-[#070b14] flex flex-col overflow-hidden z-[100] animate-in fade-in duration-700 font-sans">
      {/* ═══════ Top Header ═══════ */}
      <header className="flex-none bg-[#0b0f19] border-b border-white/5 px-4 md:px-6 py-2.5 flex items-center justify-between z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/watch')}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 transition-all"
            title="Về sảnh phòng"
          >
            <Home size={16} />
          </button>
          <div>
            <h1 className="text-sm font-black text-white max-w-[200px] truncate tracking-tight">{room.name}</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Crown size={10} className="text-amber-400" />
              <span className="text-[10px] font-bold text-indigo-400">{room.host_username}</span>
              {room.is_host && (
                <span className="text-[8px] font-black uppercase tracking-widest text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full ml-1">Host</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Presence badge */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <Users size={12} className="text-slate-400" />
            <span className="text-[10px] font-black text-slate-400">{presence.total}</span>
          </div>

          {room.is_host && (
            <button
              onClick={() => setShowSettingsModal(true)}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 transition-all"
              title="Cài đặt phòng"
            >
              <Settings size={16} />
            </button>
          )}

          <button
            onClick={handleCopyLink}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
              copied ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
            }`}
          >
            {copied ? <Check size={12} /> : <Share2 size={12} />}
            <span className="text-[10px] font-black uppercase tracking-wider hidden sm:inline">{copied ? 'Copied' : 'Mời bạn'}</span>
          </button>

          <button
            onClick={() => setShowChat(!showChat)}
            className="lg:hidden w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 transition-all"
          >
            <Send size={14} />
          </button>
        </div>
      </header>

      {/* ═══════ Main Area ═══════ */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative bg-[#070b14] min-h-0">
        {/* ── Video Column ── */}
        <div className="flex-1 bg-black flex flex-col relative min-h-0 z-10">
          {/* Player Area */}
          <div ref={playerContainerRef} className="flex-1 relative w-full h-full flex items-center justify-center bg-black group/player">
            {hasVideo ? (
              <>
                {videoSource.provider === 'youtube' ? (
                  <div className="w-full h-full">
                    <div id={ytContainerId} className="w-full h-full" />
                  </div>
                ) : (
                  <VideoEngine
                    ref={videoEngineRef}
                    url={videoSource.url}
                    format={videoSource.format}
                    type="vod"
                    muted={isMuted}
                    volume={volume}
                    onMuteChange={setIsMuted}
                    onPlaying={() => {
                      setIsPlaying(true);
                      // Resume from saved position on first play
                      if (pendingSeekTime.current !== null && !hasResumedRef.current) {
                        const seekTo = pendingSeekTime.current;
                        pendingSeekTime.current = null;
                        hasResumedRef.current = true;
                        setTimeout(() => {
                          if (videoEngineRef.current) {
                            videoEngineRef.current.setCurrentTime(seekTo);
                            setCurrentTime(seekTo);
                          }
                        }, 200);
                      }
                    }}
                    onPlayStateChange={setIsPlaying}
                    onTimeUpdate={(t) => {
                      if (!isSeeking) setCurrentTime(t);
                    }}
                    onDurationChange={(d) => setDuration(d)}
                  />
                )}

                {/* Video Click-to-Play/Pause overlay for controllers */}
                {isControlMaster && videoSource.provider === 'video' && (
                  <div
                    className="absolute inset-0 z-[12] cursor-pointer"
                    onClick={handleTogglePlay}
                  />
                )}

                {/* Host Offline Overlay */}
                {!isControlMaster && !presence.host_online && (
                  <div className="absolute inset-0 z-[30] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm text-white">
                    <div className="w-16 h-16 rounded-full bg-slate-800/80 flex items-center justify-center mb-4 border border-white/10">
                      <WifiOff size={28} className="text-slate-400" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">Kênh Ngoại Tuyến</h3>
                    <p className="text-slate-400 text-sm max-w-xs text-center">
                      Chủ phòng đã rời đi. Kênh sẽ tự động phát tiếp ngay khi chủ phòng quay lại.
                    </p>
                  </div>
                )}

                {/* Player Controls Overlay — fades on idle */}
                {isControlMaster && (
                  <div className="absolute bottom-0 left-0 right-0 z-[20] bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover/player:opacity-100 transition-opacity duration-300 pt-16 pb-4 px-4 md:px-6">
                    {/* Seek Bar (hide for live) */}
                    {!isLive && (
                      <div className="mb-3 group/seek">
                        <input
                          type="range"
                          min={0}
                          max={duration || 100}
                          step={0.5}
                          value={currentTime}
                          onChange={(e) => {
                            const t = parseFloat(e.target.value);
                            setIsSeeking(true);
                            setCurrentTime(t);
                          }}
                          onMouseUp={() => {
                            handleSeek(currentTime);
                            handleSeekEnd();
                          }}
                          onTouchEnd={() => {
                            handleSeek(currentTime);
                            handleSeekEnd();
                          }}
                          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/20 accent-indigo-500 group-hover/seek:h-2.5 transition-all"
                          style={{
                            background: `linear-gradient(to right, #6366f1 ${progress}%, rgba(255,255,255,0.15) ${progress}%)`
                          }}
                        />
                        <div className="flex justify-between mt-1.5">
                          <span className="text-[10px] font-mono font-bold text-white/60">{formatTime(currentTime)}</span>
                          <span className="text-[10px] font-mono font-bold text-white/40">{formatTime(duration)}</span>
                        </div>
                      </div>
                    )}

                    {/* Control Buttons Row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Play/Pause */}
                        <button
                          onClick={handleTogglePlay}
                          className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-indigo-600 text-white transition-all"
                        >
                          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                        </button>

                        {/* Volume */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const next = !isMuted;
                              setIsMuted(next);
                              videoEngineRef.current?.setMuted(next);
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
                              videoEngineRef.current?.setVolume(v);
                            }}
                            className="w-20 h-1 accent-indigo-500 cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                          />
                        </div>

                        {/* Live indicator */}
                        {isLive && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/30">
                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                            <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest">Live</span>
                          </div>
                        )}

                        {/* Time display for VOD */}
                        {!isLive && duration > 0 && (
                          <span className="text-[10px] font-mono font-bold text-white/50 hidden md:inline">
                            {formatTime(currentTime)} / {formatTime(duration)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Fullscreen */}
                        <button
                          onClick={handleToggleFullscreen}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white transition-all"
                        >
                          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Non-controller: volume + fullscreen only */}
                {!isControlMaster && (
                  <>
                    <div className="absolute inset-0 bg-transparent z-[15] cursor-default" />
                    <div className="absolute bottom-0 left-0 right-0 z-[20] bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover/player:opacity-100 transition-opacity duration-300 pb-3 px-4">
                      <div className="flex items-center gap-2">
                        {/* Mute toggle */}
                        <button
                          onClick={() => {
                            const next = !isMuted;
                            setIsMuted(next);
                            videoEngineRef.current?.setMuted(next);
                          }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white transition-all"
                        >
                          {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                        </button>
                        {/* Volume slider */}
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={isMuted ? 0 : volume}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setVolume(v);
                            setIsMuted(v === 0);
                            videoEngineRef.current?.setVolume(v);
                          }}
                          className="w-24 h-1 accent-indigo-500 cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
                        />
                        {/* Fullscreen */}
                        <button
                          onClick={handleToggleFullscreen}
                          className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white transition-all"
                        >
                          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : (
              /* ═══════ No-Content Placeholder ═══════ */
              <div className="w-full h-full flex flex-col items-center justify-center gap-6 px-8 text-center">
                <div className="relative">
                  <div className="w-24 h-24 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                    <MonitorPlay size={40} className="text-indigo-500/60" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center animate-pulse">
                    <Radio size={14} className="text-amber-400" />
                  </div>
                </div>
                <div>
                  <h3 className="text-white font-black text-lg uppercase tracking-tight">
                    {isControlMaster ? 'Chọn nội dung phát sóng' : 'Đang chờ Host phát sóng'}
                  </h3>
                  <p className="text-slate-500 text-xs mt-2 max-w-sm">
                    {isControlMaster
                      ? 'Dán link m3u8, chọn kênh IPTV từ danh sách bên dưới hoặc dán link YouTube để bắt đầu.'
                      : 'Host sẽ chọn nội dung và phát sóng. Bạn có thể trò chuyện trong khi chờ đợi!'}
                  </p>
                </div>
                {isControlMaster && (
                  <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-indigo-400/60">
                    <SkipForward size={12} /> <span>Sử dụng thanh điều khiển bên dưới</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ═══════ Host Control Bar ═══════ */}
          {isControlMaster && (
            <div className="bg-[#0b0f19] px-4 md:px-6 py-3 flex flex-col gap-3 border-t border-white/5 flex-none">
              {/* Source Input Row */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* IPTV Channel Selector */}
                {room.is_host && systemChannels.length > 0 && (
                  <div className="relative flex-shrink-0">
                    <select
                      onChange={(e) => {
                        const url = e.target.value;
                        if (url) {
                          setCustomUrl(url);
                          handleChangeVideo(url);
                          // Reset select to placeholder after picking
                          e.target.value = '';
                        }
                      }}
                      className="appearance-none bg-slate-950 border border-white/10 text-white text-xs pl-8 pr-6 py-2.5 rounded-xl outline-none cursor-pointer hover:border-indigo-500/50 transition-colors min-w-[160px]"
                      value=""
                    >
                      <option value="" disabled>📺 Chọn kênh IPTV</option>
                      {systemChannels.map(ch => (
                        <option key={ch.id} value={ch.play_links?.original || ch.play_url}>{ch.name}</option>
                      ))}
                    </select>
                    <Tv size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                  </div>
                )}

                {/* Custom URL input */}
                <div className="flex items-center bg-slate-950 border border-white/10 rounded-xl overflow-hidden flex-1 min-w-[200px] focus-within:border-indigo-500/50 transition-colors">
                  <Link2 size={14} className="text-slate-500 ml-3 shrink-0" />
                  <input
                    type="text"
                    placeholder="Dán link m3u8 / mp4 / YouTube..."
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customUrl.trim()) {
                        handleChangeVideo(customUrl.trim());
                        setCustomUrl('');
                      }
                    }}
                    className="bg-transparent text-white text-xs px-3 py-2.5 outline-none w-full placeholder:text-slate-600"
                  />
                  <button
                    onClick={() => {
                      if (customUrl.trim()) {
                        handleChangeVideo(customUrl.trim());
                        setCustomUrl('');
                      }
                    }}
                    disabled={!customUrl.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:text-white/30 text-white text-[10px] uppercase font-black tracking-wider px-5 py-2.5 transition-colors shrink-0"
                  >
                    Phát
                  </button>
                </div>
              </div>

              {/* Now Playing indicator */}
              {hasVideo && (
                <div className="flex items-center gap-2 text-[10px] min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="text-slate-500 font-bold shrink-0">Đang phát:</span>
                  {videoSource.provider === 'youtube' ? (
                    <span className="text-rose-400 font-bold shrink-0">▶ YouTube ({videoSource.url})</span>
                  ) : (
                    <span className="text-slate-400 truncate font-mono" title={videoSource.url || ''}>
                      {videoSource.url && videoSource.url.length > 80
                        ? videoSource.url.substring(0, 80) + '...'
                        : videoSource.url}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Chat Sidebar ── */}
        <aside className={`${showChat ? 'flex' : 'hidden lg:flex'} w-full lg:w-96 bg-[#0b0f19] border-t lg:border-t-0 lg:border-l border-white/5 flex-col z-20 flex-1 lg:flex-none min-h-0 relative`}>
          {/* Presence Header */}
          <div className="px-4 py-3 border-b border-white/5 bg-[#090d14] flex items-center justify-between flex-none">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Đã kết nối</span>
            </div>
            <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
              <Users size={12} />
              <span>{presence.total} online ({presence.members} thành viên)</span>
            </div>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
            {chatList.map((chat) => {
              const isSystem = chat.username === 'Hệ thống';
              const isMe = chat.username === (userMe?.username || 'Khách Vãng Lai');

              if (isSystem) {
                return (
                  <div key={chat.id} className="flex justify-center italic text-[10px] text-indigo-300/60 font-semibold">
                    <span className="bg-indigo-500/5 border border-indigo-500/10 px-3 py-1 rounded-full">{chat.message}</span>
                  </div>
                );
              }

              let parsedReactions: Record<string, string[]> = {};
              try { parsedReactions = JSON.parse(chat.reactions); } catch { }

              return (
                <div key={chat.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group relative`}>
                  <span className="text-[10px] text-slate-500 font-black mb-1 px-1">{chat.username}</span>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 border text-xs leading-relaxed relative ${
                    isMe ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900 text-slate-200 border-white/5'
                  }`}>
                    {chat.message}

                    {Object.keys(parsedReactions).length > 0 && (
                      <div className={`absolute -bottom-3 ${isMe ? 'right-2' : 'left-2'} flex gap-1 z-10`}>
                        {Object.entries(parsedReactions).map(([emoji, users]) => (
                          <span
                            key={emoji}
                            onClick={() => handleAddReaction(chat.id, emoji)}
                            className="bg-slate-800 border border-white/10 px-1.5 py-0.5 rounded-full text-[9px] font-black cursor-pointer hover:scale-110 transition-transform"
                          >
                            {emoji} {users.length}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={`absolute top-1/2 -translate-y-1/2 ${isMe ? '-left-16' : '-right-16'} opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 z-20 bg-slate-900 border border-white/10 rounded-full px-2 py-1 shadow-2xl`}>
                    {['👍', '❤️', '😂', '🔥'].map(emoji => (
                      <span
                        key={emoji}
                        onClick={() => handleAddReaction(chat.id, emoji)}
                        className="cursor-pointer hover:scale-125 transition-transform text-sm"
                      >
                        {emoji}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Form */}
          <div className="p-4 border-t border-white/5 bg-[#090d14] flex-none z-10 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <form onSubmit={handleSendChat} className="flex gap-2 relative">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Nhập tin nhắn để thảo luận..."
                className="w-full bg-slate-950 border border-white/10 rounded-xl pl-4 pr-10 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors outline-none font-medium"
              />
              <button
                type="submit"
                className="w-12 h-11 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center justify-center shadow-lg transition-colors shrink-0"
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        </aside>
      </div>

      {/* ═══════ Settings Modal (Host Only) ═══════ */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowSettingsModal(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl relative z-10 space-y-6"
            >
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-tight">Cài đặt phòng</h3>
                <p className="text-slate-400 text-xs mt-1">Thay đổi quyền hạn và trạng thái của phòng.</p>
              </div>

              <form onSubmit={handleUpdateRoomSettings} className="space-y-4 text-xs font-semibold">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Tên phòng</label>
                  <input
                    type="text"
                    required
                    value={roomSettings.name}
                    onChange={(e) => setRoomSettings({ ...roomSettings, name: e.target.value })}
                    className="w-full bg-slate-950 border border-white/5 focus:border-indigo-500 rounded-xl px-4 py-3 text-white outline-none transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 bg-slate-950/50 p-4 rounded-xl border border-white/5">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={roomSettings.is_public}
                      onChange={(e) => setRoomSettings({ ...roomSettings, is_public: e.target.checked })}
                      className="rounded accent-indigo-600 w-4 h-4"
                    />
                    <span>Công khai sảnh</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={roomSettings.allow_guest_control}
                      onChange={(e) => setRoomSettings({ ...roomSettings, allow_guest_control: e.target.checked })}
                      className="rounded accent-indigo-600 w-4 h-4"
                    />
                    <span>Khách được tua</span>
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Thay đổi Mật khẩu</label>
                  <input
                    type="text"
                    value={roomSettings.password}
                    onChange={(e) => setRoomSettings({ ...roomSettings, password: e.target.value })}
                    placeholder="Không nhập để mở công khai"
                    className="w-full bg-slate-950 border border-white/5 focus:border-indigo-500 rounded-xl px-4 py-3 text-white outline-none transition-colors"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(false)}
                    className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold uppercase tracking-wider transition-colors text-center border border-white/5"
                  >
                    Huỷ
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold uppercase tracking-wider transition-all shadow-lg"
                  >
                    Lưu
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
