/**
 * IPTV Manager - Shared Player Engine (v1.0)
 * Handles HLS, MPEG-TS, Native VOD, and Heartbeat reporting.
 */

window.IPTVPlayer = {
    hls: null,
    mpegtsPlayer: null,
    heartbeatInterval: null,
    heartbeatTimeout: null,
    retryCount: 0,
    lastPlayTime: 0,
    currentUrl: null,
    currentId: null,
    
    /**
     * @param {HTMLVideoElement} videoElement The <video> tag
     * @param {Object} config { id, url, name, stream_type, forcedType, token, overlayElement, statusElement }
     */
    play: function(videoElement, config, isRetry = false) {
        const now = Date.now();
        const { id, url, name, stream_type, stream_format, forcedType, token, overlay, statusLabel, onError, onStall } = config;
        
        if (!isRetry) {
            this.retryCount = 0;
            this.lastPlayTime = 0;
            console.log(`[IPTVPlayer] Starting playback for: ${name} (ID: ${id})`);
        } else {
            console.log(`[IPTVPlayer] Retrying (${this.retryCount}) for: ${name}`);
            // Safety: Don't retry too fast
            if (now - this.lastPlayTime < 1500) {
                console.warn("[IPTVPlayer] Throttling rapid retry");
                return;
            }
        }
        this.lastPlayTime = now;
        
        // 1. Logic Cleanup
        if (!isRetry) {
            this.stop(videoElement);
            this.currentId = id;
        } else {
            // Minimal cleanup for retry
            if (this.hls) { this.hls.destroy(); this.hls = null; }
            if (this.mpegtsPlayer) { this.mpegtsPlayer.destroy(); this.mpegtsPlayer = null; }
        }
        
        // 2. Identify Stream Type
        const lowUrl = (url || "").toLowerCase();
        const sType = (stream_type || 'live').toLowerCase();
        const sFormat = (stream_format || '').toLowerCase();
        
        // Comprehensive Detection (Prioritize backend flags, then extensions)
        const isHlsDetected = sType === 'hls' || sFormat === 'hls' || lowUrl.includes('.m3u8') || lowUrl.includes('m3u8') || lowUrl.includes('hls-proxy');
        const isTsDetected = sType === 'ts' || sFormat === 'ts' || sFormat === 'flv' || lowUrl.includes('.ts') || lowUrl.includes('mpegts') || lowUrl.includes('.flv') || lowUrl.includes('proxy_merge') || lowUrl.includes('ts-proxy') || lowUrl.includes('smartlink');
        const isNativeDetected = sType === 'vod' || sFormat === 'mp4' || sFormat === 'mkv' || ['.mp4', '.mkv', '.mov', '.avi', '.wmv'].some(ext => lowUrl.includes(ext));
        
        // Expose explicit LIVE state for UI components
        videoElement._isExplicitLive = !isNativeDetected;
        
        // 3. Resolve Smart URL
        const canPlayNativeHLS = videoElement.canPlayType('application/vnd.apple.mpegurl') || videoElement.canPlayType('application/x-mpegURL');
        const canPlayNativeTS = videoElement.canPlayType('video/mp2t') || videoElement.canPlayType('video/mp2');
        const getHLSEngine = () => canPlayNativeHLS ? 'native' : 'hls';
        const getTSEngine = () => canPlayNativeTS ? 'native' : 'ts';
        
        let playbackUrl = url;
        let pEngine = 'native';
        const host = window.location.origin;

        if (forcedType === 'default' || !forcedType) {
            if (isHlsDetected) {
                // For HLS in Smart mode, prioritize Proxy if not native (better CORS/Referer handling)
                if (canPlayNativeHLS) {
                    playbackUrl = url;
                    pEngine = 'native';
                } else {
                    playbackUrl = `${host}/channels/api/proxy_hls_manifest?channel_id=${id}&token=${token}`;
                    pEngine = 'hls';
                }
            } else {
                // For TS/Other in Smart mode, prioritize Direct URL (faster/lower latency)
                playbackUrl = url;
                pEngine = getTSEngine();
            }
        } else if (forcedType === 'none') {
            playbackUrl = url;
            if (isHlsDetected) pEngine = getHLSEngine();
            else if (isTsDetected) pEngine = getTSEngine();
            else pEngine = (sType === 'vod') ? 'native' : getTSEngine();
        } else if (forcedType === 'tracking') {
            if (isHlsDetected) {
                playbackUrl = `${host}/channels/api/proxy_hls_manifest?channel_id=${id}&token=${token}`;
                pEngine = getHLSEngine();
            } else {
                playbackUrl = `${host}/channels/track/${id}?token=${token}`;
                pEngine = getTSEngine();
            }
        } else if (forcedType === 'hls') {
            playbackUrl = `${host}/channels/api/proxy_hls_manifest?channel_id=${id}&token=${token}`;
            pEngine = getHLSEngine();
        } else if (forcedType === 'ts') {
            playbackUrl = `${host}/channels/play/${id}?token=${token}`;
            pEngine = getTSEngine();
        }

        // Final sanity check: If it's a proxy HLS manifest, it's DEFINITELY HLS
        if (playbackUrl.includes('proxy_hls_manifest')) pEngine = 'hls';

        console.log(`[IPTVPlayer] Resolved Playback URL: ${playbackUrl} | Engine: ${pEngine}`);
        this.currentUrl = playbackUrl;
        
        // 4. UI Feedback
        if (overlay) overlay.classList.remove('hidden');
        if (statusLabel) statusLabel.innerText = "CONNECTING...";

        // 5. Start Heartbeat (Consolidated & Safe)
        if (id) {
            // Clear any existing active heartbeats immediately
            if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
            if (this.heartbeatTimeout) clearTimeout(this.heartbeatTimeout);

            const sendPing = (sec) => {
                // Safety: Don't ping if this player instance is no longer "current" or paused
                if (this.currentId !== id || videoElement.paused || videoElement.readyState === 0) return;
                
                fetch('/channels/api/player_ping', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ channel_id: parseInt(id), seconds: sec })
                }).catch(err => console.warn("[IPTVPlayer] Ping failed"));
            };

            // Initial ping after 5s to confirm stable playback, then every 20s
            this.heartbeatTimeout = setTimeout(() => sendPing(5), 5000);
            this.heartbeatInterval = setInterval(() => sendPing(20), 20000);
        }

        // 6. Execute Engine
        try {
            if (pEngine === 'hls') {
                if (typeof Hls === 'undefined' || !Hls.isSupported()) {
                    throw new Error("HLS NOT SUPPORTED");
                }
                this.hls = new Hls({ 
                    enableWorker: true, 
                    maxBufferLength: 30,
                    manifestLoadingMaxRetry: 2,
                    levelLoadingMaxRetry: 2
                });
                this.hls.attachMedia(videoElement);
                this.hls.on(Hls.Events.MEDIA_ATTACHED, () => this.hls.loadSource(playbackUrl));
                this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    videoElement.play().catch(()=>{});
                    if (statusLabel) statusLabel.innerText = "LIVE (HLS)";
                    if (overlay) overlay.classList.add('hidden');
                });
                this.hls.on(Hls.Events.ERROR, (e, data) => {
                    console.error("[IPTVPlayer] HLS Error:", data);
                    if (data.fatal) {
                        if (statusLabel) statusLabel.innerText = `HLS FATAL: ${data.details}`;
                        if (overlay) overlay.classList.remove('hidden');
                        switch(data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR: this.hls.startLoad(); break;
                            case Hls.ErrorTypes.MEDIA_ERROR: this.hls.recoverMediaError(); break;
                            default: this.stop(videoElement); break;
                        }
                    } else if (data.details === 'levelParsingError' || data.details === 'manifestParsingError') {
                        if (statusLabel) statusLabel.innerText = "STREAM SYNC ISSUE (MISMATCH)";
                    } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        if (statusLabel) statusLabel.innerText = "NETWORK GLITCH (RETRYING...)";
                    }
                });
            } else if (pEngine === 'ts') {
                if (typeof mpegts === 'undefined' || !mpegts.getFeatureList().mseLivePlayback) {
                    throw new Error("TS NOT SUPPORTED");
                }
                
                // Optimized for high-bitrate Tvheadend / IPTV
                const mpegtsConfig = {
                    type: lowUrl.includes('.flv') || sFormat === 'flv' ? 'flv' : 'mpegts',
                    isLive: sType !== 'vod',
                    url: playbackUrl,
                    cors: true
                };
                
                const mpegtsOption = {
                    enableStashBuffer: true,
                    stashInitialSize: 1024 * 1024, // 1MB buffer for fast starts (Original was 8MB which caused lag)
                    enableWorker: true,
                    lazyLoad: false,
                    deferLoadAfterSourceOpen: false,
                    autoCleanupSourceBuffer: true,
                    liveBufferLatencyChasing: false,
                    statisticsInfoReportInterval: 10000 
                };

                this.mpegtsPlayer = mpegts.createPlayer(mpegtsConfig, mpegtsOption);
                this.mpegtsPlayer.attachMediaElement(videoElement);
                this.mpegtsPlayer.load();

                // TS Error Handling & Auto-Retry
                const MAX_RETRIES = 5;

                this.mpegtsPlayer.on(mpegts.Events.ERROR, (type, detail, info) => {
                    console.error(`[IPTVPlayer] TS Error: ${type} - ${detail}`, info);
                    const errorMsg = info && info.msg ? info.msg : detail;
                    
                    if (this.retryCount < MAX_RETRIES) {
                        this.retryCount++;
                        if (statusLabel) statusLabel.innerText = `RECONNECTING (${this.retryCount}/5)...`;
                        setTimeout(() => {
                             if (this.currentId === id) this.play(videoElement, config, true); 
                        }, 2000);
                    } else {
                        if (statusLabel) statusLabel.innerText = "TS ERROR: " + errorMsg;
                        if (overlay) overlay.classList.remove('hidden');
                    }
                });

                this.mpegtsPlayer.play().then(() => {
                    if (statusLabel) statusLabel.innerText = "LIVE (TS)";
                    if (overlay) overlay.classList.add('hidden');
                    retryCount = 0;
                }).catch(err => {
                    if (statusLabel) statusLabel.innerText = "TS PLAY ERROR";
                    if (overlay) overlay.classList.remove('hidden');
                    if (onError) onError(err);
                });
            } else {
                videoElement.src = playbackUrl;
                videoElement.play().then(() => {
                    if (statusLabel) statusLabel.innerText = "PLAYING (NATIVE)";
                    if (overlay) overlay.classList.add('hidden');
                }).catch(err => {
                    if (statusLabel) statusLabel.innerText = "CANNOT PLAY STREAM";
                    if (overlay) overlay.classList.remove('hidden');
                    if (onError) onError(err);
                });
            }
        } catch (err) {
            console.error("Player Engine Error:", err);
            if (statusLabel) statusLabel.innerText = err.message;
            if (overlay) overlay.classList.remove('hidden');
            if (onError) onError(err);
        }

        // 7. Video Element listeners for stalls (with nested logic)
        let bufferingTimer = null;
        let stallSuggestionTimer = null;
        
        videoElement.onwaiting = () => {
             if (bufferingTimer) return;
             bufferingTimer = setTimeout(() => {
                if (videoElement.paused || videoElement.readyState < 3) {
                    if (statusLabel) statusLabel.innerText = "BUFFERING...";
                    if (overlay) overlay.classList.remove('hidden');
                }
                bufferingTimer = null;
             }, 800); 

             // Suggest VLC if stalling for > 5s
             if (!stallSuggestionTimer) {
                 stallSuggestionTimer = setTimeout(() => {
                     if (videoElement.readyState < 3 && !videoElement.paused) {
                         if (onStall) onStall("Performance issue detected");
                     }
                 }, 5000);
             }
        };

        videoElement.onerror = (e) => {
            if (!videoElement.src || videoElement.src === window.location.href || videoElement.src.length < 5) return;
            const err = videoElement.error;
            console.error("[IPTVPlayer] Video Element Error:", err);
            if (onError) onError(err);
        };

        videoElement.onplaying = () => {
             if (bufferingTimer) { clearTimeout(bufferingTimer); bufferingTimer = null; }
             if (stallSuggestionTimer) { clearTimeout(stallSuggestionTimer); stallSuggestionTimer = null; }
             console.log("[IPTVPlayer] Playing - Hiding all overlays");
             if (overlay) overlay.classList.add('hidden');
             // Also ensure VLC fallback is hidden if we are playing
             const vlcContainer = document.getElementById('vlcFallback');
             if (vlcContainer) vlcContainer.classList.add('hidden');
             
             if (statusLabel && !statusLabel.innerText.includes('LIVE')) {
                  statusLabel.innerText = "LIVE";
             }
        };

        videoElement.onstalled = () => {
             console.log("[IPTVPlayer] Stream stalled");
             // Stalled doesn't always mean "broken", but we should notify if it lasts
        };
    },
    
    stop: function(videoElement) {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.heartbeatTimeout) {
            clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
        }
        
        if (this.hls) {
            console.log("[IPTVPlayer] Destroying HLS instance");
            this.hls.destroy();
            this.hls = null;
        }
        
        if (this.mpegtsPlayer) {
            console.log("[IPTVPlayer] Destroying mpegts instance");
            try {
                this.mpegtsPlayer.pause();
                this.mpegtsPlayer.unload();
                this.mpegtsPlayer.detachMediaElement();
                this.mpegtsPlayer.destroy();
            } catch(e) { console.warn("mpegts destroy failed:", e); }
            this.mpegtsPlayer = null;
        }
        if (videoElement) {
            videoElement.pause();
            videoElement.onwaiting = null;
            videoElement.onplaying = null;
            videoElement.onerror = null;
            videoElement.onstalled = null;
            videoElement.src = "";
            try { videoElement.load(); } catch(e) {}
        }
        this.currentId = null;
    }
};
