/**
 * data.js — static/mock data for the demo: the hardcoded driver route,
 * the two service zone polygons, and a seeded mock pickup-point generator.
 */

// Hardcoded driver route through Delhi NCR (per assignment note: simulated,
// not live telemetry — see README "Live demo").
const ROUTE_WAYPOINTS = [
  { lat: 28.6315, lng: 77.2167, label: "Connaught Place" },
  { lat: 28.6129, lng: 77.2295, label: "India Gate" },
  { lat: 28.6004, lng: 77.2275, label: "Khan Market" },
  { lat: 28.5916, lng: 77.2065, label: "Safdarjung" },
  { lat: 28.5672, lng: 77.21, label: "AIIMS" },
  { lat: 28.5535, lng: 77.201, label: "Hauz Khas" },
  { lat: 28.5245, lng: 77.2066, label: "Saket" },
];

// Two static operational zones, independent of the live route (README "Zones vs. corridor").
const SERVICE_ZONES = [
  {
    id: "central-delhi",
    name: "Central Delhi Zone",
    color: "#5eb1ff",
    polygon: [
      { lat: 28.645, lng: 77.195 },
      { lat: 28.645, lng: 77.245 },
      { lat: 28.598, lng: 77.245 },
      { lat: 28.598, lng: 77.195 },
    ],
  },
  {
    id: "south-delhi",
    name: "South Delhi Zone",
    color: "#c98bff",
    polygon: [
      { lat: 28.598, lng: 77.18 },
      { lat: 28.598, lng: 77.23 },
      { lat: 28.515, lng: 77.23 },
      { lat: 28.515, lng: 77.18 },
    ],
  },
];

/** Deterministic PRNG (mulberry32) so the demo looks the same on every load. */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate `count` mock pickup points scattered around the bounding box of
 * the route, with some falling close to it and some deliberately far away
 * (e.g. ~13km out, to exercise the "ineligible" path).
 */
function generateMockPickups(count = 45, seed = 42) {
  const rand = mulberry32(seed);

  const lats = ROUTE_WAYPOINTS.map((p) => p.lat);
  const lngs = ROUTE_WAYPOINTS.map((p) => p.lng);
  const latMin = Math.min(...lats) - 0.01;
  const latMax = Math.max(...lats) + 0.01;
  const lngMin = Math.min(...lngs) - 0.01;
  const lngMax = Math.max(...lngs) + 0.01;

  const pickups = [];
  for (let i = 0; i < count; i++) {
    let lat, lng;
    if (i < count - 5) {
      // Most points scattered around the route's bounding box.
      lat = latMin + rand() * (latMax - latMin);
      lng = lngMin + rand() * (lngMax - lngMin);
    } else {
      // A handful of deliberately far-out points (~10-15km away).
      const base = ROUTE_WAYPOINTS[Math.floor(rand() * ROUTE_WAYPOINTS.length)];
      const angle = rand() * Math.PI * 2;
      const distDeg = 0.1 + rand() * 0.05; // roughly 11-16km
      lat = base.lat + Math.sin(angle) * distDeg;
      lng = base.lng + Math.cos(angle) * distDeg;
    }
    pickups.push({
      id: "p" + i,
      lat,
      lng,
    });
  }
  return pickups;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ROUTE_WAYPOINTS, SERVICE_ZONES, generateMockPickups, mulberry32 };
}
