import type { CapacitorConfig } from '@capacitor/cli';
import { config as loadEnv } from 'dotenv';

// This file runs in a plain Node process via the Capacitor CLI, outside
// Next.js - Next's automatic .env loading doesn't apply here, so
// .env.local is loaded explicitly (same file src/lib/config.ts reads
// NEXT_PUBLIC_API_URL from, for the same "don't hardcode an environment"
// reason).
loadEnv({ path: '.env.local' });

// What the native shell's WebView loads on launch. Deliberately not
// NEXT_PUBLIC_-prefixed - this is read by the Capacitor CLI/native build
// tooling only, never bundled into client JS.
//
// Defaults to the deployed production frontend so a plain `npx cap sync`
// always points at production unless told otherwise. Override in
// .env.local to point a native build at a local dev server instead:
//   - iOS Simulator: http://localhost:3000 works as-is (shares the host's
//     network).
//   - Android Emulator: use http://10.0.2.2:3000 - "localhost" there means
//     the emulator itself, not your host machine (same reasoning as
//     NEXT_PUBLIC_API_URL's Android-emulator override).
//   - A physical device (either platform): use your machine's LAN IP,
//     e.g. http://192.168.1.23:3000.
//
// The real, live production domain - a plain `npx cap sync` with no
// CAPACITOR_SERVER_URL override (i.e. in a clean checkout/CI, where
// .env.local doesn't exist) resolves to this.
const PRODUCTION_FRONTEND_URL = 'https://grabmyseats-frontend.vercel.app';
const serverUrl = process.env.CAPACITOR_SERVER_URL || PRODUCTION_FRONTEND_URL;

if (!process.env.CAPACITOR_SERVER_URL) {
  console.log(`[capacitor.config.ts] Building against production: ${PRODUCTION_FRONTEND_URL}`);
} else if (serverUrl !== PRODUCTION_FRONTEND_URL) {
  console.warn(
    `[capacitor.config.ts] CAPACITOR_SERVER_URL is set to ${serverUrl}, overriding production ` +
      `(${PRODUCTION_FRONTEND_URL}) - this build will NOT point at the real site. Unset it in ` +
      '.env.local before building anything meant for real users.',
  );
}

const config: CapacitorConfig = {
  appId: 'com.grabmyseats.app',
  appName: 'GrabMySeats',
  webDir: 'www',
  server: {
    url: serverUrl,
    // Only relevant for a plain-http dev URL (the Android-emulator/LAN-IP
    // cases above) - Android blocks cleartext (non-TLS) traffic by
    // default. A real https production deployment doesn't need this, so
    // it's derived from the URL rather than left permanently on.
    cleartext: serverUrl.startsWith('http://'),
  },
};

export default config;
