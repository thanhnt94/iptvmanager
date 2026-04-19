import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';

interface VideoStats {
  fps: number;
  audio: string;
  resolution: string;
}

interface VideoEngineProps {
  url: string | null;
  format?: string | null;
  type?: 'live' | 'vod';
  onPlaying?: () => void;
  onWaiting?: () => void;
  onError?: (error: string) => void;
  onTimeUpdate?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  onPlayStateChange?: (playing: boolean) => void;
  onStatsUpdate?: (stats: VideoStats) => void;
  muted?: boolean;
  volume?: number;
}

export interface VideoEngineRef {
  play: () => void;
  pause: () => void;
  isPlaying: () => boolean;
  setCurrentTime: (time: number) => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
}

export const VideoEngine = forwardRef<VideoEngineRef, VideoEngineProps>(({
  url,
  format,
  type = 'live',
  onPlaying,
  onWaiting,
  onError,
  onTimeUpdate,
  onDurationChange,
  onPlayStateChange,
  onStatsUpdate,
  muted = false,
  volume = 1
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<mpegts.Player | null>(null);
  const statsInterval = useRef<any>(null);
  const lastFrameCount = useRef<number>(0);
  const lastTime = useRef<number>(0);
  const stableFps = useRef<number>(0);
  const stableCount = useRef<number>(0);

  const cleanup = () => {
    if (statsInterval.current) clearInterval(statsInterval.current);
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (mpegtsRef.current) {
      mpegtsRef.current.unload();
      mpegtsRef.current.detachMediaElement();
      mpegtsRef.current.destroy();
      mpegtsRef.current = null;
    }
  };

  const startStatsMonitoring = () => {
     if (statsInterval.current) clearInterval(statsInterval.current);
     lastFrameCount.current = 0;
     lastTime.current = performance.now();
     stableFps.current = 0;
     stableCount.current = 0;

     statsInterval.current = setInterval(() => {
        if (!videoRef.current || videoRef.current.paused) return;
        
        const video = videoRef.current;
        const now = performance.now();
        const elapsed = (now - lastTime.current) / 1000;
        
        // Real-time calculation
        let currentFps = 0;
        if ('getVideoPlaybackQuality' in video) {
           const quality = (video as any).getVideoPlaybackQuality();
           const frames = quality.totalVideoFrames;
           currentFps = (frames - lastFrameCount.current) / elapsed;
           lastFrameCount.current = frames;
        }
        lastTime.current = now;

        // "Snapshot" Logic: Lock FPS after 5 stable readings (> 10fps)
        if (stableCount.current < 5 && currentFps > 10) {
           stableFps.current = Math.round(currentFps * 10) / 10;
           stableCount.current += 1;
        }

        // Auto-detect Audio Codec
        let audioInfo = 'AAC 2.0';
        if (hlsRef.current) {
           const level = hlsRef.current.levels[hlsRef.current.currentLevel];
           if (level?.audioCodec) audioInfo = level.audioCodec.split('.')[0].toUpperCase();
        } else if (mpegtsRef.current) {
           audioInfo = 'MPEG-TS';
        }

        onStatsUpdate?.({
           fps: stableFps.current || Math.round(currentFps * 10) / 10,
           audio: audioInfo,
           resolution: `${video.videoWidth}X${video.videoHeight}`
        });
     }, 2000);
  };

  useImperativeHandle(ref, () => ({
    videoElement: videoRef.current,
    play: () => videoRef.current?.play(),
    pause: () => videoRef.current?.pause(),
    isPlaying: () => !videoRef.current?.paused,
    setCurrentTime: (t: number) => { if (videoRef.current) videoRef.current.currentTime = t; },
    setMuted: (m: boolean) => { if (videoRef.current) videoRef.current.muted = m; },
    setVolume: (v: number) => { if (videoRef.current) videoRef.current.volume = v; }
  }));

  useEffect(() => {
    if (videoRef.current) {
       videoRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (!url || !videoRef.current) return;
    const video = videoRef.current;
    cleanup();
    startStatsMonitoring();

    const lowUrl = url.toLowerCase();
    const isM3U8 = lowUrl.includes('.m3u8') || lowUrl.includes('proxy_hls_manifest') || format === 'hls';
    const isTS = lowUrl.includes('.ts') || lowUrl.includes('type=ts') || lowUrl.includes('proxy_stream') || lowUrl.includes('forced=ts') || format === 'ts';

    if (isM3U8) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 60
        });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                onError?.(`HLS Network Error: ${data.details}`);
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                onError?.("HLS Media Recovery...");
                break;
              default:
                cleanup();
                onError?.(`HLS Fatal: ${data.details}`);
                break;
            }
          }
        });
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.play().catch(() => {});
      }
    } else if (isTS) {
      if (mpegts.getFeatureList().mseLivePlayback) {
        const player = mpegts.createPlayer({
          type: 'mpegts',
          isLive: type === 'live',
          url: url
        }, {
            enableWorker: true,
            enableStashBuffer: false,
            stashInitialSize: 128
        });
        player.attachMediaElement(video);
        player.load();
        player.play();
        mpegtsRef.current = player;
      }
    } else {
      video.src = url;
      video.play().catch(() => {});
    }

    return cleanup;
  }, [url, format, type]);

  return (
    <video
      ref={videoRef}
      className="w-full h-full object-contain bg-black"
      onPlaying={() => { onPlaying?.(); onPlayStateChange?.(true); }}
      onPause={() => onPlayStateChange?.(false)}
      onWaiting={onWaiting}
      onTimeUpdate={() => onTimeUpdate?.(videoRef.current?.currentTime || 0)}
      onLoadedMetadata={() => onDurationChange?.(videoRef.current?.duration || 0)}
      onError={() => onError?.("Media Stream Error: Check your gateway or source connection.")}
      muted={muted}
      playsInline
    />
  );
});
