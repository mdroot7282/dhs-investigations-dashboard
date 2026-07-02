// =====================================================
// DII DHS Investigative Statistics Dashboard
// Version 2.0
// =====================================================

const map = L.map("map", {
    minZoom: CONFIG.map.minZoom,
    maxZoom: CONFIG.map.maxZoom
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap Contributors"
}).addTo(map);

const illinoisBounds = L.latLngBounds(
    [36.97, -91.65],
    [42.55, -87.45]
);

function resetToIllinoisView() {
    map.fitBounds(illinoisBounds, {
        padding: [40, 40],
        animate: true
    });
}

const bounds = L.latLngBounds();
const detailsEl = document.getElementById("details");
const presentationFacilityNameEl = document.getElementById("presentationFacilityName");
const presentationCityEl = document.getElementById("presentationCity");
const presentationLastUpdatedEl = document.getElementById("presentationLastUpdated");
const presentationTotalAllegationsEl = document.getElementById("presentationTotalAllegations");
const presentationTotalOpenedEl = document.getElementById("presentationTotalOpened");
const presentationBatteryCasesEl = document.getElementById("presentationBatteryCases");
const presentationSexualMisconductCasesEl = document.getElementById("presentationSexualMisconductCases");
const presentationConvictionsEl = document.getElementById("presentationConvictions");
const presentationActiveCasesEl = document.getElementById("presentationActiveCases");
const lastRefreshEl = document.getElementById("lastRefresh");
const facilityFooterEl = document.getElementById("facilityFooter");
const searchInputEl = document.getElementById("facilitySearchInput");
const searchResultsEl = document.getElementById("facilitySearchResults");
const searchToolbarEl = document.getElementById("mapToolbar");
const resetViewButton = document.getElementById("resetViewButton");

if (resetViewButton) {
    resetViewButton.addEventListener("click", () => {
        // Fully clear selection/UI first, then reset map view
        map.closePopup();
        resetSelectedMarker();
        searchInputEl.value = "";
        hideSearchResults();
        showInitialMessage();
        resetToIllinoisView();
    });
}

const kpiElements = {
    totalAllegations: document.getElementById("totalAllegations"),
    totalOpened: document.getElementById("totalOpened"),
    batteryCases: document.getElementById("batteryCases"),
    sexualMisconductCases: document.getElementById("sexualMisconductCases"),
    convictions: document.getElementById("convictions"),
    activeCases: document.getElementById("activeCases")
};

function parseNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function getMarkerColor(activeCases) {
    if (activeCases === 0) {
        return CONFIG.colors.green;
    }
    if (activeCases <= 2) {
        return CONFIG.colors.yellow;
    }
    if (activeCases <= 5) {
        return CONFIG.colors.orange;
    }
    return CONFIG.colors.red;
}

function formatFacilityInfo(facility) {
    const notes = facility.Notes ? facility.Notes : "No notes available.";
    return `
        <div class="detailsRow"><span class="detailsLabel">Title:</span><span>${facility.Title}</span></div>
        <div class="detailsRow"><span class="detailsLabel">Address:</span><span>${facility.Address}</span></div>
        <div class="detailsRow"><span class="detailsLabel">City:</span><span>${facility.City}</span></div>
        <div class="detailsRow"><span class="detailsLabel">Total Allegations:</span><span>${facility["Total Allegations"]}</span></div>
        <div class="detailsRow"><span class="detailsLabel">Total Cases Opened:</span><span>${facility["Total Cases Opened"]}</span></div>
        <div class="detailsRow"><span class="detailsLabel">Battery Cases:</span><span>${facility["Battery Cases"]}</span></div>
        <div class="detailsRow"><span class="detailsLabel">Sexual Misconduct Cases:</span><span>${facility["Sexual Misconduct Cases"]}</span></div>
        <div class="detailsRow"><span class="detailsLabel">Convictions:</span><span>${facility.Convictions}</span></div>
        <div class="detailsRow"><span class="detailsLabel">Active Cases:</span><span>${facility["Active Cases"]}</span></div>
        <div class="detailsRow"><span class="detailsLabel">Notes:</span><span>${notes}</span></div>
        <div class="detailsRow"><span class="detailsLabel">Last Updated:</span><span>${facility["Last Updated"]}</span></div>
    `;
}

function getPopupHtml(facility) {
    return `
        <div class="popupTitle">${facility.Title}</div>
        <div><strong>Address:</strong> ${facility.Address}</div>
        <div><strong>City:</strong> ${facility.City}</div>
        <div><strong>Total Allegations:</strong> ${facility["Total Allegations"]}</div>
        <div><strong>Total Cases Opened:</strong> ${facility["Total Cases Opened"]}</div>
        <div><strong>Battery Cases:</strong> ${facility["Battery Cases"]}</div>
        <div><strong>Sexual Misconduct Cases:</strong> ${facility["Sexual Misconduct Cases"]}</div>
        <div><strong>Convictions:</strong> ${facility.Convictions}</div>
        <div><strong>Active Cases:</strong> ${facility["Active Cases"]}</div>
        <div><strong>Last Updated:</strong> ${facility["Last Updated"]}</div>
    `;
}

