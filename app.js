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

const ILLINOIS_STATES_GEOJSON_URL = "https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json";
let illinoisBoundaryLayer = null;
let isIllinoisBoundaryReady = false;
let areFacilityMarkersReady = false;

map.createPane("illinoisBoundaryPane");
map.getPane("illinoisBoundaryPane").style.zIndex = 450;

function toLatLngRing(ring) {
    return ring.map(([lng, lat]) => [lat, lng]);
}

function getIllinoisFeature(statesGeoJson) {
    if (!statesGeoJson || !Array.isArray(statesGeoJson.features)) {
        return null;
    }

    return statesGeoJson.features.find((feature) => {
        const name = feature && feature.properties && feature.properties.name;
        return String(name || "").toLowerCase() === "illinois";
    }) || null;
}

function getIllinoisOuterRings(illinoisFeature) {
    if (!illinoisFeature || !illinoisFeature.geometry) {
        return [];
    }

    const { type, coordinates } = illinoisFeature.geometry;

    if (type === "Polygon" && Array.isArray(coordinates) && coordinates[0]) {
        return [coordinates[0]];
    }

    if (type === "MultiPolygon" && Array.isArray(coordinates)) {
        return coordinates
            .filter((polygon) => Array.isArray(polygon) && polygon[0])
            .map((polygon) => polygon[0]);
    }

    return [];
}

function resetMapToIllinois() {
    if (!illinoisBoundaryLayer || !isIllinoisBoundaryReady || !areFacilityMarkersReady) {
        return;
    }

    const mapContainer = map.getContainer();
    if (!mapContainer || mapContainer.offsetWidth === 0 || mapContainer.offsetHeight === 0) {
        return;
    }

    map.fitBounds(illinoisBoundaryLayer.getBounds(), {
        paddingTopLeft: [5, 5],
        paddingBottomRight: [5, 5],
        maxZoom: 7
    });
    map.invalidateSize();
}

function resetMapToIllinoisPresentation() {
    map.invalidateSize();

    const illinoisBounds = L.latLngBounds(
        [36.95, -91.55],
        [42.55, -87.45]
    );

    map.fitBounds(illinoisBounds, {
        paddingTopLeft: [2, 2],
        paddingBottomRight: [2, 2],
        maxZoom: 8,
        animate: false
    });
}

function addIllinoisVisualFocusOverlay() {
    return fetch(ILLINOIS_STATES_GEOJSON_URL)
        .then((response) => {
            if (!response.ok) {
                throw new Error("Unable to load Illinois boundary data");
            }
            return response.json();
        })
        .then((statesGeoJson) => {
            const illinoisFeature = getIllinoisFeature(statesGeoJson);
            if (!illinoisFeature) {
                throw new Error("Illinois boundary not found in GeoJSON");
            }

            const illinoisOuterRings = getIllinoisOuterRings(illinoisFeature).map(toLatLngRing);
            if (!illinoisOuterRings.length) {
                throw new Error("Illinois geometry did not include an outer ring");
            }

            // Dim everything outside Illinois while leaving Illinois at full brightness.
            L.polygon([
                [[-90, -360], [-90, 360], [90, 360], [90, -360]],
                ...illinoisOuterRings
            ], {
                pane: "overlayPane",
                stroke: false,
                fillColor: "#5f6f82",
                fillOpacity: 0.25,
                fillRule: "evenodd",
                interactive: false
            }).addTo(map);

            // Keep Illinois boundary visible at all zoom levels.
            illinoisBoundaryLayer = L.geoJSON(illinoisFeature, {
                pane: "illinoisBoundaryPane",
                interactive: false,
                style: {
                    color: "#0b2f63",
                    weight: 3,
                    opacity: 0.95,
                    fillOpacity: 0
                }
            }).addTo(map);
            isIllinoisBoundaryReady = true;

            // Delay reset to let GitHub Pages/Leaflet finish calculating map size.
            setTimeout(() => {
                map.invalidateSize();
                resetMapToIllinois();
            }, 300);
        })
        .catch((error) => {
            console.warn(error);
        });
}

