"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.geocodeAddress = geocodeAddress;
const GEOCODE_TIMEOUT_MS = 5000;
// Free-tier forward geocoding via OpenStreetMap Nominatim - no API key
// required, unlike Google Places/Geocoding. Nominatim's usage policy
// requires an identifying User-Agent and caps usage at ~1 req/sec, which
// is fine for the volume of listing creation this app sees; revisit if
// that ever becomes a bottleneck.
async function geocodeAddress(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    let res;
    try {
        res = await fetch(url, {
            headers: { "User-Agent": "grabmyseats-backend/1.0 (dev)" },
            signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
        });
    }
    catch {
        return null;
    }
    if (!res.ok)
        return null;
    const results = (await res.json().catch(() => null));
    if (!results || results.length === 0)
        return null;
    const lat = Number(results[0].lat);
    const lng = Number(results[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng))
        return null;
    return { lat, lng, displayName: results[0].display_name };
}
//# sourceMappingURL=geocode.js.map