let facilitiesData = [];
let selectedMarker = null;
let selectedFacility = null;
let highlightTimer = null;
const facilityMarkers = new Map();

function updateKpis(facilities) {
    const totals = facilities.reduce((acc, facility) => {
        acc.totalAllegations += parseNumber(facility["Total Allegations"]);
        acc.totalOpened += parseNumber(facility["Total Cases Opened"]);
        acc.batteryCases += parseNumber(facility["Battery Cases"]);
        acc.sexualMisconductCases += parseNumber(facility["Sexual Misconduct Cases"]);
        acc.convictions += parseNumber(facility.Convictions);
        acc.activeCases += parseNumber(facility["Active Cases"]);
        return acc;
    }, {
        totalAllegations: 0,
        totalOpened: 0,
        batteryCases: 0,
        sexualMisconductCases: 0,
        convictions: 0,
        activeCases: 0
    });

    kpiElements.totalAllegations.textContent = totals.totalAllegations.toLocaleString();
    kpiElements.totalOpened.textContent = totals.totalOpened.toLocaleString();
    kpiElements.batteryCases.textContent = totals.batteryCases.toLocaleString();
    kpiElements.sexualMisconductCases.textContent = totals.sexualMisconductCases.toLocaleString();
    kpiElements.convictions.textContent = totals.convictions.toLocaleString();
    kpiElements.activeCases.textContent = totals.activeCases.toLocaleString();
}

function updateFooter(facilityCount) {
    facilityFooterEl.textContent = facilityCount.toLocaleString();
    lastRefreshEl.textContent = new Date().toLocaleString();
}

function updateFacilityCount(facilityCount) {
    facilityFooterEl.textContent = facilityCount.toLocaleString();
}

function addFacilityMarkers(facilities) {
    facilities.forEach((facility) => {
        const latitude = parseNumber(facility.Latitude);
        const longitude = parseNumber(facility.Longitude);
        const activeCases = parseNumber(facility["Active Cases"]);

        if (!latitude || !longitude) {
            return;
        }

        const color = getMarkerColor(activeCases);
        const marker = L.circleMarker([latitude, longitude], {
            radius: 10,
            fillColor: color,
            color: "#333",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.85
        }).addTo(map);

        marker.defaultStyle = {
            radius: 10,
            fillColor: color,
            color: "#333",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.85
        };

        marker.bindPopup(getPopupHtml(facility), {
            minWidth: 260,
            maxWidth: 380,
            autoPan: true,
            keepInView: true,
            autoPanPaddingTopLeft: [20, 140],
            autoPanPaddingBottomRight: [20, 20]
        });

        marker.on("click", () => {
            selectFacility(facility, { flyTo: true, openPopup: true });
        });

        facilityMarkers.set(facility.Title, marker);
        bounds.extend([latitude, longitude]);
    });

    if (bounds.isValid()) {
        resetToIllinoisView();
    }
}

function resetSelectedMarker() {
    if (highlightTimer) {
        window.clearTimeout(highlightTimer);
        highlightTimer = null;
    }

    if (selectedMarker) {
        const markerElement = selectedMarker.getElement && selectedMarker.getElement();
        if (markerElement) markerElement.classList.remove('selected-marker');
        selectedMarker.setStyle(selectedMarker.defaultStyle);
        selectedMarker = null;
    }
    // Clear selected facility reference and ensure no popups/search remain
    selectedFacility = null;
    map.closePopup();
    searchInputEl.value = "";
    hideSearchResults();
    showInitialMessage();
    updatePresentationDetails(null);
}

function selectFacility(facility, options = {}) {
    const marker = facilityMarkers.get(facility.Title);

    if (!marker) {
        return;
    }

    resetSelectedMarker();

    // Track which facility is selected so Reset View can fully clear it
    selectedFacility = facility;

    const latitude = parseNumber(facility.Latitude);
    const longitude = parseNumber(facility.Longitude);

    const selectedStroke = getComputedStyle(document.body).getPropertyValue('--selected-marker-stroke').trim() || '#14213d';
    marker.setStyle({
        radius: 13,
        fillColor: marker.defaultStyle.fillColor,
        color: selectedStroke,
        weight: 3,
        opacity: 1,
        fillOpacity: 1
    });
    const markerElement = marker.getElement && marker.getElement();
    if (markerElement) markerElement.classList.add('selected-marker');
    marker.bringToFront();
    selectedMarker = marker;
    updateDetails(facility);
    updatePresentationDetails(facility);

    if (options.flyTo !== false && latitude && longitude) {
        map.setView([latitude, longitude], map.getZoom(), {
            animate: true,
            duration: 0.45
        });
    }

    if (options.openPopup !== false) {
        marker.openPopup();
    }

    highlightTimer = window.setTimeout(() => {
        if (selectedMarker === marker) {
            marker.setStyle(marker.defaultStyle);
            selectedMarker = null;
        }
    }, 700);
}

