// Self-check for location lookups and distances. Run: node test/geo.test.ts
import assert from "node:assert/strict";
import { distanceKm, formatKm, placeQuery } from "../src/geo.ts";

assert.equal(placeQuery("Main - 1 Harbour Dr, PSA Horizons"), "1 Harbour Dr, PSA Horizons");
assert.equal(placeQuery("Singapore - Punggol"), "Punggol");
assert.equal(placeQuery("Pioneer, West Region, Singapore"), "Pioneer, West Region, Singapore");
assert.equal(placeQuery("Geylang"), "Geylang");
assert.equal(placeQuery("Singapore, Singapore"), "", "city-only is too vague to measure distance");
assert.equal(placeQuery("Remote"), "");
assert.equal(placeQuery("Remote in Singapore"), "");
assert.equal(placeQuery("Tampines (Hybrid)"), "Tampines");

// Punggol bus interchange -> PSA Horizons (Pasir Panjang) is roughly 20 km as the crow flies.
const d = distanceKm({ lat: 1.4043, lon: 103.9023 }, { lat: 1.2757, lon: 103.7899 });
assert.ok(d > 18 && d < 20, `got ${d}`);
assert.equal(distanceKm({ lat: 1.3, lon: 103.8 }, { lat: 1.3, lon: 103.8 }), 0);
assert.equal(formatKm(3.24), "3.2 km");
assert.equal(formatKm(18.6), "19 km");
console.log("geo self-check OK");
