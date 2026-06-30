# Macro Rides — Zone Boundary & Dynamic Route Corridor Visualization

A working web demo built for the Macro Rides technical evaluation. It draws a **350m buffer corridor** around a driver's route, indexes it with **H3**, highlights **eligible pickup points** that fall inside that corridor, renders fixed **service zone boundaries**, and **simulates a live drive** so the corridor and pickup eligibility update in real time as the driver advances.

> Per the assignment's note, the route is a **simulated/hardcoded driver path through Delhi NCR** (Connaught Place → India Gate → Khan Market → Safdarjung → AIIMS → Hauz Khas → Saket) rather than a live telemetry stream — the focus is on the H3 buffer-corridor logic, the zone logic, and the visualization, not on real-time data transport.

## Live demo

Open `index.html` directly in a browser (double-click it, or `npx serve .` from this folder), or visit the GitHub Pages deployment once published — see [Deployment](#deployment) below. No build step, no API keys, no backend.

## What it shows

| Requirement | Where |
|---|---|
| Driver's route | Solid orange polyline, drawn from a hardcoded `ROUTE_WAYPOINTS` array |
| 350m route corridor/buffer | Green H3-cell fill, computed live with `h3.gridDisk` |
| Zone boundaries | Two dashed outlines (Central Delhi / South Delhi), computed with `h3.polygonToCells` |
| Eligible pickup points | Green circle markers (inside corridor) vs. grey (outside), 45 mock points |
| Real-time / simulated updates | "Simulate Drive" animates the driver along the route; the corridor grows cell-by-cell and pickup eligibility is re-evaluated on every tick |

Additional touches:
- **Click anywhere on the map** to drop a new pickup point and see its eligibility resolved instantly (an O(1) H3 set lookup against the current corridor).
- A **resolution selector** (H3 res 8 / 9 / 10) lets you trade off corridor precision vs. performance live.
- A **live stats panel** (corridor cell count, eligible/total pickups, grid-disk radius `k`) and a **debug hex-grid overlay** to visually inspect the underlying H3 cells.
- Every pickup point's popup shows its exact computed distance to the route (independent haversine/point-to-segment calculation), alongside the H3-based eligibility result, so the two can be cross-checked for accuracy.

## Approach & architecture

### Why H3 for the corridor, and how the buffer is built

The corridor is built as a **union of H3 grid disks** centered on densely-sampled points along the route:

1. **Densify the route.** The hardcoded waypoints are interpolated (`densifyRoute`, `js/geo.js`) so consecutive sample points are no more than ~60m apart. This avoids gaps in the corridor on long straight segments — sampling only the original waypoints would leave the buffer too narrow between them.
2. **Pick a grid-disk radius `k`.** For the selected H3 resolution, `h3.getHexagonEdgeLengthAvg(res, 'm')` gives the average cell edge length. `k = ceil(350 / edgeLength)` is the smallest ring radius that's guaranteed to cover the 350m buffer (`js/corridor.js → kForBuffer`).
3. **Union the disks.** For every densified route point, `h3.latLngToCell` finds its cell, then `h3.gridDisk(cell, k)` expands it into a disk of neighboring cells. All disks are unioned into a single `Set<H3Index>` — the corridor.
4. **Render.** `h3.cellsToMultiPolygon` dissolves the cell set into outline polygon(s), which are drawn directly as a Leaflet polygon layer.

This is the standard "buffer a polyline with H3" pattern: hex disks approximate a circular buffer rather than reproducing one exactly, so the corridor is deliberately allowed to be a little generous near segment joints — **it is never narrower than 350m**, only occasionally a bit wider. (At resolution 9 with the demo route, the realized radius is ≈ k·edgeLength ≈ 2 × 201m ≈ 402m — see `tests/corridor.test.js` for the exact numbers the app computes.) For applications needing a tighter fit, raising the resolution shrinks that overshoot at the cost of more cells (the resolution selector in the UI demonstrates this trade-off live).

### Eligibility checks: H3 set membership + exact distance

Each pickup point's eligibility is a **single O(1) Set lookup**: `corridorCells.has(h3.latLngToCell(lat, lng, res))` (`js/corridor.js → isPointInCells`). This is the actual "spatial query" the assignment asks for — no per-point distance math is needed once the corridor set exists, which is what makes the live simulation (recomputing eligibility for all pickups on every animation tick) cheap enough to run at interactive speed.

For transparency/accuracy, each pickup also carries an **exact** distance to the route, computed independently via point-to-segment haversine geometry (`js/geo.js → distanceToPolyline`) and shown in its popup. This isn't used for the eligibility decision (the assignment specifically asks for H3-based spatial queries), but it lets you sanity-check the H3 approximation against ground truth.

### Zones vs. corridor

Service zones are static operational polygons, independent of the live route. They're indexed with `h3.polygonToCells` once per resolution change and rendered the same way as the corridor (`h3.cellsToMultiPolygon`), just with a different color and a dashed stroke — demonstrating that the same H3 primitives cover both "fixed zone" and "dynamic corridor" use cases.

### Simulated real-time updates

"Simulate Drive" steps an index through the densified route on a timer. On every step:
1. The corridor is rebuilt from `densifiedRoute[0..currentIndex]` only (not the whole route) — so it visibly **grows** as the driver advances, the way a real corridor would extend as new GPS fixes arrive.
2. Pickup eligibility is recomputed against the new corridor set.
3. The traveled-route polyline and the driver marker are updated.

This is intentionally a client-side `setInterval` loop rather than a WebSocket/SSE feed, per the assignment's guidance to focus on the H3 logic rather than real-time transport — but the corridor-rebuild function (`recomputeCorridor`) is written to take an arbitrary "route so far," so wiring it to a real GPS stream later is a matter of calling it from a socket handler instead of a timer.

## Project structure

```
macro-rides-corridor/
├── index.html              Page shell, control panel markup, CDN includes
├── css/
│   └── style.css           Dark dashboard theme
├── js/
│   ├── data.js              Hardcoded route, service zones, mock pickup-point generator
│   ├── geo.js               Haversine distance, route densification, point-to-polyline distance
│   ├── corridor.js           All H3 logic: buffer corridor, zone cells, multipolygon conversion, eligibility lookup
│   └── app.js                 Leaflet rendering, simulation control, UI bindings
├── tests/
│   └── corridor.test.js     Node-only sanity test for the corridor math (no browser needed)
├── package.json
├── LICENSE
└── README.md                 This file
```

Data, geometry helpers, H3 logic, and rendering are kept in separate files on purpose, so the H3/corridor logic (the part actually being evaluated) can be read, tested, and reused independently of the Leaflet/UI code.

## Tech stack

- **H3** ([h3-js](https://github.com/uber/h3-js) v4) for all spatial indexing and queries — grid disks for the buffer, `polygonToCells`/`cellsToMultiPolygon` for zones and rendering.
- **Leaflet** for map rendering (CARTO dark basemap tiles).
- Vanilla JS, no framework, no build step — open `index.html` and it runs.

## Running locally

```bash
# Option 1: just open it
open index.html        # macOS
# or double-click index.html in any OS

# Option 2: serve it (avoids any local-file CORS quirks)
npm install
npm start               # serves on http://localhost:5173
```

## Running the test

```bash
npm install
npm test
```

This installs `h3-js` as a dev dependency and runs `tests/corridor.test.js`, which independently rebuilds the corridor and asserts: the corridor is non-empty, a point on the route is eligible, a point ~13km away is not, and the corridor renders as a valid polygon. It exits non-zero on failure.

## Deployment (GitHub Pages)

1. Push this folder to a GitHub repository.
2. Repo **Settings → Pages → Source**: deploy from the `main` branch, root folder.
3. The demo will be live at `https://<username>.github.io/<repo-name>/` within a minute or two — no build step required since this is static HTML/CSS/JS.

## Notes & assumptions

- The route, zones, and pickup points are deterministic mock data (a seeded PRNG is used for pickup-point placement so the demo looks the same on every load) — there is no backend.
- The 350m buffer is fixed per the spec; the H3 **resolution** used to express it is configurable in the UI to show how the corridor's precision/cell-count trade-off works, without changing the buffer's real-world meaning.
- Distances and the route are short enough (single-digit km) that simple equirectangular/haversine math is accurate to well under a meter, so no projected CRS is needed.
