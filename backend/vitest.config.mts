import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Real Tesseract OCR runs against fixture images in parseListingText's
    // test suite - slower than a typical unit test, especially on a cold
    // cache (first run downloads the English trained-data model).
    testTimeout: 60_000,
    // dist/ can contain a stale compiled copy of this same test file from
    // a previous `npm run build` - excluded so vitest doesn't try to load
    // it as a second, broken CommonJS test file.
    exclude: ["**/node_modules/**", "**/dist/**"],
    // Listing creation needs a ticket fingerprint secret (lib/
    // ticketFingerprint.ts); a test-only one unless the environment sets its
    // own. Fingerprints made with it mean nothing outside the test database.
    env: {
      TICKET_FINGERPRINT_SECRET:
        process.env.TICKET_FINGERPRINT_SECRET ?? "test-only-ticket-fingerprint-secret-0123456789",
    },
  },
});