addIllinoisVisualFocusOverlay();

const bounds = L.latLngBounds();
const detailsEl = document.getElementById("details");
const presentationFacilityNameEl = document.getElementById("presentationFacilityName");
const presentationCityEl = document.getElementById("presentationCity");
const presentationLastUpdatedEl = document.getElementById("presentationLastUpdated");
const presentationTotalOpenedEl = document.getElementById("presentationTotalOpened");
const presentationBatteryCasesEl = document.getElementById("presentationBatteryCases");
const presentationSexualMisconductCasesEl = document.getElementById("presentationSexualMisconductCases");
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
        if (document.body.classList.contains("presentation-mode")) {
            resetMapToIllinoisPresentation();
            return;
        }

        resetMapToIllinois();
    });
}

const kpiElements = {
    totalOpened: document.getElementById("totalOpened"),
    batteryCases: document.getElementById("batteryCases"),
    sexualMisconductCases: document.getElementById("sexualMisconductCases"),
    activeCases: document.getElementById("activeCases")
};

function parseNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function parseCameraCsv(csvText) {
    const cameraLookup = {};
    if (!csvText) {
        return cameraLookup;
    }

    const lines = csvText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (lines.length <= 1) {
        return cameraLookup;
    }

    for (let i = 1; i < lines.length; i += 1) {
        const rawLine = lines[i];
        const cols = rawLine.split(",");
        if (cols.length < 2) {
            continue;
        }

        const title = cols[0].trim();
        const camera = cols.slice(1).join(",").trim();
        if (!title) {
            continue;
        }

        cameraLookup[title] = camera;
    }

    return cameraLookup;
}

function getCameraState(cameraValue) {
    const normalized = String(cameraValue || "").trim().toLowerCase();
    if (normalized === "yes") {
        return "yes";
    }
    if (normalized === "no") {
        return "no";
    }
    return "unknown";
}

function getCameraIconHtml(cameraValue) {
    const state = getCameraState(cameraValue);
    if (state === "yes") {
        return '<i class="fa-solid fa-video facilityCameraIcon" aria-hidden="true"></i>';
    }
    if (state === "no") {
        return '<i class="fa-solid fa-video-slash facilityCameraIcon" aria-hidden="true"></i>';
    }
    return "";
}

function getOpenedCaseBucket(totalOpened) {
    if (totalOpened <= 10) {
        return 0;
    }
    if (totalOpened <= 20) {
        return 1;
    }
    if (totalOpened <= 30) {
        return 2;
    }
    return 3;
}

function getMarkerColor(totalOpened) {
    const bucket = getOpenedCaseBucket(totalOpened);
    if (bucket === 0) {
        return CONFIG.colors.green;
    }
    if (bucket === 1) {
        return CONFIG.colors.yellow;
    }
    if (bucket === 2) {
        return CONFIG.colors.orange;
    }
    return CONFIG.colors.red;
}

function getMarkerRadius(totalOpened) {
    const bucket = getOpenedCaseBucket(totalOpened);
    return [12, 14, 16, 18][bucket];
}

function getMarkerLabelClass(totalOpened) {
    const bucket = getOpenedCaseBucket(totalOpened);
    return `markerValue markerValue${bucket}`;
}

function getMarkerTooltipHtml(activeCases, cameraValue) {
    const cameraState = getCameraState(cameraValue);
    let cameraIconClass = "fa-video-slash";

    if (cameraState === "yes") {
        cameraIconClass = "fa-video";
    }

    return `
        <span class="markerCameraWrap" aria-hidden="true">
            <i class="fa-solid ${cameraIconClass} markerCameraIcon"></i>
        </span>
        <span class="markerNumber">${activeCases}</span>
    `;
}

