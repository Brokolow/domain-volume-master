const masterSlider = document.getElementById("masterSlider");
const masterValue = document.getElementById("masterValue");
const domainsContainer = document.getElementById("domains");

const domainElements = {};

let settings = {
    master: 100,
    domains: {}
};

function getDomain(url) {
    try {
        const host = new URL(url).hostname;

        return tldts.getDomain(host) || host;
    } catch {
        return null;
    }
}

function saveSettings() {
    chrome.storage.local.set({
        settings
    });

    updateUI();
}

function createDomainRow(domain, tab) {
    const card = document.createElement("div");
    card.className = "card";

    const header = document.createElement("div");
    header.className = "domain-header";

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.alignItems = "center";
    left.style.gap = "8px";

    const icon = document.createElement("img");
    icon.className = "favicon";

    icon.src =
        tab.favIconUrl ||
        `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

    icon.onerror = () => {
        icon.style.visibility = "hidden";
    };

    const title = document.createElement("span");
    title.textContent = domain;

    left.appendChild(icon);
    left.appendChild(title);

    const right = document.createElement("div");
	right.style.display = "flex";
	right.style.alignItems = "center";
	right.style.gap = "6px";

	const label = document.createElement("span");
	label.textContent = "Custom volume";

	const checkbox = document.createElement("input");
	checkbox.type = "checkbox";

	right.appendChild(label);
	right.appendChild(checkbox);

    header.appendChild(left);
    header.appendChild(right);

    const slider = document.createElement("input");

    slider.type = "range";
    slider.min = "0";
    slider.max = "100";

    const percent = document.createElement("div");
    percent.className = "percent";

    card.appendChild(header);
    card.appendChild(slider);
    card.appendChild(percent);

    domainsContainer.appendChild(card);

    domainElements[domain] = {
        checkbox,
        slider,
        percent
    };

    checkbox.addEventListener("change", () => {
		const conf = settings.domains[domain];

		conf.enabled = checkbox.checked;

		if (conf.enabled) {
			conf.volume = settings.master;
		}

		saveSettings();
	});

    slider.addEventListener("input", () => {
        settings.domains[domain].volume =
            Number(slider.value);

        percent.textContent =
            slider.value + "%";

        saveSettings();
    });
}

function updateUI() {
    masterSlider.value = settings.master;
    masterValue.textContent =
        settings.master + "%";

    Object.entries(domainElements).forEach(
        ([domain, elements]) => {
            const conf =
                settings.domains[domain];

            if (!conf) {
                return;
            }

            if (conf.enabled) {
                elements.checkbox.checked = true;

                elements.slider.disabled =
                    false;

                elements.slider.value =
                    conf.volume;

                elements.percent.textContent =
                    conf.volume + "%";
            } else {
                elements.checkbox.checked =
                    false;

                elements.slider.disabled =
                    true;

                elements.slider.value =
                    settings.master;

                elements.percent.textContent =
                    settings.master + "%";
            }
        }
    );
}

function buildDomains(tabs) {

    const activeTab = tabs.find(
        tab => tab.active
    );

    const orderedTabs = activeTab
        ? [
            activeTab,
            ...tabs.filter(
                tab => !tab.active
            )
        ]
        : tabs;

    const handledDomains = new Map();

    orderedTabs.forEach(tab => {
        if (!tab.url) {
            return;
        }

        if (
            !tab.url.startsWith("http://") &&
            !tab.url.startsWith("https://")
        ) {
            return;
        }

        const domain =
            getDomain(tab.url);

        if (!domain) {
            return;
        }

        if (!handledDomains.has(domain)) {
            handledDomains.set(
                domain,
                tab
            );
        }
    });

    handledDomains.forEach(
        (tab, domain) => {
            if (
                !settings.domains[domain]
            ) {
                settings.domains[domain] = {
                    enabled: false,
                    volume: settings.master
                };
            }

            createDomainRow(
                domain,
                tab
            );
        }
    );

    updateUI();
}

chrome.storage.local.get(
    ["settings"],
    data => {
        settings = data.settings || {
            master: 100,
            domains: {}
        };

        masterSlider.value =
            settings.master;

        masterValue.textContent =
            settings.master + "%";

        masterSlider.addEventListener(
            "input",
            () => {
                settings.master =
                    Number(
                        masterSlider.value
                    );

                masterValue.textContent =
                    settings.master + "%";

                saveSettings();
            }
        );

        chrome.tabs.query(
            {},
            tabs => {
                buildDomains(tabs);
            }
        );
    }
);