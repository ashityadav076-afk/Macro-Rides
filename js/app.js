/**
 * app.js — wires data.js / geo.js / corridor.js (Corridor) together with
 * Leaflet rendering and the control panel UI. No H3 math lives here; it all
 * goes through window.Corridor (js/corridor.js).
 */

(function () {
  // ---------- State ----------
  let res = 9;
  let densified = densifyRoute(ROUTE_WAYPOINTS, 60);
  let pickups = generateMockPickups(45, 42);
  let corridorCells = new Set();
  let zoneCellSets = {}; // zoneId -> Set
  let currentIndex = 0; // index into `densified` the simulated driver has reached
  let playing = false;
  let timer = null;

  // ---------- DOM ----------
  const el = (id) => document.getElementById(id);
  const playBtn = el("playBtn");
  const resetBtn = el("resetBtn");
  const speedSlider = el("speedSlider");
  const progressSlider = el("progressSlider");
  const resolutionSelect = el("resolutionSelect");
  const toggleZones = el("toggleZones");
  const toggleCorridor = el("toggleCorridor");
  const togglePickups = el("togglePickups");
  const toggleHexGrid = el("toggleHexGrid");
  const statCorridorCells = el("statCorridorCells");
  const statEligible = el("statEligible");
  const statTotal = el("statTotal");
  const statK = el("statK");
  const statusDot = el("statusDot");
  const statusText = el("statusText");

  // ---------- Map ----------
  const map = L.map("map", { zoomControl: true, attributionControl: true }).setView(
    [28.585, 77.21],
    12
  );

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }
  ).addTo(map);

  const corridorLayer = L.layerGroup().addTo(map);
  const zonesLayer = L.layerGroup().addTo(map);
  const pickupsLayer = L.layerGroup().addTo(map);
  const hexGridLayer = L.layerGroup(); // off by default
  const routeLayer = L.layerGroup().addTo(map);

  // Full planned route (faint) + traveled-so-far route (solid) + driver marker.
  const fullRoutePolyline = L.polyline(
    ROUTE_WAYPOINTS.map((p) => [p.lat, p.lng]),
    { color: "#ff8a3d", weight: 2, opacity: 0.35, dashArray: "4 6" }
  ).addTo(routeLayer);

  const traveledPolyline = L.polyline([], {
    color: "#ff8a3d",
    weight: 4,
    opacity: 0.95,
  }).addTo(routeLayer);

  const driverIcon = L.divIcon({
    className: "driver-marker",
    html: '<div class="driver-marker__dot"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
  const driverMarker = L.marker(
    [densified[0].lat, densified[0].lng],
    { icon: driverIcon }
  ).addTo(routeLayer);

  // ---------- Corridor / zones / pickups rendering ----------

  function renderCorridor() {
    corridorLayer.clearLayers();
    if (corridorCells.size === 0) return;
    const loops = Corridor.cellsToLatLngLoops(corridorCells);
    const multi = loops.map((loop) => [loop]); // force "multipolygon" interpretation, no holes
    L.polygon(multi, {
      className: "corridor-fill",
      color: "#39d98a",
      weight: 1,
      opacity: 0.55,
      fillColor: "#39d98a",
      fillOpacity: 0.18,
    }).addTo(corridorLayer);
  }

  function renderZones() {
    zonesLayer.clearLayers();
    for (const zone of SERVICE_ZONES) {
      const cells = zoneCellSets[zone.id];
      if (!cells) continue;
      const loops = Corridor.cellsToLatLngLoops(cells);
      const multi = loops.map((loop) => [loop]);
      L.polygon(multi, {
        color: zone.color,
        weight: 2,
        opacity: 0.8,
        dashArray: "6 6",
        fill: false,
      })
        .bindPopup(`<strong>${zone.name}</strong>`)
        .addTo(zonesLayer);
    }
  }

  function pickupPopup(p) {
    const distToRoute = distanceToPolyline(p.lat, p.lng, ROUTE_WAYPOINTS);
    return (
      `<div class="pickup-popup">` +
      `<strong>Pickup ${p.id}</strong><br/>` +
      `H3 eligibility: <span class="${p.eligible ? "ok" : "no"}">${
        p.eligible ? "Eligible" : "Outside corridor"
      }</span><br/>` +
      `Exact distance to route: ${distToRoute.toFixed(0)} m` +
      `</div>`
    );
  }

  let pickupMarkers = {};
  function renderPickups() {
    pickupsLayer.clearLayers();
    pickupMarkers = {};
    for (const p of pickups) {
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 6,
        weight: 1.5,
        color: p.eligible ? "#39d98a" : "#7b8794",
        fillColor: p.eligible ? "#39d98a" : "#5b6675",
        fillOpacity: 0.85,
      }).bindPopup(pickupPopup(p));
      marker.addTo(pickupsLayer);
      pickupMarkers[p.id] = marker;
    }
  }

  function renderHexGrid() {
    hexGridLayer.clearLayers();
    if (!toggleHexGrid.checked) return;
    const b = map.getBounds();
    const bounds = {
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    };
    let cells;
    try {
      cells = Corridor.cellsInBounds(bounds, res);
    } catch (e) {
      cells = [];
    }
    // Safety cap so a zoomed-out view at res 10 doesn't choke the browser.
    const capped = cells.slice(0, 4000);
    for (const cell of capped) {
      const boundary = Corridor.cellBoundary(cell);
      L.polygon(boundary, {
        color: "#3a4a5c",
        weight: 1,
        opacity: 0.5,
        fill: false,
      }).addTo(hexGridLayer);
    }
  }

  // ---------- Compute ----------

  function recomputeZoneCells() {
    zoneCellSets = {};
    for (const zone of SERVICE_ZONES) {
      zoneCellSets[zone.id] = Corridor.zoneToCells(zone.polygon, res);
    }
  }

  function recomputeCorridor() {
    const routeSoFar = densified.slice(0, currentIndex + 1);
    corridorCells = Corridor.buildCorridor(routeSoFar, res);
  }

  function recomputeEligibility() {
    for (const p of pickups) {
      p.eligible = Corridor.isPointInCells(p.lat, p.lng, res, corridorCells);
    }
  }

  function updateStats() {
    const eligibleCount = pickups.filter((p) => p.eligible).length;
    const { k } = Corridor.kForBuffer(res);
    statCorridorCells.textContent = corridorCells.size.toLocaleString();
    statEligible.textContent = eligibleCount;
    statTotal.textContent = pickups.length;
    statK.textContent = k;
  }

  function updateRouteVisuals() {
    const traveled = densified.slice(0, currentIndex + 1).map((p) => [p.lat, p.lng]);
    traveledPolyline.setLatLngs(traveled);
    const current = densified[currentIndex];
    driverMarker.setLatLng([current.lat, current.lng]);
  }

  function fullRedraw() {
    recomputeCorridor();
    recomputeEligibility();
    renderCorridor();
    renderPickups();
    renderZones();
    renderHexGrid();
    updateStats();
    updateRouteVisuals();
  }

  // ---------- Simulation control ----------

  function setStatus(state) {
    statusDot.className = "dot dot--" + state;
    statusText.textContent =
      state === "driving" ? "Driving" : state === "done" ? "Complete" : "Idle";
  }

  function stepsPerTick() {
    const speed = Number(speedSlider.value); // 1-5
    return speed; // densified points per tick
  }

  function tick() {
    currentIndex = Math.min(currentIndex + stepsPerTick(), densified.length - 1);
    progressSlider.value = String(
      Math.round((currentIndex / (densified.length - 1)) * 100)
    );
    fullRedraw();
    if (currentIndex >= densified.length - 1) {
      pause();
      setStatus("done");
    }
  }

  function play() {
    if (playing) return;
    if (currentIndex >= densified.length - 1) currentIndex = 0;
    playing = true;
    playBtn.textContent = "⏸ Pause";
    setStatus("driving");
    timer = setInterval(tick, 450);
  }

  function pause() {
    playing = false;
    playBtn.textContent = "▶ Play";
    if (timer) clearInterval(timer);
    timer = null;
    if (statusText.textContent === "Driving") setStatus("idle");
  }

  function reset() {
    pause();
    currentIndex = 0;
    progressSlider.value = "0";
    setStatus("idle");
    fullRedraw();
    map.setView([28.585, 77.21], 12);
  }

  // ---------- Events ----------

  playBtn.addEventListener("click", () => {
    if (playing) pause();
    else play();
  });

  resetBtn.addEventListener("click", reset);

  progressSlider.addEventListener("input", () => {
    pause();
    setStatus("idle");
    const pct = Number(progressSlider.value) / 100;
    currentIndex = Math.round(pct * (densified.length - 1));
    fullRedraw();
  });

  resolutionSelect.addEventListener("change", () => {
    res = Number(resolutionSelect.value);
    recomputeZoneCells();
    fullRedraw();
  });

  toggleZones.addEventListener("change", () => {
    if (toggleZones.checked) map.addLayer(zonesLayer);
    else map.removeLayer(zonesLayer);
  });
  toggleCorridor.addEventListener("change", () => {
    if (toggleCorridor.checked) map.addLayer(corridorLayer);
    else map.removeLayer(corridorLayer);
  });
  togglePickups.addEventListener("change", () => {
    if (togglePickups.checked) map.addLayer(pickupsLayer);
    else map.removeLayer(pickupsLayer);
  });
  toggleHexGrid.addEventListener("change", () => {
    if (toggleHexGrid.checked) {
      map.addLayer(hexGridLayer);
      renderHexGrid();
    } else {
      map.removeLayer(hexGridLayer);
    }
  });
  map.on("moveend zoomend", () => {
    if (toggleHexGrid.checked) renderHexGrid();
  });

  map.on("click", (e) => {
    const { lat, lng } = e.latlng;
    const eligible = Corridor.isPointInCells(lat, lng, res, corridorCells);
    const p = { id: "click-" + Date.now(), lat, lng, eligible };
    pickups.push(p);
    const marker = L.circleMarker([lat, lng], {
      radius: 7,
      weight: 2,
      color: eligible ? "#39d98a" : "#7b8794",
      fillColor: eligible ? "#39d98a" : "#5b6675",
      fillOpacity: 0.9,
    })
      .bindPopup(pickupPopup(p))
      .addTo(pickupsLayer)
      .openPopup();
    pickupMarkers[p.id] = marker;
    updateStats();
  });

  // ---------- Init ----------
  recomputeZoneCells();
  fullRedraw();
  setStatus("idle");
})();
