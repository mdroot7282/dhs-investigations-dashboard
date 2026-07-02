// =====================================================
// DII DHS Investigative Statistics Dashboard
// Version 2.0
// =====================================================

const map = L.map("map", {
    minZoom: CONFIG.map.minZoom,
    maxZoom: CONFIG.map.maxZoom
}).setView(CONFIG.map.center, CONFIG.map.zoom);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap Contributors"
}).addTo(map);

const bounds = L.latLngBounds();
const detailsEl = document.getElementById("details");
const lastRefreshEl = document.getElementById("lastRefresh");
const facilityFooterEl = document.getElementById("facilityFooter");
const searchInputEl = document.getElementById("facilitySearchInput");
const searchResultsEl = document.getElementById("facilitySearchResults");
const searchToolbarEl = document.getElementById("mapToolbar");
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
            minWidth: 240,
            maxWidth: 320
        });

        marker.on("click", () => {
            selectFacility(facility, { flyTo: false, openPopup: true });
        });

        facilityMarkers.set(facility.Title, marker);
        bounds.extend([latitude, longitude]);
    });

    if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40] });
    }
}

function resetSelectedMarker() {
    if (highlightTimer) {
        window.clearTimeout(highlightTimer);
        highlightTimer = null;
    }

    if (selectedMarker) {
        selectedMarker.setStyle(selectedMarker.defaultStyle);
        selectedMarker = null;
    }
}

function selectFacility(facility, options = {}) {
    const marker = facilityMarkers.get(facility.Title);

    if (!marker) {
        return;
    }

    resetSelectedMarker();

    const latitude = parseNumber(facility.Latitude);
    const longitude = parseNumber(facility.Longitude);

    marker.setStyle({
        radius: 13,
        fillColor: marker.defaultStyle.fillColor,
        color: "#14213d",
        weight: 3,
        opacity: 1,
        fillOpacity: 1
    });
    marker.bringToFront();
    selectedMarker = marker;
    updateDetails(facility);

    if (options.flyTo !== false && latitude && longitude) {
        map.flyTo([latitude, longitude], 11, { duration: 1.2 });
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
