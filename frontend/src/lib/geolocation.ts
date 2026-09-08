export interface Coordinates {
  lat: number;
  lng: number;
}

const GEOLOCATION_TIMEOUT_MS = 8000;

// Wraps the callback-based Geolocation API in a promise that always
// resolves (never rejects) - permission denial, unsupported browsers, and
// timeouts are all just "we don't have a location" to the caller.
export function detectLocation(): Promise<Coordinates | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => resolve(null),
      { timeout: GEOLOCATION_TIMEOUT_MS },
    );
  });
}
