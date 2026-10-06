import { sendOtpEmail } from "./email";
import { phoneOtpAvailable, sendOtpSms } from "./sms";
import { smsAllowedCountryCodes } from "./config";
import { isPhoneCountryAllowed, type IdentifierInput } from "./validators";

// Shared checks for sending a code to an identifier (POST
// /api/auth/otp/request and POST /api/users/me/identifiers/claim/request).
// Returns an error message, or
// null if a code may be sent. None of these depend on whether an account
// exists - only on the identifier's own shape and on what this deployment
// can deliver - so they can't be used to enumerate accounts.
export function otpSendRefusal(input: IdentifierInput | null): string | null {
  if (!input) return "Enter a valid email address or phone number";
  if (input.channel === "phone") {
    if (!phoneOtpAvailable()) return "Phone codes aren't available yet - use your email instead";
    if (!isPhoneCountryAllowed(input.value, smsAllowedCountryCodes())) {
      return "Phone codes aren't available for this country yet - use your email instead";
    }
  }
  return null;
}

// Sent without awaiting: provider latency or failure must not be
// observable in the response.
export function sendOtp(input: IdentifierInput, code: string, logTag: string): void {
  const send =
    input.channel === "email" ? sendOtpEmail(input.value, code) : sendOtpSms(input.value, code);
  send.catch((err) => {
    console.error(`[${logTag}] failed to send ${input.channel} code`, err);
  });
}
