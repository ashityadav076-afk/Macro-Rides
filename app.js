// ============================================================
// Macro Rides — Zone Boundary + Dynamic Route Corridor Visualizer
// Core logic: H3 spatial indexing, route-corridor buffering,
// pickup-point eligibility, and simulated live driving.
// ============================================================

const state = {
  map: null,
  routeLine: null,
  driverMarker: null,
  corridorLayer: null,   // L.layerGroup of H3 hex polygons
  zoneLayer: null,
  pointMarkers: {},      // id -> L.circleMarker
  corridorCellSet: new Set(),
  route: [],
  playing: false,
  playTimer: null,
  driverIndex: 0,
  pathSegments: [],      // dense interpolated path for smooth simulation
};

const els = {
  btnLoadRoute: document.getElementById("btnLoadRoute"),
  btnPlay: document.getElementById("btnPlay"),
  btnReset: document.getElementById("btnReset"),
  corridorWidth: document.getElementById("corridorWidth"),
  h3Res: document.getElementById("h3Res"),
  statPos: document.getElementById("statPos"),
  statProgress: document.getElementById("statProgress"),
  statCorridor: document.getElementById("statCorridor"),
  statCells: document.getElementById("statCells"),
  statTotalPoints: document.getElementById("statTotalPoints"),
  statEligible: document.getElementById("statEligible"),
  statZoneArea: document.getElementById("statZoneArea"),
  eligibleList: document.getElementById("eligibleList"),
};

// ---------- Map setup ----------

function initMap() {
  state.map = L.map("map", { zoomControl: true }).setView([12.9706, 77.6480], 14);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    maxZoom: 19,
  }).addTo(state.map);

  state.corridorLayer = L.layerGroup().addTo(state.map);
  state.zoneLayer = L.layerGroup().addTo(state.map);

  drawZoneBoundary();
  drawPickupPoints();
}

// ---------- Zone boundary (drawn as polygon + filled with H3 cells for reference) ----------

function drawZoneBoundary() {
  state.zoneLayer.clearLayers();

  const latlngs = ZONE_BOUNDARY.map((p) => [p[0], p[1]]);
  L.polygon(latlngs, {
    color: "#ffb454",
    weight: 2,
    fillOpacity: 0.03,
    dashArray: "6 4",
  }).addTo(state.zoneLayer);

  // Compute approximate area using turf for display purposes.
  const turfPoly = turf.polygon([ZONE_BOUNDARY.map((p) => [p[1], p[0]])]);
  const areaKm2 = turf.area(turfPoly) / 1_000_000;
  els.statZoneArea.textContent = `${areaKm2.toFixed(2)} km²`;
}

// ---------- Pickup points ----------

function drawPickupPoints() {
  PICKUP_POINTS.forEach((pt) => {
    const marker = L.circleMarker([pt.lat, pt.lng], {
      radius: 7,
      color: "#5a6072",
      weight: 2,
      fillColor: "#5a6072",
      fillOpacity: 0.9,
    })
      .addTo(state.map)
      .bindPopup(`<b>${pt.name}</b><br/>${pt.id} · status: <span id="status-${pt.id}">outside corridor</span>`);

    state.pointMarkers[pt.id] = marker;
  });
  els.statTotalPoints.textContent = PICKUP_POINTS.length;
}

function setPointEligibility(pt, eligible) {
  const marker = state.pointMarkers[pt.id];
  if (!marker) return;
  marker.setStyle({
    color: eligible ? "#00d4a0" : "#5a6072",
    fillColor: eligible ? "#00d4a0" : "#5a6072",
    radius: eligible ? 9 : 7,
  });
  const popupStatusEl = document.getElementById(`status-${pt.id}`);
  if (popupStatusEl) popupStatusEl.textContent = eligible ? "ELIGIBLE" : "outside corridor";
}

// ---------- H3-based corridor computation ----------
//
// Approach:
// 1. Densify the route into a line, then for each segment, find all H3 cells
//    whose center lies within `corridorWidthMeters` of that segment using
//    turf.pointToLineDistance, restricted via a bounding polyToCells fetch.
// 2. To keep this efficient, we use h3.polygonToCells on a buffered route
//    polygon (created with turf.buffer), which gives us exactly the corridor
//    as a set of hexagonal cells at the chosen resolution.
// 3. Pickup point eligibility = point's H3 cell (at same resolution) is a
//    member of the corridor cell set (an O(1) set lookup after the buffer
//    is computed) AND falls within the actual buffer polygon for accuracy.

