/**
 * geo.js — plain geometry helpers (no H3, no Leaflet).
 * All distances are in meters, all coordinates are { lat, lng } objects.
 */

const EARTH_RADIUS_M = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** Haversine great-circle distance between two lat/lng points, in meters. */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * Distance from point P to the segment AB, in meters.
 * Uses a local equirectangular projection (accurate to well under a meter
 * over single-digit-km distances, which is all this demo needs — see README).
 */
function distanceToSegmentMeters(lat, lng, lat1, lng1, lat2, lng2) {
  const latRef = toRad((lat1 + lat2) / 2);
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(latRef);

  const toXY = (la, ln) => ({
    x: (ln - lng1) * mPerDegLng,
    y: (la - lat1) * mPerDegLat,
  });

  const p = toXY(lat, lng);
  const a = { x: 0, y: 0 };
  const b = toXY(lat2, lng2);

  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;

  let t = lenSq === 0 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const closest = { x: a.x + t * abx, y: a.y + t * aby };
  const dx = p.x - closest.x;
  const dy = p.y - closest.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Minimum distance from a point to a polyline (array of {lat,lng}), in meters. */
function distanceToPolyline(lat, lng, points) {
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distanceToSegmentMeters(
      lat,
      lng,
      points[i].lat,
      points[i].lng,
      points[i + 1].lat,
      points[i + 1].lng
    );
    if (d < min) min = d;
  }
  return min;
}

/**
 * Linear interpolation between two points (fine for short, single-digit-km
 * segments — see README "Notes & assumptions").
 */
function interpolate(p1, p2, t) {
  return {
    lat: p1.lat + (p2.lat - p1.lat) * t,
    lng: p1.lng + (p2.lng - p1.lng) * t,
  };
}

/**
 * Densify a route so consecutive points are no more than maxSegmentMeters apart.
 * This prevents the H3 grid-disk union from leaving gaps on long straight segments.
 */
function densifyRoute(waypoints, maxSegmentMeters = 60) {
  const out = [waypoints[0]];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const segLen = haversineDistance(a.lat, a.lng, b.lat, b.lng);
    const steps = Math.max(1, Math.ceil(segLen / maxSegmentMeters));
    for (let s = 1; s <= steps; s++) {
      out.push(interpolate(a, b, s / steps));
    }
  }
  return out;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    haversineDistance,
    distanceToSegmentMeters,
    distanceToPolyline,
    densifyRoute,
    interpolate,
  };
}
