import "dotenv/config";
import { app } from "./app";
import { startJobs } from "./jobs";
import { PAYMENT_MODE } from "./lib/config";
import { emailProviderName } from "./lib/email";
import { smsProviderName } from "./lib/sms";
import { requirePhoneVerification } from "./lib/config";
import { checkReviewLoginConfigAtStartup } from "./lib/reviewAccess";
import { isTicketFingerprintConfigured } from "./lib/ticketFingerprint";

// Fails loud instead of silently ignoring a leftover dev-only env var that
// would otherwise let anyone sign in as any email address in production.
if (process.env.NODE_ENV === "production" && process.env.DEV_OTP_BYPASS_CODE) {
  throw new Error("DEV_OTP_BYPASS_CODE must not be set when NODE_ENV=production");
}

// PAYMENT_MODE is read once, at module load (see lib/config.ts), so a
// process needs an actual restart to pick up an env var change - this
// makes the mode that's *actually* active this run immediately visible in
// the terminal on every boot, instead of having to grep .env or infer it
// from which error a request happens to throw.
console.log(`[config] PAYMENT_MODE=${PAYMENT_MODE}`);

// Email is the login method, so the console fallback (see lib/email) means
// no one can actually receive a login code - loud in production, but not
// fatal, so a misconfigured SMTP setting doesn't take the whole API down.
console.log(`[config] EMAIL_PROVIDER=${emailProviderName}`);
console.log(`[config] SMS_PROVIDER=${smsProviderName}`);
console.log(`[config] REQUIRE_PHONE_VERIFICATION=${requirePhoneVerification()}`);
if (
  requirePhoneVerification() &&
  smsProviderName === "console" &&
  process.env.NODE_ENV === "production"
) {
  console.warn(
    "[config] WARNING: REQUIRE_PHONE_VERIFICATION=true but SMS is console-only - nobody can " +
      "verify a phone, so nobody can list or reserve until a real SMS provider is configured.",
  );
}

// Play reviewer login (lib/reviewAccess.ts) - separate from, and not
// affected by, the DEV_OTP_BYPASS_CODE production guard above. Logs loudly
// when enabled; refuses to boot on a malformed/guessable REVIEW_OTP.
checkReviewLoginConfigAtStartup();
if (process.env.NODE_ENV === "production" && emailProviderName === "console") {
  console.warn(
    "[config] WARNING: SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS are not all set - login codes " +
      "are only being logged, not emailed. Nobody can sign in until SMTP is configured.",
  );
}

// Every listing needs a ticket fingerprint (lib/ticketFingerprint.ts), and
// there is deliberately no fallback secret - refuse to boot without one.
if (process.env.NODE_ENV === "production" && !isTicketFingerprintConfigured()) {
  throw new Error("TICKET_FINGERPRINT_SECRET must be set (32+ characters) when NODE_ENV=production");
}

const port = process.env.PORT ? Number(process.env.PORT) : 4000;

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});

startJobs();
