(function () {
    "use strict";

    try {
        const script = document.createElement("script");
        script.src = chrome.runtime.getURL("page-hook.js");
        script.onload = () => script.remove();
        (document.head || document.documentElement).appendChild(script);
    } catch (err) {
        console.error("[DomainVolume] hook injection failed", err);
    }

    let domainMultiplier = 1;

    function getDomain(hostname) {
        try {
            return tldts.getDomain(hostname) || hostname;
        } catch {
            return hostname;
        }
    }

    async function getRootDomain() {
        try {
            if (window === window.top) return getDomain(location.hostname);

            return new Promise(resolve => {
                const timeout = setTimeout(() => resolve(getDomain(location.hostname)), 500);

                function handler(event) {
                    if (event.data?.type !== "__DV_ROOT_DOMAIN") return;
                    clearTimeout(timeout);
                    window.removeEventListener("message", handler);
                    resolve(event.data.domain);
                }

                window.addEventListener("message", handler);
                window.top.postMessage({ type: "__DV_GET_ROOT_DOMAIN" }, "*");
            });
        } catch {
            return getDomain(location.hostname);
        }
    }

    function getEffectiveVolume(settings, domain) {
        const domainConfig = settings.domains?.[domain];
        if (domainConfig?.enabled) {
            const value = Number(domainConfig.volume);
            return Number.isFinite(value) ? value : 100;
        }
        const master = Number(settings.master);
        return Number.isFinite(master) ? master : 100;
    }

    window.addEventListener("message", event => {
        if (event.source && event.data?.type === "__DV_GET_ROOT_DOMAIN") {
            event.source.postMessage({
                type: "__DV_ROOT_DOMAIN",
                domain: getDomain(location.hostname)
            }, "*");
        }
    });

    async function loadSettings() {
        try {
            const storage = await chrome.storage.local.get("settings");
            const settings = storage.settings || { master: 100, domains: {} };
            const currentDomain = await getRootDomain();
            const effectiveVolume = getEffectiveVolume(settings, currentDomain);

            domainMultiplier = effectiveVolume / 100;
            document.documentElement.dataset.domainVolume = String(domainMultiplier);

            window.dispatchEvent(new CustomEvent("DomainVolumeUpdate", {
                detail: { volume: domainMultiplier }
            }));

        } catch (err) {
            console.error("[DomainVolume]", err);
        }
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.settings) loadSettings();
    });

    loadSettings();
})();