function updateDetails(facility) {
    detailsEl.innerHTML = formatFacilityInfo(facility);
}

function updatePresentationDetails(facility) {
    if (!presentationFacilityNameEl) return;

    presentationFacilityNameEl.textContent = facility ? facility.Title : "";
    presentationCityEl.textContent = facility ? facility.City : "";
    presentationLastUpdatedEl.textContent = facility ? facility["Last Updated"] : "";
    presentationTotalAllegationsEl.textContent = facility ? parseNumber(facility["Total Allegations"]).toLocaleString() : "";
    presentationTotalOpenedEl.textContent = facility ? parseNumber(facility["Total Cases Opened"]).toLocaleString() : "";
    presentationBatteryCasesEl.textContent = facility ? parseNumber(facility["Battery Cases"]).toLocaleString() : "";
    presentationSexualMisconductCasesEl.textContent = facility ? parseNumber(facility["Sexual Misconduct Cases"]).toLocaleString() : "";
    presentationConvictionsEl.textContent = facility ? parseNumber(facility.Convictions).toLocaleString() : "";
    presentationActiveCasesEl.textContent = facility ? parseNumber(facility["Active Cases"]).toLocaleString() : "";
}

function hideSearchResults() {
    searchResultsEl.innerHTML = "";
    searchResultsEl.classList.remove("visible");
}

function renderSearchResults(matches) {
    searchResultsEl.innerHTML = "";

    if (!matches.length) {
        searchResultsEl.classList.add("visible");
        const emptyState = document.createElement("div");
        emptyState.className = "searchResultEmpty";
        emptyState.textContent = "No facilities found";
        searchResultsEl.appendChild(emptyState);
        return;
    }

    searchResultsEl.classList.add("visible");

    const fragment = document.createDocumentFragment();
    matches.slice(0, 8).forEach((facility) => {
        const resultButton = document.createElement("button");
        resultButton.type = "button";
        resultButton.className = "searchResultItem";
        resultButton.setAttribute("role", "option");
        resultButton.dataset.facilityTitle = facility.Title;

        const titleEl = document.createElement("span");
        titleEl.className = "searchResultTitle";
        titleEl.textContent = facility.Title;

        const metaEl = document.createElement("span");
        metaEl.className = "searchResultMeta";
        metaEl.textContent = facility.City;

        resultButton.appendChild(titleEl);
        resultButton.appendChild(metaEl);
        resultButton.addEventListener("click", () => {
            selectFacility(facility, { flyTo: true, openPopup: true });
            searchInputEl.value = facility.Title;
            hideSearchResults();
        });

        fragment.appendChild(resultButton);
    });

    searchResultsEl.appendChild(fragment);
}
function filterFacilityMatches(facilities, query) {

    const search = query.trim().toLowerCase();

    if (!search) {
        return [];
    }

    return facilities.filter(facility => {

        const title = (facility.Title || "").toLowerCase();
        const city = (facility.City || "").toLowerCase();

        return (
            title.includes(search) ||
            city.includes(search)
        );

    });

}
function handleSearchInput() {
    const query = searchInputEl.value;

    if (!query.trim()) {
        hideSearchResults();
        return;
    }

    const matches = filterFacilityMatches(facilitiesData, query);
    renderSearchResults(matches);
}

function handleSearchKeydown(event) {
    if (event.key === "Escape") {
        hideSearchResults();
    }
}

searchInputEl.addEventListener("input", handleSearchInput);
searchInputEl.addEventListener("focus", handleSearchInput);
searchInputEl.addEventListener("keydown", handleSearchKeydown);
searchToolbarEl.addEventListener("click", (event) => {
    event.stopPropagation();
});

document.addEventListener("click", (event) => {
    if (!searchToolbarEl.contains(event.target)) {
        hideSearchResults();
    }
});

function showInitialMessage() {
    detailsEl.innerHTML = `
        <div class="detailsIntro">
            <p>Select a facility on the map to view details here.</p>
        </div>
    `;
}

