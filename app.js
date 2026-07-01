// Initialize map
const map = L.map("map", {
    minZoom: CONFIG.map.minZoom,
    maxZoom: CONFIG.map.maxZoom
}).setView(CONFIG.map.center, CONFIG.map.zoom);

// Base map
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

// Load facility data
fetch("facilities.json")
    .then(response => {
        if (!response.ok) {
            throw new Error("Unable to load facilities.json");
        }
        return response.json();
    })
    .then(facilities => {

        const bounds = L.latLngBounds();

        let allegations = 0;
        let opened = 0;
        let active = 0;
        let charged = 0;

        facilities.forEach(facility => {

            allegations += Number(facility.allegations || 0);
            opened += Number(facility.opened || 0);
            active += Number(facility.active || 0);
            charged += Number(facility.charged || 0);

            const marker = L.marker([facility.lat, facility.lng]).addTo(map);

            marker.bindPopup(`
                <strong>${facility.name}</strong><br>
                ${facility.city}
            `);

            marker.on("click", () => {

                document.getElementById("details").innerHTML = `
                    <h2>${facility.name}</h2>

                    <p><strong>Address:</strong> ${facility.address}</p>

                    <p><strong>City:</strong> ${facility.city}</p>

                    <hr>

                    <p><strong>Allegations:</strong> ${facility.allegations}</p>

                    <p><strong>Cases Opened:</strong> ${facility.opened}</p>

                    <p><strong>Active Cases:</strong> ${facility.active}</p>

                    <p><strong>Cases Charged:</strong> ${facility.charged}</p>

                    <p><strong>Case Type:</strong> ${facility.caseType || "N/A"}</p>

                    <p><strong>Notes:</strong> ${facility.notes || "None"}</p>

                    <p><strong>Updated:</strong> ${facility.updated || "N/A"}</p>
                `;
            });

            bounds.extend([facility.lat, facility.lng]);

        });

        map.fitBounds(bounds, {
            padding: [40, 40]
        });

        document.getElementById("facilityCount").textContent = facilities.length;
        document.getElementById("totalAllegations").textContent = allegations;
        document.getElementById("totalOpened").textContent = opened;
        document.getElementById("totalActive").textContent = active;
        document.getElementById("totalCharged").textContent = charged;

        document.getElementById("facilityFooter").textContent = facilities.length;
        document.getElementById("lastRefresh").textContent =
            new Date().toLocaleDateString();

    })
    .catch(error => {
        console.error(error);
        alert("Unable to load facility data.");
    });