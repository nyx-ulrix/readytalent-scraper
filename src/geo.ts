/** Distances between a place you type and each job's address, for the "Near … within N km" filter. */
export type LatLon = { lat: number; lon: number };

/** Great-circle distance in km (haversine). */
export function distanceKm(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Locations too vague to place on a map. */
const VAGUE = new Set(["", "singapore", "singapore, singapore", "sg", "remote", "hybrid", "on-site", "onsite", "anywhere", "work from home", "overseas", "various", "multiple locations", "island-wide", "islandwide"]);

/**
 * The part of a job's location worth looking up, or "" when it is too vague.
 * "Main - 1 Harbour Dr, PSA Horizons" -> "1 Harbour Dr, PSA Horizons"; "Singapore - Punggol" -> "Punggol";
 * "Singapore, Singapore" / "Remote" -> "".
 */
export function placeQuery(location: string): string {
  let s = (location || "").replace(/\s+/g, " ").trim();
  s = s.replace(/^(main|singapore|hq|headquarters|office|head office)\s*-\s*/i, "");
  s = s.replace(/\s*\((remote|hybrid|on-?site)\)\s*$/i, "");
  s = s.replace(/^(remote|hybrid)\s+in\s+/i, "");
  return VAGUE.has(s.toLowerCase()) ? "" : s;
}

export const formatKm = (km: number) => (km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`);