function getFacilityStats(facility) {
    return [
        { label: "Active Cases", value: facility["Active Cases"] },
        { label: "Total Cases Opened", value: facility["Total Cases Opened"] },
        { label: "Battery Cases", value: facility["Battery Cases"] },
        { label: "Sexual Misconduct Cases", value: facility["Sexual Misconduct Cases"] },
        { label: "Last Updated", value: formatDateOnly(facility["Last Updated"]) }
    ];
}

function getPopupCameraMeta(cameraValue) {
    const cameraState = getCameraState(cameraValue);
    if (cameraState === "yes") {
        return {
            iconClass: "fa-video",
            statusText: "Present"
        };
    }

    return {
        iconClass: "fa-video-slash",
        statusText: "Not Present"
    };
}

function formatDateOnly(value) {
    if (value === undefined || value === null || value === "") {
        return "--";
    }

    const textValue = String(value).trim();
    const datePart = textValue.split("T")[0].trim();
    return datePart || "--";
}

function getFacilityPanelStats(facility) {
    return [
        { label: "City", value: facility.City },
        { label: "Investigation Statistics", value: "", section: true },
        { label: "Active Cases", value: facility["Active Cases"], colorClass: "metricActive" },
        { label: "Total Cases Opened", value: facility["Total Cases Opened"], colorClass: "metricOpened" },
        { label: "Battery Cases", value: facility["Battery Cases"], colorClass: "metricBattery" },
        { label: "Sexual Misconduct Cases", value: facility["Sexual Misconduct Cases"], colorClass: "metricSexual" },
        { label: "Last Updated", value: formatDateOnly(facility["Last Updated"]), muted: true }
    ];
}

function formatFacilityInfo(facility) {
    const statisticsHtml = getFacilityPanelStats(facility)
        .map((stat) => {
            if (stat.section) {
                return `<div class="detailsRow detailsRowSection"><span>${stat.label}</span></div>`;
            }

            const rowClasses = ["detailsRow", "detailsRowMetric"];
            if (stat.colorClass) {
                rowClasses.push(stat.colorClass);
            }
            if (stat.muted) {
                rowClasses.push("detailsRowMuted");
            }
            return `<div class="${rowClasses.join(" ")}"><span class="detailsLabel">${stat.label}</span><span>${stat.value}</span></div>`;
        })
        .join("");

    const cameraIconHtml = getCameraIconHtml(facility.Camera);
    return `
        <div class="detailsRow detailsRowName"><span class="facilityTitleWithCamera">${facility.Title}${cameraIconHtml}</span></div>
        ${statisticsHtml}
    `;
}

function getPopupHtml(facility) {
    const cameraMeta = getPopupCameraMeta(facility.Camera);
    const statisticsHtml = getFacilityStats(facility)
        .map((stat) => {
            return `<div><strong>${stat.label}:</strong> ${stat.value}</div>`;
        })
        .join("");

    return `
        <div class="popupTitle">${facility.Title}</div>
        <div class="popupCameraStatus"><strong><i class="fa-solid ${cameraMeta.iconClass}" aria-hidden="true"></i> Surveillance Cameras:</strong> ${cameraMeta.statusText}</div>
        ${statisticsHtml}
    `;
}

let facilitiesData = [];
let selectedMarker = null;
let selectedFacility = null;
const facilityMarkers = new Map();

function updateKpis(facilities) {
    const totals = facilities.reduce((acc, facility) => {
        acc.totalOpened += parseNumber(facility["Total Cases Opened"]);
        acc.batteryCases += parseNumber(facility["Battery Cases"]);
        acc.sexualMisconductCases += parseNumber(facility["Sexual Misconduct Cases"]);
        acc.activeCases += parseNumber(facility["Active Cases"]);
        return acc;
    }, {
        totalOpened: 0,
        batteryCases: 0,
        sexualMisconductCases: 0,
        activeCases: 0
    });

    kpiElements.totalOpened.textContent = totals.totalOpened.toLocaleString();
    kpiElements.batteryCases.textContent = totals.batteryCases.toLocaleString();
    kpiElements.sexualMisconductCases.textContent = totals.sexualMisconductCases.toLocaleString();
    kpiElements.activeCases.textContent = totals.activeCases.toLocaleString();
}

