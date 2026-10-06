import type { SmsProvider } from "./SmsProvider";
import { ConsoleSmsProvider } from "./ConsoleSmsProvider";

export type { SmsProvider };

// The rest of the app only depends on the SmsProvider interface, so going
// live with a real vendor is a one-file change: add e.g. TwilioSmsProvider
// or Msg91SmsProvider (implementing SmsProvider) next to ConsoleSmsProvider,
// then swap the line below.
export const smsProvider: SmsProvider = new ConsoleSmsProvider();

// Which provider is wired up above - "console" only logs, so in production
// nobody would ever receive a code (see phoneOtpAvailable below).
export const smsProviderName: "console" | "real" =
  smsProvider instanceof ConsoleSmsProvider ? "console" : "real";

// Phone sign-in/sign-up and phone verification are only offered when a code
// can actually reach the user: always in development (codes are logged),
// and in production only once a real provider replaces the console stub.
// Surfaced to the frontend via GET /api/auth/options.
export function phoneOtpAvailable(): boolean {
  return smsProviderName === "real" || process.env.NODE_ENV !== "production";
}

// The one-time code SMS. Fixed text plus the code, nothing caller-supplied
// (same anti-relay reasoning as lib/email's sendOtpEmail) - and kept in one
// place because Indian SMS routes (e.g. MSG91) only deliver text matching a
// pre-registered DLT template.
export async function sendOtpSms(phone: string, code: string): Promise<void> {
  await smsProvider.send(phone, `Your GrabMySeats code is ${code}`);
}
