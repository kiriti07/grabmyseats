# Invite-only sign-up

Controlled by the backend env var `REQUIRE_REFERRAL_FOR_SIGNUP` (off unless
set to exactly `true`). When it's on:

- A new account needs a valid invite code (any active user's referral code).
  This is enforced in the backend on both ways an account can be created:
  `POST /api/auth/otp/verify` (sign-up) and `POST /api/auth/signup/confirm`
  (sign-in, then "create an account"). The code is checked again on each one.
- A new email address or phone number only gets a sign-in code with a valid
  invite code. The API reply is the same either way, so it doesn't reveal
  whether an account exists.
- A code is refused if it belongs to a suspended or deleted account, or to
  the Play reviewer account.
- Existing accounts sign in exactly as before, with no code. The Play reviewer
  login (`REVIEW_EMAIL` / `REVIEW_OTP`) is exempt.
- The sign-up screens ask for the invite code (`GET /api/auth/options` →
  `requireReferral`).

When it's off, sign-up works as it did before this change. The one
difference: a code from a suspended or reviewer account no longer credits
anyone.

## Store listing notes

### Google Play: App content → App access

Choose "All or some functionality is restricted", then add these
instructions:

> GrabMySeats sign-up is currently invite-only. To review the app, use the
> reviewer account. It needs no invite code and no email access:
>
> 1. Open the app and tap **Sign in** (not Sign up).
> 2. Enter the email: `<REVIEW_EMAIL>`
> 3. Tap **Send code**, then enter the code: `<REVIEW_OTP>`
>
> New users join with an invite code from an existing user. They tap the
> invite link, or open Sign up and type the code in the **Invite code** box.

Fill in `<REVIEW_EMAIL>` / `<REVIEW_OTP>` with the production values, and only
in the Play Console. Never commit them.

### Store description: add one line

> GrabMySeats is invite-only for now. Ask a friend who uses it for their
> invite code (it's on their Account page) and enter it when you sign up.

### App Store (if/when iOS ships): App Review Information → Notes

Same text as the Play "App access" instructions. In "Sign-in required", put
`<REVIEW_EMAIL>` as the user name and `<REVIEW_OTP>` as the password.

## Follow-up (not built yet)

**Android App Links for `https://grabmyseats.com/signup?ref=…`.** For now,
invite links open in the browser and app users type the code instead. To
build it:

- Add an `intent-filter` with `android:autoVerify="true"` for
  `https://grabmyseats.com/signup` to `AndroidManifest.xml`.
- Add an `appUrlOpen` handler (`@capacitor/app`) that routes the WebView to
  the link's path.
- Serve `/.well-known/assetlinks.json` from the frontend. It must list **both**
  SHA-256 fingerprints: the upload key and the Play App Signing key (Play
  Console → Setup → App signing).
- Rebuild and re-upload the APK/AAB.
- Optionally, read the Play Install Referrer, so someone who installs from a
  link doesn't have to type the code.
