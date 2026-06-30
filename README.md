# Macro Rides — Zone Boundary + Dynamic Route Corridor Visualization Tool

Scalable backend for a Hyperlocal EV Mobility Platform built with Node.js, Express.js, and PostgreSQL. Features secure authentication, fleet management, real-time ride tracking, REST APIs, payment integration, and cloud-ready architecture for efficient last-mile EV transportation.

A web-based demo built for the Macro Rides Technical Evaluation Assignment. It visualizes a driver's live route, computes a 350m route corridor using H3 spatial indexing, highlights eligible pickup points within that corridor, and simulates real-time route progress.

**Live demo:** open `index.html` directly in a browser, or serve the folder with any static file server (see "Running locally" below).

---

## Features

- **Driver route rendering** on an interactive Leaflet map (dark basemap via CARTO tiles).
- **350m route corridor** (configurable) computed by buffering the route with Turf.js and converting the buffer into H3 hexagonal cells.
- **Zone boundary** — a static service-area polygon rendered alongside the corridor.
- **Eligible pickup points** — candidate pickup locations are tested against the corridor polygon; eligible ones are highlighted in green with live counts and a list in the sidebar.
- **Simulated live driving** — a "Simulate Drive" button animates the driver along the route, recomputing the corridor and re-evaluating pickup eligibility at each step (mimicking real-time updates).
- **Adjustable parameters** — corridor width (meters) and H3 resolution can be changed live, with instant recomputation.

---

## Tech Stack

| Concern | Library |
|---|---|
| Spatial indexing (H3 cells, corridor membership) | [h3-js](https://github.com/uber/h3-js) v4 |
| Geometry operations (line buffering, point-in-polygon, distance/length, interpolation) | [Turf.js](https://turfjs.org/) v6 |
| Map rendering | [Leaflet](https://leafletjs.com/) v1.9 |
| Basemap tiles | CARTO dark tiles (OpenStreetMap data) |
| UI | Vanilla HTML/CSS/JS (no build step required) |

No frameworks or bundlers are required — everything runs from static files and CDN-hosted libraries, so it can be opened directly or deployed to any static host (GitHub Pages, Netlify, Vercel, S3, etc.).

---

## Architecture & Approach

### 1. Route corridor via H3

The core spatial problem is: *given a polyline (the driver's route), find every region within 350m of that line, and determine which pickup points fall inside it.*

The approach:

1. The route's traveled portion is treated as a GeoJSON `LineString`.
2. `turf.buffer(line, widthMeters / 2 in km, { units: "kilometers" })` generates a true geometric buffer polygon around the line — `turf.buffer` takes a single distance value and applies it symmetrically, so passing `widthMeters / 1000` produces a buffer of that radius on each side, giving a corridor of the requested total width.
3. The resulting buffer polygon (or multipolygon, if the route folds back on itself) is converted into a set of H3 cells using `h3.polygonToCells(coordinates, resolution, true)`. This is the spatial-indexing step required by the assignment: the corridor becomes a discrete set of hexagonal cell IDs rather than just a vector shape, enabling fast set-based queries (e.g., "is this location's H3 cell within the corridor?") that scale well as the number of pickup points or corridor cells grows.
4. H3 cell boundaries (`h3.cellToBoundary`) are drawn as translucent green hexagons on the map, visually demonstrating the corridor.

### 2. Pickup point eligibility

Each candidate pickup point is tested with `turf.booleanPointInPolygon(point, bufferPolygon)` against the precise buffer geometry (not just cell membership), which avoids false positives/negatives at hexagon edges while still using H3 for the corridor's spatial representation and indexing. Eligible points are recolored, counted, and listed in the sidebar in real time.

### 3. Zone boundary

A static polygon represents Macro Rides' service zone. It's rendered independently of the corridor so the two concepts (a fixed operating zone vs. a dynamic, route-following corridor) are visually distinguishable. Zone area is computed via `turf.area` and displayed for reference.

### 4. Simulated real-time updates

Rather than requiring a live GPS feed, the demo densifies the route into ~20m-spaced points (`turf.along`) and steps the driver marker along them on a timer. At each step:

- The corridor is recomputed using only the *traveled* portion of the route (simulating a corridor that extends as the driver progresses, similar to how a real dispatch system would only need the corridor around the route already confirmed/driven).
- Pickup eligibility is re-evaluated against the updated corridor.
- The sidebar stats (position, progress %, cell count, eligible count) update live.

This satisfies the "real-time or simulated route updates and corresponding pickup point eligibility" requirement without needing a backend or live location feed.

### 5. Code structure

```
macro-rides-corridor/
├── index.html        # App shell, layout, sidebar, map container
├── css/
│   └── style.css      # Dark-themed UI styling
├── js/
│   ├── data.js         # Sample route, zone boundary, pickup points (swap with real data/API)
│   └── app.js          # Core logic: map init, H3 corridor computation, eligibility, simulation
```

The logic is intentionally decoupled:

- `data.js` is the only place sample data lives — swapping in a live GPS feed or backend API only requires replacing how `SAMPLE_ROUTE` / `PICKUP_POINTS` are populated, not touching the spatial logic.
- `computeCorridorCells()` and `evaluateEligibility()` in `app.js` are pure-ish functions that take a route + parameters and return cells/eligibility — making them straightforward to unit test or reuse in a backend (e.g., porting to Node with the same `h3-js`/`@turf/turf` packages for server-side eligibility checks at scale).
- UI state (`state` object) is centralized rather than scattered across DOM queries, simplifying the live-update loop.

### Scalability notes

- H3's hierarchical hexagonal grid means corridor cells can be computed at coarser or finer resolution depending on performance needs (exposed in the UI as a resolution selector: 8/9/10).
- For large pickup-point datasets, the same set-based approach scales well: each point's H3 cell index can be precomputed and stored, turning "is this point in the corridor" into an O(1) set lookup against `corridorCellSet`, with `turf.booleanPointInPolygon` reserved only for edge-precision confirmation rather than bulk filtering.
- All geometry/indexing logic runs client-side here for demo simplicity; in production this would move to a backend service so pickup-point eligibility could be queried by many drivers concurrently without shipping the full point dataset to each client.

---

## Running locally

No build step is required.

**Option A — open directly:**
Double-click `index.html`, or open it in a browser via `File > Open`.

**Option B — static server (recommended, avoids any local file-access restrictions):**

```bash
cd macro-rides-corridor
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Using the demo

1. Click **Load Sample Route** to render the driver's route and zone boundary.
2. Click **Simulate Drive** to animate the driver along the route — the corridor and eligible pickup points update live as the driver progresses.
3. Adjust **Corridor width** or **H3 resolution** at any time to see the corridor and eligibility recompute instantly.
4. Click markers on the map for pickup-point details and live eligibility status.

---

## Evaluation criteria mapping

| Criteria | How it's addressed |
|---|---|
| Accuracy of spatial calculations | True geometric buffering via Turf.js, with H3 cell conversion for indexing and `booleanPointInPolygon` for precise eligibility (avoids hex-edge approximation errors) |
| Quality of visualization | Distinct, legended layers for route, corridor (hex grid), zone boundary, and pickup points on a clean dark-themed Leaflet map |
| Code structure and scalability | Decoupled data/logic/UI, reusable corridor/eligibility functions, configurable resolution and width, notes on scaling to a backend |
| User experience and interface | Live stats sidebar, simulate-drive control, popups, responsive layout |
| Overall functionality | Fully working end-to-end demo: load route → corridor + zone render → simulate → live eligibility updates |
