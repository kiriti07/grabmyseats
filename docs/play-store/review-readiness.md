# Review readiness

This covers what a Google reviewer will see, what is likely to get the app rejected, and how to
answer. Written 2026-11-03 from the code on `master`. **UNSURE** marks anything that needs a check
on a real device or in Play Console.

Related docs:
- `policy-check.md`: policy-by-policy verdicts.
- `app-access.md`: the reviewer login text.
- `closed-testing.md`: the 14-day test.

---

## 1. Wrapper app / "minimum functionality" risk

**Why we're exposed:**
- The Android app is a Capacitor shell that loads `https://grabmyseats.com`
  (`frontend/capacitor.config.ts`, `server.url`). The web code isn't bundled.
- Play's minimum-functionality rules reject apps that are "just a website" or don't give an
  app-like experience. It's our own site, so the "webview of someone else's site" variant
  doesn't apply.

### Native features we have today

| Feature | Evidence |
|---|---|
| Push notifications (FCM) with their own channel `ticket_alerts`, small icon and accent colour. A tap opens the app at the matching page | `@capacitor/push-notifications` 8.1.3 (`frontend/package.json:16`), `AndroidManifest.xml:45-53`, `frontend/src/lib/push.ts:341` (`pushNotificationActionPerformed`) |
| Runtime notification permission, asked in context (first alert) on Android 13+ | `AndroidManifest.xml:59`, `push.ts:287` |
| Native share sheet for the invite link | `@capacitor/share` 8.0.3, `frontend/src/lib/share.ts` |
| Native location permission (approximate on 12+, precise fallback on ≤11) | `AndroidManifest.xml:61-70` |
| Offline / error page bundled in the app, instead of a browser error | `frontend/www/offline.html`, `capacitor.config.ts` `errorPath` |
| Adaptive launcher icon and launch (splash) theme | `res/mipmap-anydpi-v26`, `AppTheme.NoActionBarLaunch` |
| Push token removed on logout | `frontend/src/context/AuthContext.tsx:68` (`stopPush`) |
| `tel:` and WhatsApp links hand off to the dialer and WhatsApp | `frontend/src/components/ui/ContactPhone.tsx:29`, `WhatsAppButton.tsx` |
| No cloud backup of session data; release build is HTTPS-only | `AndroidManifest.xml:11-15` |

### Cheap additions that would strengthen the case (not implemented)

Each line needs `npm install` of an official Capacitor plugin (8.x, matching core 8.5.1), and
I'll ask you before installing. Estimates include a device check.

