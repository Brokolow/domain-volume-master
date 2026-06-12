(() => {
    "use strict";

    if (window.__DOMAIN_VOLUME_HOOK_INSTALLED__) return;
    window.__DOMAIN_VOLUME_HOOK_INSTALLED__ = true;

    let multiplier = Number(document.documentElement?.dataset?.domainVolume) || 1;
    const contexts = new Set();
    const mediaElements = new Set();

    // --- WebAudio patch
    function updateAllContexts() {
        for (const { gain } of contexts) {
            try { gain.gain.value = multiplier; } catch (_) { }
        }
    }

    window.addEventListener("DomainVolumeUpdate", event => {
        const value = Number(event.detail?.volume);
        multiplier = Number.isFinite(value) && value >= 0 ? value : 1;
        document.documentElement.dataset.domainVolume = String(multiplier);
        console.log("[DV] DomainVolumeUpdate:", multiplier);
        updateAllContexts();
        updateAllMedia();
    });

    function patchAudioContext(AudioContextClass) {
        if (!AudioContextClass) return AudioContextClass;

        return class extends AudioContextClass {
            constructor(...args) {
                super(...args);
                try {
                    if (this.__domainVolumePatched) return;
                    this.__domainVolumePatched = true;

                    const gain = super.createGain();
                    gain.gain.value = multiplier;
                    const originalDestination = this.destination;

                    if (!window.__DOMAIN_VOLUME_CONNECT_PATCHED__) {
                        window.__DOMAIN_VOLUME_CONNECT_PATCHED__ = true;
                        const originalConnect = AudioNode.prototype.connect;
                        AudioNode.prototype.connect = function (...args) {
                            try { if (args[0]?.__domainVolumeDestination) args[0] = args[0].__realDestination; } catch (_) { }
                            return originalConnect.apply(this, args);
                        };
                    }

                    gain.connect(originalDestination);
                    const proxyDestination = { __domainVolumeDestination: true, __realDestination: gain };
                    Object.setPrototypeOf(proxyDestination, originalDestination);
                    Object.defineProperty(this, "destination", { configurable: true, enumerable: true, get() { return proxyDestination; } });

                    const ctxInfo = { context: this, gain };
                    contexts.add(ctxInfo);

                    const cleanup = () => contexts.delete(ctxInfo);
                    this.addEventListener?.("statechange", () => { if (this.state === "closed") cleanup(); });
                    const originalClose = this.close?.bind(this);
                    if (originalClose) this.close = async (...args) => { cleanup(); return originalClose(...args); };

                    console.log("[DV] AudioContext created", gain.gain.value);
                } catch (err) { console.error("[DomainVolume] WebAudio patch error", err); }
            }
        };
    }

    window.AudioContext = patchAudioContext(window.AudioContext);
    updateAllContexts();

    // --- Detect WebAudio usage
    const originalCreateMediaElementSource = AudioContext.prototype.createMediaElementSource;
    AudioContext.prototype.createMediaElementSource = function (mediaElement) {
        mediaElement.__dvUsesWebAudio = true;
        return originalCreateMediaElementSource.call(this, mediaElement);
    };
    if (window.webkitAudioContext) {
        const originalWK = webkitAudioContext.prototype.createMediaElementSource;
        webkitAudioContext.prototype.createMediaElementSource = function (mediaElement) {
            mediaElement.__dvUsesWebAudio = true;
            return originalWK.call(this, mediaElement);
        };
    }

    // --- HTMLMedia fallback
    function clamp(value) { return Math.max(0, Math.min(1, value)); }
    function shouldUseHtmlMediaVolume(media) { return media instanceof HTMLMediaElement && !media.__dvUsesWebAudio; }

    function applyMediaVolume(media) {
        try {
            if (!shouldUseHtmlMediaVolume(media)) return;
            const userVolume = Number(media.__dvUserVolume ?? media.volume);
            media.__dvApplying = true;
            media.volume = clamp(userVolume * multiplier);
            console.log("[DV] applyMediaVolume", media.currentSrc || media.src, "volume:", media.volume);
            queueMicrotask(() => { media.__dvApplying = false; });
        } catch (_) { }
    }

    function registerMedia(media) {
        if (!media || media.__dvRegistered) return;
        media.__dvRegistered = true;
        media.__dvUserVolume = media.volume;
        mediaElements.add(media);
        applyMediaVolume(media);

        media.addEventListener("volumechange", () => {
            if (!shouldUseHtmlMediaVolume(media)) return;
            if (media.__dvApplying) return;
            const expected = clamp(media.__dvUserVolume * multiplier);
            if (Math.abs(media.volume - expected) < 0.001) return;
            console.log("[DV] volumechange", media.currentSrc || media.src, "from", media.volume, "to", expected);
            media.__dvUserVolume = media.volume;
            applyMediaVolume(media);
        });

        // --- Logs pour les événements de cycle de vie
        ["play", "pause", "ended", "loadedmetadata", "canplay", "canplaythrough"].forEach(eventName => {
            media.addEventListener(eventName, () => {
                console.log(`[DV] event ${eventName}`, media.currentSrc || media.src, "volume", media.volume);
            });
        });

        // --- Réapplique automatiquement si le src change (YouTube, SoundCloud)
        let lastSrc = media.src;
        new MutationObserver(() => {
            if (media.src && media.src !== lastSrc) {
                console.log("[DV] src changed", lastSrc, "=>", media.src);
                lastSrc = media.src;
                media.__dvUserVolume ??= media.volume;
                applyMediaVolume(media);
            }
        }).observe(media, { attributes: true, attributeFilter: ["src"] });
    }

    function updateAllMedia() { for (const media of mediaElements) applyMediaVolume(media); }

    // --- Interception new Audio()
    const OriginalAudio = window.Audio;
    window.Audio = function (...args) { const audio = new OriginalAudio(...args); registerMedia(audio); return audio; };
    window.Audio.prototype = OriginalAudio.prototype;
    Object.setPrototypeOf(window.Audio, OriginalAudio);

    const originalCreateElement = Document.prototype.createElement;
    Document.prototype.createElement = function (...args) {
        const element = originalCreateElement.apply(this, args);
        const tag = String(args[0] || "").toLowerCase();
        if (tag === "audio" || tag === "video") registerMedia(element);
        return element;
    };

    // --- Observer pour tous les médias
    const observer = new MutationObserver(() => {
        document.querySelectorAll("audio,video").forEach(registerMedia);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    document.querySelectorAll("audio,video").forEach(registerMedia);

})();