function computeCorridorCells(routeLatLngs, widthMeters, resolution) {
  if (routeLatLngs.length < 2) return { cells: new Set(), bufferPolygon: null };

  // Turf expects [lng, lat]
  const lineCoords = routeLatLngs.map((p) => [p[1], p[0]]);
  const turfLine = turf.lineString(lineCoords);

  // Buffer the route line by half-width on each side -> full corridor width.
  const bufferPolygon = turf.buffer(turfLine, widthMeters / 1000, { units: "kilometers" });

  // Convert the (possibly multipolygon) buffer into H3 cells.
  const cells = new Set();
  const geom = bufferPolygon.geometry;

  const ringsToCells = (polygonCoords) => {
    // h3.polygonToCells expects [[lat, lng], ...] rings (GeoJSON mode flag controls order)
    const geoJsonPolygon = { type: "Polygon", coordinates: polygonCoords };
    const h3Cells = h3.polygonToCells(geoJsonPolygon.coordinates, resolution, true);
    h3Cells.forEach((c) => cells.add(c));
  };

  if (geom.type === "Polygon") {
    ringsToCells(geom.coordinates);
  } else if (geom.type === "MultiPolygon") {
    geom.coordinates.forEach((poly) => ringsToCells(poly));
  }

  return { cells, bufferPolygon };
}

function drawCorridor(cells) {
  state.corridorLayer.clearLayers();
  cells.forEach((cellId) => {
    const boundary = h3.cellToBoundary(cellId, true); // [[lng,lat],...] geoJson=true
    const latlngs = boundary.map((c) => [c[1], c[0]]);
    L.polygon(latlngs, {
      color: "#1fe3a1",
      weight: 1,
      fillColor: "#1fe3a1",
      fillOpacity: 0.18,
      interactive: false,
    }).addTo(state.corridorLayer);
  });
  els.statCells.textContent = cells.size;
}

// ---------- Eligibility evaluation ----------

function evaluateEligibility(bufferPolygon, resolution) {
  let eligibleCount = 0;
  const eligibleNames = [];

  PICKUP_POINTS.forEach((pt) => {
    let eligible = false;
    if (bufferPolygon) {
      const turfPt = turf.point([pt.lng, pt.lat]);
      eligible = turf.booleanPointInPolygon(turfPt, bufferPolygon);
    }
    setPointEligibility(pt, eligible);
    if (eligible) {
      eligibleCount++;
      eligibleNames.push(pt);
    }
  });

  els.statEligible.textContent = eligibleCount;

  if (eligibleNames.length === 0) {
    els.eligibleList.innerHTML = `<li class="muted">No eligible pickup points yet.</li>`;
  } else {
    els.eligibleList.innerHTML = eligibleNames
      .map((p) => `<li><span>${p.name}</span><b>${p.id}</b></li>`)
      .join("");
  }
}

// ---------- Route drawing & driver simulation ----------

function loadRoute() {
  state.route = SAMPLE_ROUTE;

  if (state.routeLine) state.map.removeLayer(state.routeLine);
  state.routeLine = L.polyline(state.route, {
    color: "#4f8cff",
    weight: 4,
    opacity: 0.9,
  }).addTo(state.map);

  state.map.fitBounds(state.routeLine.getBounds(), { padding: [40, 40] });

  // Build dense interpolated path for smooth simulation (every ~20m).
  const turfLine = turf.lineString(state.route.map((p) => [p[1], p[0]]));
  const length = turf.length(turfLine, { units: "kilometers" });
  const steps = Math.max(40, Math.round(length / 0.02));
  state.pathSegments = [];
  for (let i = 0; i <= steps; i++) {
    const along = turf.along(turfLine, (length * i) / steps, { units: "kilometers" });
    const [lng, lat] = along.geometry.coordinates;
    state.pathSegments.push([lat, lng]);
  }

  state.driverIndex = 0;
  placeDriver(state.pathSegments[0]);
  recomputeCorridorUpTo(state.pathSegments[0]);

  els.btnPlay.disabled = false;
  els.statProgress.textContent = "0%";
}

