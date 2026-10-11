import { ApiError } from "./api";

// What the sell form shows under the screenshot field when the server's
// ticket check (backend checkTicketImage, run by both POST
// /api/listings/ocr and POST /api/listings) refuses or can't run. On those
// two routes 422 and 409 only ever come from that check, and 503 from its
// timeout; 429 can come from a proxy in front of the server.

export const SCREENSHOT_MESSAGES = {
  noCode:
    "Your screenshot is missing a barcode or QR code. Please upload a clear screenshot of your booking confirmation that shows the barcode.",
  alreadyListed: "This ticket has already been listed.",
  busy: "We couldn't check your screenshot just now. Please try again in a moment.",
  offline: "Couldn't reach the server. Check your connection and try again.",
} as const;

export interface ScreenshotProblem {
  message: string;
  // The image itself can never be listed (no code, or already listed), so
  // the form clears it; otherwise the same file can simply be tried again.
  rejected: boolean;
}

export function screenshotProblem(err: unknown): ScreenshotProblem | null {
  if (!(err instanceof ApiError)) return null;
  switch (err.status) {
    case 422:
      return { message: SCREENSHOT_MESSAGES.noCode, rejected: true };
    case 409:
      return { message: SCREENSHOT_MESSAGES.alreadyListed, rejected: true };
    case 429:
    case 503:
      return { message: SCREENSHOT_MESSAGES.busy, rejected: false };
    case 0: // api.ts: fetch itself failed
      return { message: SCREENSHOT_MESSAGES.offline, rejected: false };
    default:
      return null;
  }
}
