let currentVolume = 1;

function getRootDomain(hostname) {
    const parts = hostname.split(".");
    return parts.slice(-2).join(".");
}

function getDomain() {
    return getRootDomain(window.location.hostname);
}

const enhanced = new WeakSet();

function useWebAudio() {
    const host = window.location.hostname;
    return !host.includes("dailymotion");
}

function enhanceMedia(el) {

    if (enhanced.has(el)) return;
    enhanced.add(el);

    if (useWebAudio()) {
        try {
            const ctx = new AudioContext();
            const source = ctx.createMediaElementSource(el);
            const gain = ctx.createGain();

            source.connect(gain);
            gain.connect(ctx.destination);

            el._extGainNode = gain;
            gain.gain.value = currentVolume;

        } catch (e) {
            el._extUseHTML = true;
        }

    } else {
        el._extUseHTML = true;
    }

    el._extBaseVolume = el.volume;
    el._extLastApplied = el.volume;

    
	el.addEventListener("volumechange", () => {

		if (!el._extUseHTML) return;

		if (Math.abs(el.volume - el._extLastApplied) < 0.02) return;

		el._extBaseVolume = el.volume;

		Promise.resolve().then(() => {
			applyHTML(el);
		});
	});


    if (el._extUseHTML) {

        el._extInterval = setInterval(() => {

            const desired = Math.min(el._extBaseVolume * currentVolume, 1);

            if (Math.abs(el.volume - desired) > 0.02) {
                el._extLastApplied = desired;
                el.volume = desired;
            }

        }, 150);
    }

    applyHTML(el);
}

function applyHTML(el) {

    if (el._extBaseVolume === undefined) return;

    const final = Math.min(el._extBaseVolume * currentVolume, 1);

    el._extLastApplied = final;
    el.volume = final;
}

function scan() {
    document.querySelectorAll("video, audio").forEach(enhanceMedia);
}

function updateVolume() {

    chrome.storage.local.get(["settings"], (data) => {

        const settings = data.settings || {};

        const master = (settings.master ?? 100) / 100;
        const domainConf = settings.domains?.[getDomain()];

        currentVolume = domainConf?.enabled
            ? domainConf.volume / 100
            : master;

        document.querySelectorAll("video, audio").forEach(el => {

            if (el._extGainNode) {
                el._extGainNode.gain.value = currentVolume;
            }

            if (el._extUseHTML) {
                applyHTML(el);
            }
        });
    });
}

chrome.runtime.onMessage.addListener(msg => {
    if (msg.action === "update") updateVolume();
});

const observer = new MutationObserver(scan);

observer.observe(document, {
    childList: true,
    subtree: true
});

scan();
updateVolume();
