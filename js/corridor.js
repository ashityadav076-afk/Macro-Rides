/**
 * corridor.js — all H3 logic lives here, kept separate from rendering so it
 * can be read/tested independently (see tests/corridor.test.js).
 *
 * Requires the global `h3` object (h3-js UMD build, loaded via CDN in index.html,
 * or `require("h3-js")` under Node for the test script).
 */

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("h3-js"));
  } else {
    root.Corridor = factory(root.h3);
  }
})(typeof self !== "undefined" ? self : this, function (h3) {
  const BUFFER_METERS = 350;

  /**
   * Smallest grid-disk radius k such that k hex rings, at the given
   * resolution, are guaranteed to cover the buffer distance.
   */
  function kForBuffer(res, bufferMeters = BUFFER_METERS) {
    const edgeLength = h3.getHexagonEdgeLengthAvg(res, "m");
    const k = Math.ceil(bufferMeters / edgeLength);
    return { k, edgeLength, realizedRadius: k * edgeLength };
  }

  /**
   * Build the corridor cell set as the union of H3 grid disks centered on
   * every point of a (already densified) route.
   */
  function buildCorridor(routePoints, res) {
    const { k } = kForBuffer(res);
    const cells = new Set();
    for (const p of routePoints) {
      const cell = h3.latLngToCell(p.lat, p.lng, res);
      const disk = h3.gridDisk(cell, k);
      for (const c of disk) cells.add(c);
    }
    return cells;
  }

  /** O(1) corridor membership check for a single point. */
  function isPointInCells(lat, lng, res, cellSet) {
    return cellSet.has(h3.latLngToCell(lat, lng, res));
  }

  /** Index a zone polygon (array of {lat,lng}) into H3 cells at the given resolution. */
  function zoneToCells(polygon, res) {
    const loop = polygon.map((p) => [p.lat, p.lng]);
    // isGeoJson = false -> coordinates are [lat,lng] pairs, no winding-order requirement.
    const cells = h3.polygonToCells([loop], res, false);
    return new Set(cells);
  }

  /**
   * Convert a cell set into Leaflet-ready polygon loops: an array of rings,
   * each ring an array of [lat,lng] pairs.
   */
  function cellsToLatLngLoops(cellSet) {
    const multiPoly = h3.cellsToMultiPolygon(Array.from(cellSet), false);
    // multiPoly: Polygon[][] -> each polygon is array of loops -> each loop array of [lat,lng]
    const loops = [];
    for (const polygon of multiPoly) {
      for (const loop of polygon) {
        loops.push(loop);
      }
    }
    return loops;
  }

  /** All H3 cells at `res` whose center falls within `bounds` (for the debug grid overlay). */
  function cellsInBounds(bounds, res) {
    const loop = [
      [bounds.north, bounds.west],
      [bounds.north, bounds.east],
      [bounds.south, bounds.east],
      [bounds.south, bounds.west],
    ];
    return h3.polygonToCells([loop], res, false);
  }

  function cellBoundary(cell) {
    // h3.cellToBoundary returns [lat,lng] pairs by default (geoJson=false).
    return h3.cellToBoundary(cell, false);
  }

  return {
    BUFFER_METERS,
    kForBuffer,
    buildCorridor,
    isPointInCells,
    zoneToCells,
    cellsToLatLngLoops,
    cellsInBounds,
    cellBoundary,
  };
});