function updateFooter(facilityCount) {
    facilityFooterEl.textContent = facilityCount.toLocaleString();
    lastRefreshEl.textContent = new Date().toLocaleString();
}

function updateFacilityCount(facilityCount) {
    facilityFooterEl.textContent = facilityCount.toLocaleString();
}

function getPopupPanOptions() {
    if (document.body.classList.contains("presentation-mode")) {
        return {
            autoPan: true,
            keepInView: true,
            autoPanPaddingTopLeft: [40, 80],
            autoPanPaddingBottomRight: [40, 220]
        };
    }

    return {
        autoPan: true,
        keepInView: true,
        autoPanPaddingTopLeft: [20, 140],
        autoPanPaddingBottomRight: [20, 20]
    };
}

function panPopupUpIfNeeded(marker) {
    if (!document.body.classList.contains("presentation-mode")) {
        return;
    }

    const popup = marker.getPopup();
    if (!popup) {
        return;
    }

    window.requestAnimationFrame(() => {
        const popupElement = popup.getElement();
        const mapElement = map.getContainer();
        if (!popupElement || !mapElement) {
            return;
        }

        const popupRect = popupElement.getBoundingClientRect();
        const mapRect = mapElement.getBoundingClientRect();
        const safeBottom = mapRect.bottom - 12;
        const overflow = popupRect.bottom - safeBottom;

        if (overflow > 0) {
            map.panBy([0, -(overflow + 24)], {
                animate: true,
                duration: 0.35
            });
        }
    });
}

function addFacilityMarkers(facilities) {
    facilities.forEach((facility) => {
        const latitude = parseNumber(facility.Latitude);
        const longitude = parseNumber(facility.Longitude);
        const totalOpened = parseNumber(facility["Total Cases Opened"]);
        const activeCases = parseNumber(facility["Active Cases"]);

        if (!latitude || !longitude) {
            return;
        }

        const color = getMarkerColor(totalOpened);
        const radius = getMarkerRadius(totalOpened);
        const defaultStyle = {
            radius,
            fillColor: color,
            color: "#333",
            weight: 1,
            opacity: 1,
            fillOpacity: 0.85
        };
        const marker = L.circleMarker([latitude, longitude], defaultStyle).addTo(map);

        marker.defaultStyle = defaultStyle;

        marker.bindPopup(getPopupHtml(facility), {
            minWidth: 260,
            maxWidth: 380,
            ...getPopupPanOptions()
        });

        marker.bindTooltip(getMarkerTooltipHtml(activeCases, facility.Camera), {
            permanent: true,
            direction: "center",
            className: getMarkerLabelClass(totalOpened),
            opacity: 1,
            interactive: false
        });

        marker.on("click", () => {
            selectFacility(facility, { flyTo: true, openPopup: true });
        });

        facilityMarkers.set(facility.Title, marker);
        bounds.extend([latitude, longitude]);
    });

    areFacilityMarkersReady = true;
}

function resetSelectedMarker() {
    facilityMarkers.forEach((marker) => {
        const markerElement = marker.getElement && marker.getElement();
        if (markerElement) {
            markerElement.classList.remove('selected-marker');
        }
        if (marker.defaultStyle) {
            marker.setStyle(marker.defaultStyle);
        }
    });

    selectedMarker = null;
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
        radius: marker.defaultStyle.radius + 2,
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
        const popup = marker.getPopup();
        if (popup) {
            marker.setPopupContent(getPopupHtml(facility));
            Object.assign(popup.options, getPopupPanOptions());
        }

        if (document.body.classList.contains("presentation-mode")) {
            map.once("popupopen", () => {
                panPopupUpIfNeeded(marker);
            });
        }

        marker.openPopup();
    }
}

