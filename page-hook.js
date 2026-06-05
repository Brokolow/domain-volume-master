(() => {
"use strict";

if (window.__DOMAIN_VOLUME_HOOK_INSTALLED__) {
    return;
}

window.__DOMAIN_VOLUME_HOOK_INSTALLED__ = true;

let multiplier =
    Number(
        document.documentElement
            ?.dataset
            ?.domainVolume
    ) || 1;

const contexts = new Set();

function updateAllContexts() {

    for (const ctxInfo of contexts) {
        try {
            ctxInfo.gain.gain.value =
                multiplier;
        } catch (err) {
            console.warn(
                "[DomainVolume] gain update failed",
                err
            );
        }
    }
}

window.addEventListener(
    "DomainVolumeUpdate",
    (event) => {
        const value = Number(
            event.detail?.volume
        );

        multiplier =
            Number.isFinite(value) &&
            value >= 0
                ? value
                : 1;

        document.documentElement.dataset.domainVolume =
            String(multiplier);

        updateAllContexts();
    }
);

const OriginalAudioContext =
    window.AudioContext;

function patchAudioContext(
    AudioContextClass
) {
    if (!AudioContextClass) {
        console.warn(
            "[DomainVolume] AudioContext unavailable"
        );

        return AudioContextClass;
    }

    return class PatchedAudioContext extends AudioContextClass {
        constructor(...args) {
            super(...args);

            try {
                if (
                    this.__domainVolumePatched
                ) {
                    return;
                }

                this.__domainVolumePatched =
                    true;

                const gain =
                    super.createGain();

                gain.gain.value =
                    multiplier;

                const originalDestination =
                    this.destination;

                const originalConnect =
                    AudioNode.prototype.connect;

                if (
                    !window.__DOMAIN_VOLUME_CONNECT_PATCHED__
                ) {
                    window.__DOMAIN_VOLUME_CONNECT_PATCHED__ =
                        true;

                    AudioNode.prototype.connect =
                        function (
                            ...connectArgs
                        ) {
                            try {
                                if (
                                    connectArgs[0] &&
                                    connectArgs[0]
                                        .__domainVolumeDestination
                                ) {
                                    connectArgs[0] =
                                        connectArgs[0]
                                            .__realDestination;
                                }
                            } catch (_) {}

                            return originalConnect.apply(
                                this,
                                connectArgs
                            );
                        };
                }

                gain.connect(
                    originalDestination
                );

                const proxyDestination = {
                    __domainVolumeDestination:
                        true,

                    __realDestination:
                        gain
                };

                Object.setPrototypeOf(
                    proxyDestination,
                    originalDestination
                );

                Object.defineProperty(
                    this,
                    "destination",
                    {
                        configurable: true,
                        enumerable: true,

                        get() {
                            return proxyDestination;
                        }
                    }
                );

                contexts.add({
                    context: this,
                    gain
                });

                const cleanup =
                    () => {
                        for (const item of contexts) {
                            if (
                                item.context ===
                                this
                            ) {
                                contexts.delete(
                                    item
                                );

                                break;
                            }
                        }
                    };

                this.addEventListener?.(
                    "statechange",
                    () => {

                        if (
                            this.state ===
                            "closed"
                        ) {
                            cleanup();
                        }
                    }
                );

                const originalClose =
                    this.close?.bind(this);

                if (
                    originalClose
                ) {
                    this.close =
                        async (
                            ...closeArgs
                        ) => {
                            cleanup();

                            return originalClose(
                                ...closeArgs
                            );
                        };
                }
            } catch (err) {
                console.error(
                    "[DomainVolume] WebAudio patch error",
                    err
                );
            }
        }
    };
}

window.AudioContext =
    patchAudioContext(
        OriginalAudioContext
    );

updateAllContexts();

})();