function placeDriver(latlng) {
  if (state.driverMarker) state.map.removeLayer(state.driverMarker);
  state.driverMarker = L.circleMarker(latlng, {
    radius: 8,
    className: "driver-marker",
    color: "#ff5d8f",
    weight: 2,
    fillColor: "#ff5d8f",
    fillOpacity: 1,
  }).addTo(state.map);
  els.statPos.textContent = `${latlng[0].toFixed(5)}, ${latlng[1].toFixed(5)}`;
}

// Recompute the corridor using the portion of the route already driven,
// simulating a "live route" whose corridor grows/updates as the driver moves.
function recomputeCorridorUpTo(currentLatLng) {
  const widthMeters = parseFloat(els.corridorWidth.value) || 350;
  const resolution = parseInt(els.h3Res.value, 10);

  els.statCorridor.textContent = `${widthMeters} m`;

  const traveledIndex = state.pathSegments.findIndex(
    (p) => p[0] === currentLatLng[0] && p[1] === currentLatLng[1]
  );
  const upTo = traveledIndex >= 0 ? traveledIndex : state.pathSegments.length - 1;
  const traveledPath = state.pathSegments.slice(0, upTo + 1);

  // Always show at least the first point as a tiny corridor.
  const pathForBuffer = traveledPath.length >= 2 ? traveledPath : state.pathSegments.slice(0, 2);

  const { cells, bufferPolygon } = computeCorridorCells(pathForBuffer, widthMeters, resolution);
  state.corridorCellSet = cells;
  drawCorridor(cells);
  evaluateEligibility(bufferPolygon, resolution);
}

// ---------- Simulation controls ----------

function startSimulation() {
  if (state.playing || state.pathSegments.length === 0) return;
  state.playing = true;
  els.btnPlay.textContent = "⏸ Pause";

  state.playTimer = setInterval(() => {
    state.driverIndex++;
    if (state.driverIndex >= state.pathSegments.length) {
      stopSimulation();
      return;
    }
    const pos = state.pathSegments[state.driverIndex];
    placeDriver(pos);
    recomputeCorridorUpTo(pos);

    const pct = Math.round((state.driverIndex / (state.pathSegments.length - 1)) * 100);
    els.statProgress.textContent = `${pct}%`;
  }, 350);
}

function stopSimulation() {
  state.playing = false;
  els.btnPlay.textContent = "▶ Simulate Drive";
  if (state.playTimer) clearInterval(state.playTimer);
  state.playTimer = null;
}

function resetAll() {
  stopSimulation();
  state.route = [];
  state.pathSegments = [];
  state.driverIndex = 0;

  if (state.routeLine) state.map.removeLayer(state.routeLine);
  if (state.driverMarker) state.map.removeLayer(state.driverMarker);
  state.corridorLayer.clearLayers();

  PICKUP_POINTS.forEach((pt) => setPointEligibility(pt, false));

  els.statPos.textContent = "—";
  els.statProgress.textContent = "0%";
  els.statCells.textContent = "0";
  els.statEligible.textContent = "0";
  els.eligibleList.innerHTML = `<li class="muted">Load a route to begin.</li>`;
  els.btnPlay.disabled = true;
}

// ---------- Event wiring ----------

function wireEvents() {
  els.btnLoadRoute.addEventListener("click", loadRoute);

  els.btnPlay.addEventListener("click", () => {
    if (state.playing) {
      stopSimulation();
    } else {
      startSimulation();
    }
  });

  els.btnReset.addEventListener("click", resetAll);

  els.corridorWidth.addEventListener("change", () => {
    if (state.pathSegments.length) {
      recomputeCorridorUpTo(state.pathSegments[Math.min(state.driverIndex, state.pathSegments.length - 1)]);
    }
  });

  els.h3Res.addEventListener("change", () => {
    if (state.pathSegments.length) {
      recomputeCorridorUpTo(state.pathSegments[Math.min(state.driverIndex, state.pathSegments.length - 1)]);
    }
  });
}

// ---------- Init ----------

document.addEventListener("DOMContentLoaded", () => {
  initMap();
  wireEvents();
  els.btnPlay.disabled = true;
});
