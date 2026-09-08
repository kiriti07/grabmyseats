"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.haversineDistanceMeters = haversineDistanceMeters;
const EARTH_RADIUS_METERS = 6371000;
function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
}
// Great-circle distance between two lat/lng points, in meters. Pure
// function, no DB/PostGIS dependency - for the search endpoint's
// find-listings-near-me queries, use ST_DWithin instead (this is for
// validating a single point-to-point distance, e.g. meetup check-in).
function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_METERS * c;
}
//# sourceMappingURL=haversine.js.map