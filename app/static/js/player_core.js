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
    play: function(videoElement, config) {
        const { id, url, name, stream_type, forcedType, token, overlay, statusLabel } = config;
        
        // 1. Logic Cleanup
        this.stop(videoElement);
        this.currentId = id;
        
        // 2. Identify Stream Type
        const lowUrl = (url || "").toLowerCase();
        const sType = stream_type || 'live';
        const isHlsDetected = lowUrl.includes('.m3u8') || lowUrl.includes('playlist') || lowUrl.includes('hls');
        const isTsDetected = lowUrl.includes('.ts') || lowUrl.includes('mpegts') || lowUrl.includes('type=ts');
        
        // 3. Resolve Smart URL
        let playbackUrl = url;
        let pEngine = 'native';
        const host = window.location.origin;

        if (forcedType === 'default' || !forcedType) {
            playbackUrl = `${host}/channels/play/${id}?token=${token}`;
            if (isHlsDetected) pEngine = 'hls';
            else if (isTsDetected || sType !== 'vod') pEngine = 'ts';
        } else if (forcedType === 'none') {
            playbackUrl = url;
            if (isHlsDetected) pEngine = 'hls';
            else if (isTsDetected || sType !== 'vod') pEngine = 'ts';
        } else if (forcedType === 'tracking') {
            playbackUrl = `${host}/channels/track/${id}?token=${token}`;
            pEngine = isHlsDetected ? 'hls' : (isTsDetected || sType !== 'vod' ? 'ts' : 'native');
        } else if (forcedType === 'hls') {
            playbackUrl = `${host}/channels/api/proxy_hls_manifest?channel_id=${id}&token=${token}`;
            pEngine = 'hls';
        } else if (forcedType === 'ts') {
            playbackUrl = `${host}/channels/play/${id}?token=${token}`; // TS through gateway
            pEngine = 'ts';
        }

        this.currentUrl = playbackUrl;
        
        // 4. UI Feedback
        if (overlay) {
            overlay.classList.remove('d-none');
            overlay.innerHTML = '<div class="spinner-border text-primary" role="status"></div>';
        }
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
        if (pEngine === 'hls' && Hls.isSupported()) {
            this.hls = new Hls({ enableWorker: true, maxBufferLength: 30 });
            this.hls.attachMedia(videoElement);
            this.hls.on(Hls.Events.MEDIA_ATTACHED, () => this.hls.loadSource(playbackUrl));
            this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                videoElement.play().catch(()=>{});
                if (statusLabel) statusLabel.innerText = "LIVE (HLS)";
                if (overlay) overlay.classList.add('d-none');
            });
            this.hls.on(Hls.Events.ERROR, (e, data) => {
                if (data.fatal && statusLabel) statusLabel.innerText = "HLS ERROR";
            });
        } else if (pEngine === 'ts' && mpegts.getFeatureList().mseLivePlayback) {
            this.mpegtsPlayer = mpegts.createPlayer({ type: 'mse', isLive: sType !== 'vod', url: playbackUrl }, { enableStashBuffer: true });
            this.mpegtsPlayer.attachMediaElement(videoElement);
            this.mpegtsPlayer.load();
            this.mpegtsPlayer.play().then(() => {
                if (statusLabel) statusLabel.innerText = "LIVE (TS)";
                if (overlay) overlay.classList.add('d-none');
            }).catch(()=>{});
        } else {
            videoElement.src = playbackUrl;
            videoElement.play().then(() => {
                if (statusLabel) statusLabel.innerText = "PLAYING (NATIVE)";
                if (overlay) overlay.classList.add('d-none');
            }).catch(()=>{});
        }
    },
    
    stop: function(videoElement) {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        if (this.hls) { this.hls.destroy(); this.hls = null; }
        if (this.mpegtsPlayer) { this.mpegtsPlayer.destroy(); this.mpegtsPlayer = null; }
        if (videoElement) {
            videoElement.pause();
            videoElement.src = "";
            videoElement.load();
        }
        this.currentId = null;
    }
};
