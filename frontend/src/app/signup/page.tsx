// This app has no separate signup form - phone+OTP verification signs a
// brand-new phone number up automatically on first use (see backend's
// POST /api/auth/otp/verify). /signup exists only so a shared referral
// link (<origin>/signup?ref=ABC123 - see account/page.tsx's "Refer & Earn"
// section) reads naturally, while actually reusing the exact same form as
// /login, which already reads ?ref= off the URL and carries it through to
// verification.
export { default } from "../login/page";
