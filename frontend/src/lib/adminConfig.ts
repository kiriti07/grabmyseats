export const ADMIN_TOKEN_COOKIE_NAME = "gms_admin_token";

// Mirrors ADMIN_SESSION_MAX_AGE_SECONDS in backend/src/lib/adminAuthConfig.ts,
// since the value stored here is that same session token. Deliberately a
// separate cookie from TOKEN_COOKIE_NAME (config.ts) - see the comment on
// AdminAuthContext for why customer and admin auth never share state.
export const ADMIN_TOKEN_MAX_AGE_SECONDS = 12 * 60 * 60;