fetch("facilities.json")
    .then((response) => {
        if (!response.ok) {
            throw new Error("Unable to load facilities.json");
        }
        return response.json();
    })
    .then((data) => {
        if (!Array.isArray(data)) {
            throw new Error("Unexpected facility data format.");
        }

        facilitiesData = data;
        updateKpis(facilitiesData);
        addFacilityMarkers(facilitiesData);
        updateFooter(facilitiesData.length);
        showInitialMessage();
    })
    .catch((error) => {
        console.error(error);
        detailsEl.innerHTML = `<p class="error">Unable to load facility data.</p>`;
        facilityFooterEl.textContent = "0";
        lastRefreshEl.textContent = "--";
    });

// Theme system: light/dark toggle, persistence, and OS preference fallback
(function() {
    const THEME_KEY = 'dhs-theme';
    const btn = document.getElementById('themeToggle');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    function applyTheme(theme) {
        document.body.classList.remove('light-theme', 'dark-theme');
        document.body.classList.add(theme + '-theme');
        // update aria-pressed for toggle
        if (btn) btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    }

    function setTheme(theme) {
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch (e) {}
        applyTheme(theme);
        // enable transitions after initial application
        window.setTimeout(() => document.body.classList.add('theme-ready'), 50);
    }

    // initialize
    let stored;
    try { stored = localStorage.getItem(THEME_KEY); } catch (e) { stored = null; }
    const initial = stored || (prefersDark ? 'dark' : 'light');
    applyTheme(initial);
    // don't animate the first paint; enable transitions shortly after
    window.setTimeout(() => document.body.classList.add('theme-ready'), 50);

    if (btn) {
        btn.addEventListener('click', () => {
            const current = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
            const next = current === 'dark' ? 'light' : 'dark';
            setTheme(next);
        });
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                btn.click();
            }
        });
    }

    // Presentation mode support
    const presentationButton = document.getElementById('presentationToggle');
    const PRESENTATION_KEY = 'dhs-presentation-mode';
    const THEME_BEFORE_PRESENTATION = 'dhs-theme-before-presentation';

    function isPresentationModeActive() {
        return document.body.classList.contains('presentation-mode');
    }

    function updatePresentationModeButton() {
        if (!presentationButton) return;
        const isActive = document.body.classList.contains('presentation-mode');
        presentationButton.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        const label = presentationButton.querySelector('.controlLabel');
        if (label) {
            label.textContent = isActive ? 'Exit Presentation Mode' : 'Presentation Mode';
        }
        presentationButton.title = isActive ? 'Exit presentation mode' : 'Presentation Mode';
    }

    function exitPresentationMode() {
        document.body.classList.remove('presentation-mode');
        updatePresentationModeButton();
        try {
            localStorage.removeItem(PRESENTATION_KEY);
        } catch (e) {}
        const previousTheme = localStorage.getItem(THEME_BEFORE_PRESENTATION);
        if (previousTheme) {
            setTheme(previousTheme);
            try {
                localStorage.removeItem(THEME_BEFORE_PRESENTATION);
            } catch (e) {}
        }
        if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
            const exitFn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
            if (exitFn) exitFn.call(document);
        }
    }

    function enterPresentationMode() {
        const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
        try {
            localStorage.setItem(THEME_BEFORE_PRESENTATION, currentTheme);
            localStorage.setItem(PRESENTATION_KEY, 'true');
        } catch (e) {}
        document.body.classList.add('presentation-mode');
        updatePresentationModeButton();
        const element = document.documentElement;
        const requestFn = element.requestFullscreen || element.webkitRequestFullscreen || element.mozRequestFullScreen || element.msRequestFullscreen;
        if (requestFn) requestFn.call(element).catch(() => {});
    }

    if (presentationButton) {
        presentationButton.addEventListener('click', () => {
            const isActive = document.body.classList.contains('presentation-mode');
            if (isActive) {
                exitPresentationMode();
            } else {
                enterPresentationMode();
            }
        });

        presentationButton.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                presentationButton.click();
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.body.classList.contains('presentation-mode')) {
            exitPresentationMode();
        }
    });

    try {
        if (localStorage.getItem(PRESENTATION_KEY) === 'true') {
            enterPresentationMode();
        }
    } catch (e) {}

    updatePresentationModeButton();

    // respond to OS-level changes if user hasn't explicitly set a preference
    if (window.matchMedia) {
        try {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                let storedPref = null;
                try { storedPref = localStorage.getItem(THEME_KEY); } catch (err) { storedPref = null; }
                if (!storedPref) {
                    setTheme(e.matches ? 'dark' : 'light');
                }
            });
        } catch (e) {
            // some browsers use addListener
            try {
                window.matchMedia('(prefers-color-scheme: dark)').addListener((e) => {
                    let storedPref = null;
                    try { storedPref = localStorage.getItem(THEME_KEY); } catch (err) { storedPref = null; }
                    if (!storedPref) {
                        setTheme(e.matches ? 'dark' : 'light');
                    }
                });
            } catch (_) {}
        }
    }
})();
