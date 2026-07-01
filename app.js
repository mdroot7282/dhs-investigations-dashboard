// Initialize the map
const map = L.map("map", {
    minZoom: CONFIG.map.minZoom,
    maxZoom: CONFIG.map.maxZoom
}).setView(CONFIG.map.center, CONFIG.map.zoom);

// Add OpenStreetMap tiles
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

// Load facility data
fetch("facilities.json")
    .then(response => response.json())
    .then(facilities => {

        const bounds = L.latLngBounds();

        let totalAllegations = 0;
        let totalOpened = 0;
        let totalActive = 0;
        let totalCharged = 0;

        facilities.forEach(facility => {

            totalAllegations += Number(facility.allegations || 0);
            totalOpened += Number(facility.opened || 0);
            totalActive += Number(facility.active || 0);
            totalCharged += Number(facility.charged || 0);

            const marker = L.marker([facility.lat, facility.lng]).addTo(map);

            marker.bindPopup(`
                <strong>${facility.name}</strong><br>
                ${facility.city}<br><br>

                <b>Allegations:</b> ${facility.allegations}<br>
                <b>Cases Opened:</b> ${facility.opened}<br>
                <b>Active Cases:</b> ${facility.active}<br>
                <b>Cases Charged:</b> ${facility.charged}<br>
                <b>Case Type:</b> ${facility.caseType || "N/A"}<br>
                <b>Notes:</b> ${facility.notes || "None"}<br>
                <b>Updated:</b> ${facility.updated || "N/A"}
            `);

            marker.on("click", () => {

                document.getElementById("details").innerHTML = `
                    <h3>${facility.name}</h3>

                    <p><strong>City:</strong> ${facility.city}</p>

                    <p><strong>Allegations:</strong> ${facility.allegations}</p>

                    <p><strong>Cases Opened:</strong> ${facility.opened}</p>

                    <p><strong>Active Cases:</strong> ${facility.active}</p>

                    <p><strong>Cases Charged:</strong> ${facility.charged}</p>

                    <p><strong>Case Type:</strong> ${facility.caseType || "N/A"}</p>

                    <p><strong>Notes:</strong> ${facility.notes || "None"}</p>

                    <p><strong>Last Updated:</strong> ${facility.updated || "N/A"}</p>
                `;
            });

            bounds.extend([facility.lat, facility.lng]);

        });

        map.fitBounds(bounds, {
            padding: [40, 40]
        });

        document.getElementById("facilityCount").textContent = facilities.length;
        document.getElementById("totalAllegations").textContent = totalAllegations;
        document.getElementById("totalOpened").textContent = totalOpened;
        document.getElementById("totalActive").textContent = totalActive;
        document.getElementById("totalCharged").textContent = totalCharged;

        document.getElementById("facilityFooter").textContent = facilities.length;
        document.getElementById("lastRefresh").textContent =
            new Date().toLocaleDateString();

    })
    .catch(error => {
        console.error("Error loading facilities:", error);
    });