function updateDetails(facility) {
    detailsEl.classList.add("detailsV4");
    detailsEl.innerHTML = formatFacilityInfo(facility);
}

function updatePresentationDetails(facility) {
      if (!presentationFacilityNameEl) return;
    if (!facility) {
        presentationFacilityNameEl.innerHTML = "";
    presentationCityEl.textContent = "";
    presentationTotalOpenedEl.textContent = "";
    presentationBatteryCasesEl.textContent = "";
    presentationSexualMisconductCasesEl.textContent = "";
    presentationActiveCasesEl.textContent = "";
    presentationLastUpdatedEl.textContent = "";
    return;
}


    presentationFacilityNameEl.innerHTML = facility ? `${facility.Title}${getCameraIconHtml(facility.Camera)}` : "";
    presentationCityEl.textContent = facility ? facility.City : "";
    presentationActiveCasesEl.textContent = facility ? parseNumber(facility["Active Cases"]).toLocaleString() : "";
    presentationTotalOpenedEl.textContent = facility ? parseNumber(facility["Total Cases Opened"]).toLocaleString() : "";
    presentationBatteryCasesEl.textContent = facility ? parseNumber(facility["Battery Cases"]).toLocaleString() : "";
    presentationSexualMisconductCasesEl.textContent = facility ? parseNumber(facility["Sexual Misconduct Cases"]).toLocaleString() : "";
    presentationLastUpdatedEl.textContent = facility ? formatDateOnly(facility["Last Updated"]) : "";
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

        return fetch("camera.csv")
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Unable to load camera.csv");
                }
                return response.text();
            })
            .then((csvText) => {
                const cameraLookup = parseCameraCsv(csvText);
                facilitiesData = facilitiesData.map((facility) => ({
                    ...facility,
                    Camera: cameraLookup[facility.Title] || "Unknown"
                }));
            })
            .catch((error) => {
                console.warn(error);
                facilitiesData = facilitiesData.map((facility) => ({
                    ...facility,
                    Camera: "Unknown"
                }));
            });
    })
    .then(() => {
        updateKpis(facilitiesData);
        addFacilityMarkers(facilitiesData);
        updateFooter(facilitiesData.length);
        showInitialMessage();

        // Delay reset to ensure container size is finalized on initial load.
        setTimeout(() => {
            map.invalidateSize();
            resetMapToIllinois();
        }, 300);
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
    let themeBeforePresentation = null;

    // Always start in normal dashboard mode and clear any stale persisted presentation state.
    document.body.classList.remove('presentation-mode');
    try {
        localStorage.removeItem(PRESENTATION_KEY);
        localStorage.removeItem(THEME_BEFORE_PRESENTATION);
    } catch (e) {}

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
        const previousTheme = themeBeforePresentation;
        if (previousTheme) {
            setTheme(previousTheme);
            themeBeforePresentation = null;
        }
        if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
            const exitFn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
            if (exitFn) exitFn.call(document);
        }

        setTimeout(() => {
            map.invalidateSize();
            resetMapToIllinois();
        }, 300);
    }

    function enterPresentationMode() {
        const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
        themeBeforePresentation = currentTheme;
        document.body.classList.add('presentation-mode');
        updatePresentationModeButton();
        const element = document.documentElement;
        const requestFn = element.requestFullscreen || element.webkitRequestFullscreen || element.mozRequestFullScreen || element.msRequestFullscreen;
        if (requestFn) requestFn.call(element).catch(() => {});

        setTimeout(() => {
            resetMapToIllinoisPresentation();
        }, 500);

        setTimeout(() => {
            resetMapToIllinoisPresentation();
        }, 1000);
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
