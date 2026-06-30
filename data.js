// Sample data for the Macro Rides demo.
// Coordinates are illustrative, centered around Indiranagar / Koramangala, Bengaluru —
// a plausible hyperlocal EV mobility service area.

// Driver's live route as a sequence of [lat, lng] waypoints.
const SAMPLE_ROUTE = [
  [12.9784, 77.6408],
  [12.9774, 77.6432],
  [12.9762, 77.6458],
  [12.9748, 77.6479],
  [12.9731, 77.6491],
  [12.9712, 77.6498],
  [12.9694, 77.6505],
  [12.9678, 77.6519],
  [12.9663, 77.6537],
  [12.9650, 77.6555],
  [12.9638, 77.6572],
  [12.9622, 77.6586],
];

// Static service zone boundary polygon (lat,lng pairs, closed ring).
const ZONE_BOUNDARY = [
  [12.9820, 77.6360],
  [12.9820, 77.6620],
  [12.9580, 77.6620],
  [12.9580, 77.6360],
  [12.9820, 77.6360],
];

// Candidate pickup points scattered in and around the zone/route.
// Some intentionally fall inside the corridor, some outside it.
const PICKUP_POINTS = [
  { id: "P1", name: "Indiranagar Metro Gate 2", lat: 12.9784, lng: 77.6408 },
  { id: "P2", name: "100 Feet Road Junction", lat: 12.9770, lng: 77.6440 },
  { id: "P3", name: "CMH Road Crossing", lat: 12.9758, lng: 77.6465 },
  { id: "P4", name: "Domlur Flyover", lat: 12.9605, lng: 77.6390 },
  { id: "P5", name: "Old Airport Road", lat: 12.9706, lng: 77.6500 },
  { id: "P6", name: "HAL 2nd Stage", lat: 12.9670, lng: 77.6525 },
  { id: "P7", name: "Koramangala 80 Feet Rd", lat: 12.9352, lng: 77.6245 },
  { id: "P8", name: "St. John's Hospital Gate", lat: 12.9645, lng: 77.6560 },
  { id: "P9", name: "Jeevan Bhima Nagar", lat: 12.9613, lng: 77.6592 },
  { id: "P10", name: "Defence Colony", lat: 12.9608, lng: 77.6460 },
  { id: "P11", name: "Eastwood Layout", lat: 12.9690, lng: 77.6460 },
  { id: "P12", name: "Vignana Nagar", lat: 12.9810, lng: 77.6580 },
  { id: "P13", name: "EPIP Zone", lat: 12.9750, lng: 77.6620 },
  { id: "P14", name: "Outer Ring Rd Junction", lat: 12.9550, lng: 77.6500 },
  { id: "P15", name: "Tin Factory", lat: 12.9930, lng: 77.6480 },
];
