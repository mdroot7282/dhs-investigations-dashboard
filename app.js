const map = L.map("map").setView([40.1,-89.2],7);

L.tileLayer(
"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
{
attribution:"© OpenStreetMap",
maxZoom:18
}
).addTo(map);

let totalAllegations=0;
let totalOpened=0;
let totalActive=0;
let totalCharged=0;

facilities.forEach(f=>{

const marker=L.circleMarker(
[f.lat,f.lng],
{
radius:8,
color:"#003A70",
fillColor:"#FFD100",
fillOpacity:0.9,
weight:2
}
).addTo(map);

marker.bindTooltip(
`<b>${f.name}</b><br>
Allegations: ${f.allegations}`,
{
direction:"top"
}
);

marker.on("click",()=>{

document.getElementById("details").innerHTML=`
<h2>${f.name}</h2>

<p><b>Allegations:</b> ${f.allegations}</p>

<p><b>Cases Opened:</b> ${f.opened}</p>

<p><b>Active Cases:</b> ${f.active}</p>

<p><b>Cases Charged:</b> ${f.charged}</p>

<p><b>Case Type:</b> ${f.type}</p>
`;

});

totalAllegations+=Number(f.allegations||0);
totalOpened+=Number(f.opened||0);
totalActive+=Number(f.active||0);
totalCharged+=Number(f.charged||0);

});

document.getElementById("facilityCount").innerText=facilities.length;
document.getElementById("totalAllegations").innerText=totalAllegations;
document.getElementById("totalOpened").innerText=totalOpened;
document.getElementById("totalActive").innerText=totalActive;
document.getElementById("totalCharged").innerText=totalCharged;