| # | Addition | What the user gets | Effort | Notes |
|---|---|---|---|---|
| 1 | **Android App Links** (`@capacitor/app` + intent filter + `/.well-known/assetlinks.json` on grabmyseats.com) | `https://grabmyseats.com/signup?ref=…` and `/buy/<id>` links open **in the app**, not the browser | **3-5 h** | **Highest value.** It also fixes the closed-test invite gap (`closed-testing.md` section 2b). It needs the release signing SHA-256 from Play Console → App signing, never read from the keystore, and a file in `frontend/public/.well-known/` |
| 2 | **Hardware back button** (`@capacitor/app` `backButton`) | Back goes to the previous page; on the home page it exits | **1-2 h** (after #1, same plugin) | **UNSURE:** I haven't checked how back behaves today without the App plugin. Test it (checklist below). If back exits the app from a sub-page, reviewers notice |
| 3 | **Native camera / photo picker for the ticket screenshot** (`@capacitor/camera`) | "Take photo / Choose from gallery" sheet on Sell and profile photo | **4-6 h** | The `<input type="file">` already opens Android's picker through the WebView, so this is polish. Adds the camera permission flow (the camera is used only when the user picks it) |
| 4 | **Haptics** (`@capacitor/haptics`) on publish, reserve and errors | Tactile feedback | **1 h** | Small but visible "native" touch |
| 5 | **Status bar styling** (`@capacitor/status-bar`) matching the dark theme | No white status bar over a dark page | **1 h** | **UNSURE:** check what the status bar looks like today |
| 6 | **Static app shortcuts** (long-press icon: "Sell a ticket", "My alerts") | Android launcher shortcuts | **1 h** | XML in `res/xml/shortcuts.xml` plus the manifest. No plugin; deep links (#1) make them nicer |
| 7 | **Network status banner** (`@capacitor/network`) | "You're offline" banner in-page instead of only the error page | **1-2 h** | |

**Recommended before the first production review:** #1 and #2 together (one plugin, about 5-6 h).
#4-6 are optional extras.

---

## 2. Pre-launch checklist

Run it on a **release build installed from the closed track**, not a debug APK:
- a **fresh install** (uninstall first; Settings → Apps → clear nothing left);
- an Android **13+** phone (notification permission);
- if you can, also an Android **11 or older** device or emulator (precise location path).

| # | Check | How | Expected | Code reference |
|---|---|---|---|---|
| 1 | **Crash-free launch, fresh install** | Install from Play, open | Splash, then the home page. No crash or blank screen | Vitals → Crashes after the test; pre-launch report |
| 2 | **Launch offline** | Airplane mode, open | The bundled offline page, not a Chrome error | `frontend/www/offline.html` |
| 3 | **Location: allow** | First open → system prompt → Allow | Listings near you. On Android 12+ the prompt offers Approximate | `frontend/src/hooks/useSearchLocation.ts:22` |
| 4 | **Location: deny** | Fresh install → Deny | City picker shown, no error loop. Choosing Hyderabad lists results | `useSearchLocation.ts` `selectCity` |
| 5 | **Location prompt timing** | Note *when* it appears | **Today it appears on first launch, before any explanation.** Allowed, but see rejection #5 | |
| 6 | **Notifications: first alert** | Sign in → search → Notify me → save | Android 13+ system prompt appears now, not at launch | `push.ts:287`, `AndroidManifest.xml:59` |
| 7 | **Notifications: deny then re-enable** | Deny → create another alert → then allow in system settings | No crash. Alerts still saved (in-app only). After enabling, pushes arrive | `matchAlerts.ts` `IN_APP_ONLY` |
| 8 | **Push received and tapped** | Second account posts a matching listing | "Tickets available" within about 1-5 min; tap opens the listing or alerts page | `matchListingInBackground`, `push.ts:341` |
| 9 | **Sign up with invite code** | Sign up → email → invite code → code from email | Consent line visible under the button (Terms and Privacy links work); welcome step; home | `IdentifierAuth.tsx`, `TermsConsentNote.tsx` (Task A, uncommitted) |
| 10 | **Logout / login** | Account → Log out → Sign in | Logged out cleanly; push token removed; sign back in with a new code | `AuthContext.tsx:68` |
| 11 | **Hardware back** | Open Account → Edit Profile → press back | Goes to Account, not out of the app. **UNSURE today** | (no `@capacitor/app` yet) |
| 12 | **Phone and WhatsApp links** | Reserve a listing → tap the number and the WhatsApp button | The dialer / WhatsApp opens; back returns to the app | `ContactPhone.tsx:29`, `WhatsAppButton.tsx:12` |
| 13 | **Share** | Account → Share GrabMySeats | Native share sheet | `frontend/src/lib/share.ts` |
| 14 | **Account deletion in app** | Account → Delete my account → DELETE → confirm | Logged out; signing in with the same email creates a new, empty account | `frontend/src/app/account/delete/page.tsx`, `backend/src/routes/users.ts:493` |
| 15 | **Deletion web page** | Open `https://grabmyseats.com/delete-account` signed out, on a desktop | Loads without login, shows steps and the email option | `frontend/src/app/delete-account/page.tsx` |
| 16 | **Terms and Privacy from inside the app** | Account → Terms & Conditions / Privacy Policy / Help Center, and the links under sign-up | Open the full pages; back returns. Privacy shows "Last updated: 3 November 2026" once Task A is deployed | `frontend/src/app/account/page.tsx:165-182` |
| 17 | **Privacy URL signed out** | Open `https://grabmyseats.com/privacy` in a private window | Loads without login | `frontend/src/middleware.ts` (protects only `/account`, `/admin`) |
| 18 | **Rotate / large font** | Rotate the phone; set the system font to the largest | Layout still usable; nothing cut off on key buttons | **UNSURE** |
| 19 | **Report a user** | From a reservation → Report this user → pick a reason | "Report submitted"; shows in the admin queue with the reason | `ReportUserButton.tsx` (Task A) |
| 20 | **Release config** | Production env | `PUSH_NOTIFICATIONS_ENABLED=true`, `REQUIRE_PHONE_VERIFICATION` not `true` (SMS is a stub), `REVIEW_EMAIL`/`REVIEW_OTP` set, `REQUIRE_REFERRAL_FOR_SIGNUP` as you intend | `backend/src/lib/config.ts:41,62`, `lib/push/config.ts:23`, `lib/reviewAccess.ts` |

**Pre-launch report** (Play Console → Test and release → Testing → Pre-launch report):
- It runs automatically on each upload to a testing track.
- Google's robot crawls the app on several devices. It **can't get past our email-code sign-in**,
  so expect it to cover only the signed-out pages (home, search, terms, privacy, help).
- Its "Sign-in credentials" setting is for username/password screens. **UNSURE** whether it can
  drive our two-step code flow, so leave it unset unless you test it.
- Look at **Stability** (crashes) and **Accessibility** (contrast, touch targets). Treat
  Performance warnings as information.

---

## 3. Reviewer experience walkthrough

What a reviewer sees, step by step, using `app-access.md`. **⚠ = dead end or risk.**

1. **Install and first launch.**
   - Splash, then the home page loads from grabmyseats.com.
   - **⚠ Immediately**, a system location prompt with no in-app explanation
     (`useSearchLocation.ts:22`).
2. **Location result.**
   - Reviewers are often **outside India**, or on emulators placed in California.
   - With "Allow", "near me" finds **no listings** (search radius around a US location).
   - **⚠ An empty home screen** looks like a broken app.
   - The App access text should say: "choose a city (e.g. Hyderabad)". It does.
3. **Browse signed out.**
   - Search works without an account (`GET /api/listings/search`, `listings.ts:529`).
   - Opening a listing needs sign-in (`GET /api/listings/:id` has `requireAuth`, `listings.ts:712`).
   - The redirect to sign-in is expected, not a dead end.
4. **Sign in.**
   - Account / Sign in → enter `<REVIEWER_EMAIL>` → Send code. That sends a real email to an inbox
     nobody reads; harmless.
   - Enter `<REVIEWER_CODE>`. The review path is handled before any account or invite check
     (`backend/src/routes/auth.ts:284`). **No invite code is needed**, even with invite-only on.
5. **Welcome step (first time only):** enter a name. The phone is optional; the review account
   doesn't need a phone to sell (`listings.ts:191`).
6. **Sell.**
   - **⚠ Dead end:** a listing needs an image containing a QR or similar code
     (`ticketBarcode.ts`). A reviewer won't have one. Without it: "no ticket code" (422).
   - **Fix:** put a sample ticket image at a public URL (needs a small static file in
     `frontend/public/review/`; not done) and link it in App access. Or attach it to the
     instructions.
   - The same image can be reused only after the earlier listing is withdrawn (one live listing
     per code).
7. **My Listings:** edit, mark sold, withdraw. Works. Real users never see the reviewer's
   listings (`listings.ts:615,735,932`).
8. **Reserve and see contact.**
   - **⚠** Only possible on a **real user's listing**. The reviewer can't reserve their own
     (`listings.ts:917`).
   - Real users can't see the reviewer's listings, so there's no safe target.
   - Decision taken (Task A plan, option a): **no code change; attach a screen recording** of the
     flow made with two of your own test accounts. Ask the reviewer not to reserve.
9. **Alerts and push.**
   - Creating an alert works, and the notification permission prompt appears.
   - **⚠ No push can arrive for the reviewer.** Their own listings never match their alerts
     (`alertMatching.ts` `sellerId <> userId`), and a real matching listing near them is
     unlikely.
   - **Fix:** say this plainly in App access and include it in the screen recording.
10. **Report a user.**
    - **⚠** Only reachable from a reservation, so the same dead end as step 8.
    - The recording should show it.
    - Listing reports before reserving aren't built yet (policy-check 1c, open). **Task B, which
     must ship before the production submission** (see R2).
11. **Share, Terms, Privacy, Help:** all reachable from Account. Works.
12. **Delete account.**
    - Works. The account is anonymised, and the review flag is cleared (`accountDeletion.ts:157`).
    - The next reviewer sign-in creates a fresh review account.
    - Any reviewer listings left are withdrawn.

**Summary of reviewer dead ends:**
- no listings near a non-Indian location (#2);
- no ticket image to sell with (#6);
- can't reserve, report or receive a push without touching real users (#8-10).

The App access text and **one screen recording** of about 90 seconds covers all of them:
1. reserve and contact;
2. report;
3. a push arriving and being tapped;
4. deletion.

Upload the recording unlisted to YouTube or Drive and link it in "Any other information".

---

## 4. Rejection playbook - 5 most likely reasons

### R1. Minimum functionality / "webview of a website"

- **Why:** the app loads the live site in a WebView.
- **Evidence for the appeal:**
  - We own and operate grabmyseats.com, which matches the developer name and privacy policy.
  - The app adds native push alerts with their own channel, the native share sheet, native
    location and notification permissions, and an offline screen bundled in the app.
  - It hands off to the dialer and WhatsApp.
  - Cite section 1's table, with screenshots of a push and the share sheet.
- **Fix if the appeal fails:** add App Links and back-button handling (section 1, #1 and #2), plus
  haptics and status bar (#4, #5), and resubmit.

### R2. User Generated Content: missing blocking or reporting

- **Why:**
  - Users post listing descriptions and rating comments.
  - The 1:1 contact is phone or WhatsApp, outside the app.
  - The general UGC bullet says "reporting and blocking".
- **Evidence:**
  - Terms accepted at sign-up (Task A consent line plus `termsAcceptedAt`).
  - Objectionable content defined in Terms section 5, with zero tolerance (Task A).
  - In-app reporting with reasons (Task A).
  - Contact details are filtered out of descriptions (`shared/src/listingDetails.ts:129`).
  - Admin review and suspension of users (`backend/src/routes/admin.ts`).
  - No in-app messaging exists.
- **Fix:**
  - **Task B (blocking):** the main fix.
  - Add "report listing" before reserving (policy-check 1c).
  - Add admin actions to withdraw a listing or clear a description (1e).
- **Recommendation:** finish Task B before the production submission. It's the most likely
  rejection.

> **Required before production submission: Task B.** These two must ship, and be deployed to
> grabmyseats.com, before you apply for production or send the production release for review:
> 1. **Report a listing**, from the listing page before reserving (policy-check 1c).
> 2. **Block a user**, with the block list, both-way filtering and unblock (policy-check 1d).
>
> They're fine to miss during closed testing. Don't submit the production release without
> them.

### R3. User Data / Data safety mismatch (location, data location, deletion)

- **Why:** reviewers compare the Data safety form, the privacy policy and app behaviour.
  - The location prompt appears at launch.
  - Data is stored in the US.
  - Precise location is used on Android ≤11.
- **Evidence:**
  - The policy dated 3 November 2026 (Task A, once deployed) states approximate/precise location,
    storage with alerts, the US servers, in-app and web deletion, and retention.
  - `data-safety.md` gives the matching form answers.
- **Fix:**
  - Deploy the Task A text **before** submitting.
  - Fill in the region and log-retention TODOs (`privacy-policy-gaps.md`).
  - Make sure the Data safety form declares Approximate **and** Precise location.
- **Note:** a mistake I found while writing this doc. Task A's policy text says notifications
  include "the venue". The code sends only the city or "near you", never the venue
  (`backend/src/jobs/matchAlerts.ts:454-457`). It's harmless (it says we send *more* than we do)
  but inaccurate. **Fixed (Task A):** the policy now states the exact contents, and the gaps doc
  section "Push notification contents" shows how they map to the code.

### R4. App access: reviewer could not sign in or reach features

- **Why:**
  - OTP sign-in and invite-only sign-up.
  - A reviewer who uses "Sign up" without reading the instructions hits the invite-code wall.
  - Or `REVIEW_EMAIL`/`REVIEW_OTP` were unset after a deploy.
- **Evidence:** the reviewer code path bypasses invites (`auth.ts:284`), and the instructions in
  `app-access.md`.
- **Fix:**
  - Before every submission, check the server log shows `[review-login] ENABLED for …` after
    the last deploy.
  - Say "use **Sign in**, not Sign up" first in the instructions.
  - Add the sample ticket image link and the screen recording (section 3).

### R5. Permissions: location requested at launch without context

- **Why:** Play's User Data policy wants permission requests in context. Data that's used in a
  way users might not expect (location saved with an alert) needs a prominent disclosure.
- **Evidence:**
  - Foreground only, no background location.
  - COARSE on Android 12+.
  - FINE only on API ≤30, where Android has no approximate option (`AndroidManifest.xml:61-70`).
  - Location is core to "tickets near you".
  - Denying still works (city picker).
- **Fix (small; not done):**
  - Request location only after a "Use my location" tap, or auto-detect only when permission was
    already granted (`navigator.permissions`).
  - Add the line "We'll save this location with your alert" in `AlertForm`
    (policy-check item 3).

**Also possible, less likely:**
- **Metadata:** the "invite-only" listing text while `REQUIRE_REFERRAL_FOR_SIGNUP` is off. Use the
  fallback wording in `store-listing.md`.
- **Illegal activities, around ticket resale:** policy-check item 6. The Terms require the right
  to transfer and fair pricing.
- **Account deletion:** should pass (`policy-check.md` item 2).
