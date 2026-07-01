const map=L.map('map').setView([40.0,-89.2],7);

L.tileLayer(
'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
{
maxZoom:18
}
).addTo(map);

facilities.forEach(f=>{

const marker=L.marker([f.lat,f.lng]).addTo(map);

marker.bindPopup(`<b>${f.name}</b>`);

marker.on("click",()=>{

document.getElementById("details").innerHTML=`

<h2>${f.name}</h2>

<p><b>Allegations:</b> ${f.allegations}</p>

<p><b>Opened:</b> ${f.opened}</p>

<p><b>Active:</b> ${f.active}</p>

<p><b>Charged:</b> ${f.charged}</p>

<p><b>Type:</b> ${f.type}</p>

`;

});

});

document.getElementById("facilityCount").innerText=facilities.length;