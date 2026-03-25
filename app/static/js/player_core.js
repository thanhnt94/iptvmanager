/**
 * IPTV Manager - Shared Player Engine (v1.0)
 * Handles HLS, MPEG-TS, Native VOD, and Heartbeat reporting.
 */

window.IPTVPlayer = {
    hls: null,
    mpegtsPlayer: null,
    heartbeatInterval: null,
    currentUrl: null,
    currentId: null,
    
    /**
     * @param {HTMLVideoElement} videoElement The <video> tag
     * @param {Object} config { id, url, name, stream_type, forcedType, token, overlayElement, statusElement }
     */
    play: function(videoElement, config, isRetry = false) {
        const { id, url, name, stream_type, forcedType, token, overlay, statusLabel } = config;
        console.log(`[IPTVPlayer] ${isRetry ? 'Retrying' : 'Starting'} playback for: ${name} (ID: ${id})`);
        
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
        
        // Comprehensive Detection
        const isHlsDetected = lowUrl.includes('.m3u8') || lowUrl.includes('playlist') || lowUrl.includes('hls') || sType === 'hls';
        const isTsDetected = lowUrl.includes('.ts') || lowUrl.includes('mpegts') || lowUrl.includes('type=ts') || lowUrl.includes('output=ts') || sType === 'ts';
        const isNativeDetected = ['.mp4', '.mkv', '.mov', '.avi', '.wmv', '.flv'].some(ext => lowUrl.includes(ext)) || lowUrl.includes('/movie/') || sType === 'vod';
        
        // 3. Resolve Smart URL
        let playbackUrl = url;
        let pEngine = 'native';
        const host = window.location.origin;

        if (forcedType === 'default' || !forcedType) {
            playbackUrl = `${host}/channels/play/${id}?token=${token}`;
            if (isHlsDetected) pEngine = 'hls';
            else if (isTsDetected) pEngine = 'ts';
            else pEngine = (sType === 'vod') ? 'native' : 'ts'; // Default live to TS
        } else if (forcedType === 'none') {
            playbackUrl = url;
            if (isHlsDetected) pEngine = 'hls';
            else if (isTsDetected) pEngine = 'ts';
            else pEngine = (sType === 'vod') ? 'native' : 'ts';
        } else if (forcedType === 'tracking') {
            playbackUrl = `${host}/channels/track/${id}?token=${token}`;
            if (isHlsDetected) pEngine = 'hls';
            else if (isTsDetected) pEngine = 'ts';
            else pEngine = (sType === 'vod') ? 'native' : 'ts';
        } else if (forcedType === 'hls') {
            playbackUrl = `${host}/channels/api/proxy_hls_manifest?channel_id=${id}&token=${token}`;
            pEngine = 'hls';
        } else if (forcedType === 'ts') {
            playbackUrl = `${host}/channels/play/${id}?token=${token}`;
            pEngine = 'ts';
        }

        // Final sanity check: If it's a proxy HLS manifest, it's DEFINITELY HLS
        if (playbackUrl.includes('proxy_hls_manifest')) pEngine = 'hls';

        console.log(`[IPTVPlayer] Resolved Playback URL: ${playbackUrl} | Engine: ${pEngine}`);
        this.currentUrl = playbackUrl;
        
        // 4. UI Feedback
        if (overlay) overlay.classList.remove('d-none');
        if (statusLabel) statusLabel.innerText = "CONNECTING...";

        // 5. Start Heartbeat
        if (id) {
            const sendPing = (sec) => {
                if (videoElement.paused) return;
                fetch('/channels/api/heartbeat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ channel_id: parseInt(id), seconds: sec })
                }).catch(err => console.warn("Heartbeat failed"));
            };
            setTimeout(() => sendPing(2), 2000);
            this.heartbeatInterval = setInterval(() => sendPing(15), 15000);
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
                    if (overlay) overlay.classList.add('d-none');
                });
                this.hls.on(Hls.Events.ERROR, (e, data) => {
                    if (data.fatal) {
                        if (statusLabel) statusLabel.innerText = `HLS ERROR: ${data.type}`;
                        if (overlay) overlay.classList.remove('d-none');
                        console.error("HLS Fatal:", data);
                    }
                });
            } else if (pEngine === 'ts') {
                if (typeof mpegts === 'undefined' || !mpegts.getFeatureList().mseLivePlayback) {
                    throw new Error("TS NOT SUPPORTED");
                }
                
                // Optimized for high-bitrate Tvheadend / IPTV
                const mpegtsConfig = {
                    type: 'mse',
                    isLive: sType !== 'vod',
                    url: playbackUrl,
                    cors: true
                };
                
                const mpegtsOption = {
                    enableStashBuffer: true,
                    stashInitialSize: 4096, // 4MB "Extreme" initial buffer for slow Tvheadend
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
                let retryCount = 0;
                const MAX_RETRIES = 10; // "Extreme" retries

                this.mpegtsPlayer.on(mpegts.Events.ERROR, (type, detail, info) => {
                    console.error(`[IPTVPlayer] TS Error: ${type} - ${detail}`, info);
                    
                    if (retryCount < MAX_RETRIES) {
                        retryCount++;
                        if (statusLabel) statusLabel.innerText = `RECONNECTING (${retryCount}/${MAX_RETRIES})...`;
                        setTimeout(() => {
                             if (this.currentId === id) this.play(videoElement, config, true); 
                        }, 2000);
                    } else {
                        if (statusLabel) statusLabel.innerText = "TS ERROR: " + type;
                        if (overlay) overlay.classList.remove('d-none');
                    }
                });

                this.mpegtsPlayer.play().then(() => {
                    if (statusLabel) statusLabel.innerText = "LIVE (TS)";
                    if (overlay) overlay.classList.add('d-none');
                    retryCount = 0;
                }).catch(err => {
                    if (statusLabel) statusLabel.innerText = "TS PLAY ERROR";
                    if (overlay) overlay.classList.remove('d-none');
                });
            } else {
                videoElement.src = playbackUrl;
                videoElement.play().then(() => {
                    if (statusLabel) statusLabel.innerText = "PLAYING (NATIVE)";
                    if (overlay) overlay.classList.add('d-none');
                }).catch(err => {
                    if (statusLabel) statusLabel.innerText = "CANNOT PLAY STREAM";
                    if (overlay) overlay.classList.remove('d-none');
                });
            }
        } catch (err) {
            console.error("Player Engine Error:", err);
            if (statusLabel) statusLabel.innerText = err.message;
            if (overlay) overlay.classList.remove('d-none');
        }

        // 7. Video Element listeners for stalls (with debounce)
        let bufferingTimer = null;
        videoElement.onwaiting = () => {
             if (bufferingTimer) return;
             bufferingTimer = setTimeout(() => {
                if (videoElement.paused || videoElement.readyState < 3) {
                    if (statusLabel) statusLabel.innerText = "BUFFERING...";
                    if (overlay) overlay.classList.remove('d-none');
                }
                bufferingTimer = null;
             }, 800); // Only show overlay if stuck for > 800ms
        };
        videoElement.onplaying = () => {
             if (bufferingTimer) { clearTimeout(bufferingTimer); bufferingTimer = null; }
             if (overlay) overlay.classList.add('d-none');
             if (statusLabel && !statusLabel.innerText.includes('LIVE')) {
                  statusLabel.innerText = "LIVE";
             }
        };
        videoElement.onstalled = () => {
             // onstalled is often too sensitive, just log it
             console.log("[IPTVPlayer] Stream stalled");
        };
    },
    
    stop: function(videoElement) {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        
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
            videoElement.src = "";
            videoElement.load();
        }
        this.currentId = null;
    }
};
