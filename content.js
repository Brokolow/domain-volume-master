(function () {
	
	try {
		const script =
			document.createElement("script");

		script.src =
			chrome.runtime.getURL(
				"page-hook.js"
			);

		script.onload = () => {
			script.remove();
		};

		(
			document.head ||
			document.documentElement
		).appendChild(script);
	} catch (err) {
		console.error(
			"[DomainVolume] hook injection failed",
			err
		);
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
			if (window === window.top) {
				const domain =
					getDomain(
						location.hostname
					);
					
				return domain;
			}

			return new Promise(
				resolve => {
					const timeout =
						setTimeout(() => {
							resolve(
								getDomain(
									location.hostname
								)
							);
						}, 500);

					window.addEventListener(
						"message",
						function handler(event) {
							if (
								event.data?.type !==
								"__DV_ROOT_DOMAIN"
							) {
								return;
							}

							clearTimeout(
								timeout
							);

							window.removeEventListener(
								"message",
								handler
							);

							resolve(
								event.data.domain
							);
						}
					);

					window.top.postMessage(
						{
							type:
								"__DV_GET_ROOT_DOMAIN"
						},
						"*"
					);
				}
			);
		} catch {
			return getDomain(
				location.hostname
			);
		}
	}
	
    function getEffectiveVolume(settings, domain) {
        const domainConfig =
            settings.domains?.[domain];

        if (
            domainConfig &&
            domainConfig.enabled
        ) {
            const value = Number(
                domainConfig.volume
            );

            return Number.isFinite(value)
                ? value
                : 100;
        }

        const master = Number(
            settings.master
        );

        return Number.isFinite(master)
            ? master
            : 100;
    }
	
	window.addEventListener(
		"message",
		event => {
			if (
				event.source &&
				event.data?.type ===
					"__DV_GET_ROOT_DOMAIN"
			) {
				event.source?.postMessage(
					{
						type:
							"__DV_ROOT_DOMAIN",
						domain:
							getDomain(
								location.hostname
							)
					},
					"*"
				);
			}
		}
	);
	
    async function loadSettings() {
		
        try {
            const storage =
                await chrome.storage.local.get(
                    "settings"
                );

            const settings =
                storage.settings || {
                    master: 100,
                    domains: {}
                };
				
            const currentDomain =
				await getRootDomain();

			const domainConfig =
				settings.domains?.[currentDomain];
				
            const effectiveVolume =
                getEffectiveVolume(
                    settings,
                    currentDomain
                );

            domainMultiplier =
                effectiveVolume / 100;

            document.documentElement.dataset.domainVolume =
                String(
                    domainMultiplier
                );

            window.dispatchEvent(
                new CustomEvent(
                    "DomainVolumeUpdate",
                    {
                        detail: {
                            volume:
                                domainMultiplier
                        }
                    }
                )
            );

            document
                .querySelectorAll(
                    "audio, video"
                )
                .forEach(
                    applyDomainVolume
                );
				
        } catch (err) {
            console.error(
                "[DomainVolume]",
                err
            );
        }
    }

    function applyDomainVolume(
        media
    ) {
        try {
            const userVolume =
                Number(
                    media.dataset
                        .dvUserVolume ??
                        media.volume
                );
			
            const finalVolume =
                Math.max(
                    0,
                    Math.min(
                        1,
                        userVolume *
                            domainMultiplier
                    )
                );

            media.__dvApplying =
                true;

            media.volume =
                finalVolume;

            setTimeout(() => {
                media.__dvApplying =
                    false;
            }, 0);

        } catch (err) {
            console.error(
                "[DomainVolume]",
                err
            );
        }
    }

    function attachMedia(
        media
    ) {
        if (
            media.__domainVolumeAttached
        ) {
            return;
        }

        media.__domainVolumeAttached =
            true;

        media.dataset.dvUserVolume =
            String(media.volume);

        media.addEventListener(
			"volumechange",
			() => {
				if (media.__dvApplying) {
					return;
				}

				if (
					Math.abs(
						media.volume -
						Number(
							media.dataset.dvUserVolume
						) *
						domainMultiplier
					) < 0.001
				) {
					return;
				}

				media.dataset.dvUserVolume =
					String(media.volume);

				applyDomainVolume(media);
			}
		);
		
		media.addEventListener(
			"loadedmetadata",
			() => applyDomainVolume(media)
		);

		media.addEventListener(
			"play",
			() => applyDomainVolume(media)
		);
		
        applyDomainVolume(
            media
        );
    }

    new MutationObserver(
        mutations => {
            for (const mutation of mutations) {
                mutation.addedNodes.forEach(
                    node => {
                        if (
                            !(node instanceof HTMLElement)
                        ) {
                            return;
                        }

                        if (
                            node.matches?.(
                                "audio, video"
                            )
                        ) {
                            attachMedia(
                                node
                            );
                        }

                        node
                            .querySelectorAll?.(
                                "audio, video"
                            )
                            .forEach(
                                attachMedia
                            );
                    }
                );
            }
        }
    ).observe(
        document.documentElement,
        {
            childList: true,
            subtree: true
        }
    );

    chrome.storage.onChanged.addListener(
        (
            changes,
            area
        ) => {
            if (
                area ===
                    "local" &&
                changes.settings
            ) {
                loadSettings();
            }
        }
    );

    document
        .querySelectorAll(
            "audio, video"
        )
        .forEach(
            attachMedia
        );

    loadSettings();
})();