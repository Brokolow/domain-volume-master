const masterSlider = document.getElementById("masterSlider");
const masterValue = document.getElementById("masterValue");
const domainsContainer = document.getElementById("domains");

const domainElements = {};

function getDomain(url) {
    const host = new URL(url).hostname;
    const parts = host.split(".");
    return parts.slice(-2).join(".");
}

function broadcastUpdate() {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {

            if (!tab.url || !tab.url.startsWith("http")) return;

            chrome.tabs.sendMessage(
                tab.id,
                { action: "update" },
                () => {
                    chrome.runtime.lastError;
                }
            );
        });
    });
}

chrome.storage.local.get(["settings"], (data) => {

    let settings = data.settings || {
        master: 100,
        domains: {}
    };

    masterSlider.value = settings.master;
    masterValue.textContent = settings.master + "%";

    masterSlider.oninput = () => {
        settings.master = Number(masterSlider.value);
        masterValue.textContent = settings.master + "%";
        save();
    };

    function createRow(domain, tab) {

        const card = document.createElement("div");
        card.className = "card";

        const header = document.createElement("div");
        header.className = "domain-header";
        header.style.display = "flex";
        header.style.justifyContent = "space-between";

        const left = document.createElement("div");
        left.style.display = "flex";
        left.style.alignItems = "center";
        left.style.gap = "8px";

        const icon = document.createElement("img");
        icon.src = tab.favIconUrl || `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        icon.className = "favicon";

        const title = document.createElement("span");
        title.textContent = domain;

        left.appendChild(icon);
        left.appendChild(title);

        // RIGHT
        const right = document.createElement("div");
        right.style.display = "flex";
        right.style.alignItems = "center";
        right.style.gap = "6px";

        const label = document.createElement("span");
        label.textContent = "Custom volume";
        label.style.fontSize = "11px";
        label.style.opacity = "0.7";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";

        right.appendChild(label);
        right.appendChild(checkbox);

        header.appendChild(left);
        header.appendChild(right);

        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = 0;
        slider.max = 100;

        const percent = document.createElement("div");

        card.appendChild(header);
        card.appendChild(slider);
        card.appendChild(percent);

        domainsContainer.appendChild(card);

        domainElements[domain] = {
            checkbox,
            slider,
            percent
        };

        checkbox.onchange = () => {

            const wasEnabled = settings.domains[domain].enabled;
            const nowEnabled = checkbox.checked;

            settings.domains[domain].enabled = nowEnabled;

            if (!wasEnabled && nowEnabled) {
                settings.domains[domain].volume = settings.master;
            }

            save();
        };

        slider.oninput = () => {
            settings.domains[domain].volume = Number(slider.value);
            percent.textContent = slider.value + "%";
            save();
        };
    }

    function updateUI() {

        Object.keys(domainElements).forEach(domain => {

            const el = domainElements[domain];
            const conf = settings.domains[domain];

            if (conf.enabled) {
                el.slider.value = conf.volume;
                el.slider.disabled = false;
                el.percent.textContent = conf.volume + "%";
                el.checkbox.checked = true;
            } else {
                el.slider.value = settings.master;
                el.slider.disabled = true;
                el.percent.textContent = settings.master + "%";
                el.checkbox.checked = false;
            }
        });
    }

    function save() {
        chrome.storage.local.set({ settings });
        updateUI();
        broadcastUpdate();
    }

    chrome.tabs.query({}, (tabs) => {

        const handled = new Map();

        tabs.forEach(tab => {

            if (!tab.url || !tab.url.startsWith("http")) return;

            const domain = getDomain(tab.url);

            if (!handled.has(domain)) {
                handled.set(domain, tab);
            }
        });

        handled.forEach((tab, domain) => {

            if (!settings.domains[domain]) {
                settings.domains[domain] = {
                    enabled: false,
                    volume: 100
                };
            }

            createRow(domain, tab);
        });

        updateUI();
    });
});