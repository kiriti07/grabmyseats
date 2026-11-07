# Google Play policy check

The code as of 2026-11-03, checked against current Play policy text, read 2026-11-03:
- User Generated Content: support.google.com/googleplay/android-developer/answer/9876937
- Account deletion: .../answer/13327111
- Data safety: .../answer/10787469
- Metadata: .../answer/9898842
- Graphic assets: .../answer/9866151

**Verdicts:**
- **PASS:** evidence in code.
- **FAIL:** a requirement isn't met. Fix before submitting.
- **UNSURE:** depends on how a reviewer reads it, or on something I couldn't check.

**Status, 3 November 2026 (Task A):**
- **Done:** report reasons, `termsAcceptedAt` plus the consent line, and the terms and privacy
  text.
- **Task B (separate plan and migration):** blocking.
- **Still proposals:** listing reports, admin listing actions, the location prompt and evidence
  signing.

## Summary

| # | Area | Verdict |
|---|---|---|
| 1a | UGC - users accept terms before posting | **PASS** (Task A) |
| 1b | UGC - objectionable content defined and prohibited | **PASS** (Task A) |
| 1c | UGC - in-app reporting of content and users | **FAIL** (partial). Reasons done; listings still can't be reported before reserving |
| 1d | UGC - in-app blocking of users | **UNSURE** (likely asked for). Task B |
| 1e | UGC - moderation | **UNSURE** (partial) |
| 2 | Account deletion (in-app + web URL) | **PASS** |
| 3 | Permissions (location, notifications) | **PASS**, with one UNSURE |
| 4 | Deceptive behavior / metadata accuracy | **FAIL** until invite-only is actually on |
| 5 | WebView app / minimum functionality | **UNSURE** (likely pass) |
| 6 | Ticket resale | **UNSURE** |
| 7 | User data - review account sees real users' contacts | **UNSURE** |
| 8 | User data - privacy policy matches the Data safety form | **PASS** (Task A). Regions and log retention are still TODOs in privacy-policy-gaps.md |
| 9 | User data - report evidence stored at public URLs | **UNSURE** |
| 10 | Target audience / children | **PASS** |
| 11 | Payments / Financial features | **PASS** (not applicable) |

---

## 1. User Generated Content

**Why it applies.** Users post content other users see:
- listing descriptions (≤300 chars; `shared/src/listingDetails.ts:121`), shown on listing detail;
- rating comments. No screen shows them, but the API returns them as "recent comments" in a
  seller's rating summary (`backend/src/lib/ratingSummary.ts:19`);
- one-to-one contact between buyer and seller after a reservation (phone or WhatsApp, outside
  the app).

### 1a. Terms accepted before creating UGC - PASS (fixed in Task A)

**Done:**
- `frontend/src/components/auth/TermsConsentNote.tsx` ("By creating an account you agree to the
  Terms & Conditions and Privacy Policy", with both links) sits under the button on the sign-up
  form (`IdentifierAuth.tsx`, signup intent). It's also on the "No account yet → Create an
  account" step (`frontend/src/app/login/verify/page.tsx`).
- `User.termsAcceptedAt` is set only when an account is created from one of those
  (`createAccountForVerifiedIdentifier`, `backend/src/routes/auth.ts`).
- Existing users stay null and are **never asked again**. The Play review account is created
  elsewhere (`lib/reviewAccess.ts`) and never gets it.
- Covered by tests in `referralOnlySignup.test.ts` and `reviewLogin.test.ts`.

Original finding:

- **Policy:** "Requires users accept the app's terms of use and/or user policy before users can
  create or upload UGC."
- **Evidence:**
  - No consent step or "By continuing you agree..." line in sign-up, the welcome step or the sell
    flow. A grep of `frontend/src` for agree/terms/privacy links found them only in
    `account/page.tsx`, `help/page.tsx` and the legal pages.
  - `POST /api/auth/otp/verify` and `/signup/confirm` record no acceptance
    (`backend/src/routes/auth.ts:268,356`).
- **Fix:**
  - **Minimum:** on `/signup`, add "By creating an account you agree to the [Terms] and [Privacy
    Policy]" with both links, next to the submit button. Show the same line on the
    `/login/welcome` step, because a "signin" that creates an account also goes through it.
  - **Better:** store `termsAcceptedAt` and `termsVersion` on `User`. That's a migration: show it,
    don't apply it.

### 1b. Objectionable content defined and prohibited - PASS (fixed in Task A)

**Done:** the zero-tolerance bullet below is now in Terms section 5
(`frontend/src/content/legal/terms.ts`).

Original finding:

- **Policy:** apps must define "objectionable content and behaviors" and prohibit them in their
  terms or user policies.
- **Evidence:** Terms section 5 (`frontend/src/content/legal/terms.ts:57-62`) prohibits:
  - fake tickets and scams;
  - harassment, threats and abuse;
  - misuse of contact details;
  - unlawful use.

  Section 3 (`terms.ts:44`) bans contact details in descriptions. There's **no** content rule for
  descriptions and rating comments: no ban on hate speech, sexual content, or defamatory or
  offensive text, and no zero-tolerance statement.
- **Fix:** add to Terms section 5 (proposed text):
  > - Post descriptions, ratings or comments that are offensive, hateful, sexual, threatening, defamatory or discriminatory, that contain personal information about someone else, or that are unrelated to the ticket or the deal. We have zero tolerance for this content and may remove it and suspend the account without notice.

### 1c. In-app reporting of objectionable content and users - FAIL (partial)

**Done in Task A (fix 3):**
- `FraudReport.reason`: FRAUD / OFFENSIVE / HARASSMENT / OTHER, default FRAUD, so existing rows
  read as FRAUD.
- A reason picker in `ReportUserButton.tsx`, the reason shown in the admin queue, and an
  unknown reason gets a 400.

**Open:** fix 1 (report a listing before reserving). Fix 2 isn't needed, because no screen shows
rating comments.

Original finding:

- **Policy:** "an in-app system for reporting ... objectionable UGC and users".
- **Evidence:**
  - **Users:** reportable, but **only from a reservation**. `ReportUserButton` appears only on
    `buy/[listingId]/page.tsx:279` (after reserving) and `transactions/[transactionId]/page.tsx:566,789`.
  - `POST /api/fraud-reports` (`backend/src/routes/fraudReports.ts`) needs a transaction,
    `reportedUserId` or `reportedPhone`. Only the transaction route is wired up in the UI.
  - **Listings and descriptions:** no "report this listing" on the listing detail page.
  - **Rating comments:** no way to report a comment.
  - The only report type is "fraud". There's no "offensive content" reason.
- **Fix:**
  1. Add a "Report listing" link on `/buy/[listingId]` before reserving. It could post
     `reportedUserId = listing.sellerId` plus a `listingId` field (needs a field on
     `FraudReport`: migration), or reuse the description text.
  2. ~~Add a "Report" link on each recent rating comment.~~ Not needed: no screen shows comments.
  3. Add a reason picker to the report form: Scam/fake ticket, Offensive content, Harassment,
     Other.

### 1d. In-app blocking of users - UNSURE (likely asked for)

- **Policy:**
  - The general bullet says "reporting **and blocking** objectionable UGC and users".
  - The examples require blocking for "public UGC" apps and for apps with 1:1 interaction
    features (direct messaging, tagging, mentioning).
  - So the text doesn't clearly say blocking is required for every UGC app.
- **Evidence:**
  - No block feature exists anywhere: no model in `backend/prisma/schema.prisma`, no route, no UI.
  - The 1:1 contact happens outside the app (phone or WhatsApp), where users can block with the
    phone's own tools.
  - Listing descriptions and rating comments are public UGC, though.
- **Risk:** reviewers often cite the general bullet. **Recommended fix** (smallest version that
  can be defended):
  - a `UserBlock(blockerId, blockedId)` table (migration: show, don't apply);
  - `POST/DELETE /api/users/:id/block`;
  - a "Block this user" action next to Report;
  - search, listing detail and reserve exclude the blocked person's listings for the blocker, in
    both directions;
  - alerts don't match blocked sellers (`alertMatching.ts`, `listings.ts:529`);
  - the blocked person's rating comments are hidden from the blocker.

### 1e. Moderation - UNSURE (partial)

- **Policy:** "UGC moderation, as is reasonable and consistent with the type of UGC hosted".
- **Evidence:**
  - **Automatic:** descriptions with contact details are rejected
    (`shared/src/listingDetails.ts:129` `containsContactDetails`). There's no profanity or abuse
    filter.
  - **Admin:** the staff panel can review fraud reports and review flags, resolve reports, and
    suspend, unsuspend or delete users (`backend/src/routes/admin.ts:65,85,120,168,218,259`).
    Suspension hides all of a user's listings (`listings.ts:608`).
  - **No admin action removes a single listing, clears a description, or removes a rating
    comment** (grep of `admin*.ts` for listing update/delete: none). Terms `terms.ts:44` promise
    "We may edit or remove descriptions", but there's no tool to do it short of suspending the
    user.
- **Fix:** add admin actions to withdraw a listing, clear a listing's description, and clear a
  rating comment. Also state a response target, e.g. "we review reports within 24 hours", in
  Help. **UNSURE:** that's an operational promise, so only add it if you can keep it.

## 2. Account deletion - PASS

- **In-app path, prominent:**
  - Account page → "Delete my account" (`frontend/src/app/account/page.tsx:247`).
  - Then `frontend/src/app/account/delete/page.tsx`: type DELETE, get a code if needed, confirm.
  - Backend: `backend/src/routes/users.ts:470` (send code) and `users.ts:493`
    (`DELETE /api/users/me`).
- **Deletes associated data:** `backend/src/lib/accountDeletion.ts:77`. It nulls the personal
  fields and deletes alerts, tokens, views, contacts, points and the profile photo
  (`accountDeletion.ts:171`). It also withdraws live listings.
- **Web resource, no app needed:**
  - `https://grabmyseats.com/delete-account` (`frontend/src/app/delete-account/page.tsx`).
  - It's public: `frontend/src/middleware.ts` protects only `/account` and `/admin`.
  - It names GrabMySeats, gives steps, and offers a `mailto:` support path for users who can't
    sign in.
  - It lists what's deleted and what's kept (`frontend/src/lib/accountDeletionCopy.ts`).
- **Retention disclosed:** the 3-year fraud records are on the page and in the policy (section 5).
- **Console:** Data safety → "Delete account URL" = `https://grabmyseats.com/delete-account`.
- **Caveats (not fails):**
  - The privacy policy still says email-only (privacy-policy-gaps.md, P1).
  - In escrow mode, check-in GPS and email-forward files are not cleared by deletion
    (`accountDeletion.ts`). Fix that before enabling escrow.

## 3. Permissions - PASS (one UNSURE)

| Permission | Why | Verdict |
|---|---|---|
| `INTERNET` | Loads the site | PASS |
| `POST_NOTIFICATIONS` | Ticket alerts. Asked in context when the first alert is created (`AndroidManifest.xml:59`, `frontend/src/lib/push.ts`) | PASS |
| `ACCESS_COARSE_LOCATION` | "Near me" search and alerts (`frontend/src/lib/geolocation.ts:17`) | PASS. Foreground only, core feature |
| `ACCESS_FINE_LOCATION` (`maxSdkVersion=30`) | Android ≤11 has no approximate-only grant. Capacitor's bridge asks for FINE there (`AndroidManifest.xml:61-70`, `docs/android-release.md`) | PASS. Explain it in the Data safety form (precise location declared) |
| Background location, storage, camera, contacts, SMS, phone | **Not requested** | PASS |

- **UNSURE: when location is asked.** The home and search pages call `navigator.geolocation` as
  soon as they load (`frontend/src/hooks/useSearchLocation.ts:22`), so the first launch shows the
  system location prompt with no in-app explanation. "Near me" location is also **stored** with
  an alert (`alerts.ts:74`).
- **Recommended fix:**
  1. Ask only after a "Use my location" tap. Show the city picker by default.
  2. In the "Notify me" form, add a line: "We'll save this location with your alert to find
     tickets near it."

  That counts as a prominent disclosure for a use users might not expect.
- **Advertising ID:** no ads SDK, so declare "No" (App content → Advertising ID).
  **UNSURE:** check that the merged manifest of the release AAB has no
  `com.google.android.gms.permission.AD_ID`. Firebase Messaging alone doesn't add it, but check:
  `bundletool dump manifest --bundle app-release.aab | grep -i ad_id`.

## 4. Deceptive behavior / metadata - FAIL until invite-only is on

- **The invite-only claim:**
  - store-listing.md says sign-up is invite-only, but `REQUIRE_REFERRAL_FOR_SIGNUP` is **not**
    set in production today (`backend/src/lib/config.ts:62`).
  - A listing that claims a behaviour the app doesn't have breaks the metadata and deceptive
    behaviour rules.
  - **Fix:** turn the flag on before publishing the listing, or use the "may be invite-only at
    times" sentence from store-listing.md.
- **Verified badge:** it means only email or phone confirmed (`terms.ts:54`). Users could read it
  as "verified ticket". The Terms explain it. **Recommended:** add a tooltip on the badge. Not a
  fail.
- **Listing service only, no payment:** accurate. `PAYMENT_MODE=contact_only`, and the
  `CONTACT_ONLY_DISCLAIMER` shows after reserving (`frontend/src/app/buy/[listingId]/page.tsx:282`).
  PASS.
- **Referral points:** "Redeem - Coming Soon" (`account/page.tsx:235`), and the Terms say points
  have no cash value. The store listing must not promise rewards; it doesn't. PASS.

## 5. WebView / minimum functionality - UNSURE (likely pass)

- **What a reviewer might flag:** the app is a Capacitor shell that loads `https://grabmyseats.com`
  (`frontend/capacitor.config.ts`). Play rejects apps that are "just a website" without the site
  owner's permission, and apps with too little functionality.
- **Evidence for passing:**
  - It's our own site.
  - It has native push (FCM), the native share sheet (`frontend/src/lib/share.ts`), an offline
    fallback page (`frontend/www/offline.html`) and native location permission handling.
  - Every feature is the same as on the web.
- **Fix if rejected:** point to the native features above in the appeal.

## 6. Ticket resale - UNSURE

- **What I found:** no Google Play developer policy specific to event-ticket resale. The
  ticket-reseller rules I found are **Google Ads** advertising policies (ads certification).
  They don't apply unless you run Google Ads for GrabMySeats.
- **Play policies that do apply:**
  - **Illegal activities:** the app must comply with local law. **UNSURE:** I'm not aware of a
    national Indian law that bans reselling cinema or event tickets, but state laws, event
    organisers' terms and venue rules may restrict transfers or above-face-value resale. Get
    local legal advice. This isn't something the code can show.
  - **Intellectual property / impersonation:** the listing and screenshots must not use
    BookMyShow, PVR, INOX, IPL or other brand names or logos. Use generic examples in
    screenshots (see screenshots.md).
  - **Payments:** physical goods and services are exempt from Play Billing, and no payment goes
    through the app anyway. PASS.
- **Existing mitigations:**
  - The Terms require that the user owns the ticket and may transfer it (`terms.ts:42`).
  - They ask for fair prices: "Listings priced far above the original face value may be
    removed" (`terms.ts:45`).
  - Duplicate tickets are blocked with a barcode fingerprint (`listings.ts` ~L336).
  - Listings expire after showtime.
- **Recommended:** a price cap or warning above face value would back up the Terms' fair-price
  line. Not required by Play.

## 7. Review account sees real users' contact details - UNSURE

- **Evidence:**
  - The reviewer can't reserve their own listing (`listings.ts:917`).
  - Real users can't see the reviewer's listings (`listings.ts:615,932`).
  - So the only way to test "contact seller" is to reserve a **real** listing, which reveals a
    real person's name and phone to Google's reviewer.
- **Why it matters:**
  - The privacy policy describes buyers seeing seller contacts, so it's arguably in scope.
  - But a test account harvesting real contacts is poor data hygiene.
- **Fix:** see the end of app-access.md. Best option: a demo seller visible only to the review
  account.

## 8. Privacy policy must match the Data safety form - PASS (fixed in Task A)

**Done:** the P1-P3 text is applied (policy dated 3 November 2026). The data regions and hosting-log
retention are still TODOs in privacy-policy-gaps.md. Until then the live text states only what's
verified.

Original finding:

- **Problem:** Play checks the policy against the form. Mismatches today:
  - deletion is described as email-only;
  - precise location and stored alert locations aren't mentioned;
  - data location isn't stated, and the servers are in the USA (`us-east-1`).
- **Fix:** apply the P1 and P2 items in [privacy-policy-gaps.md](privacy-policy-gaps.md).

## 9. Report evidence at public URLs - UNSURE

- **Evidence:**
  - Uploads use Cloudinary's default `upload` delivery type and return `secure_url`
    (`backend/src/lib/storage/CloudinaryStorageProvider.ts:21,38`).
  - Fraud evidence is stored as `raw` (`fraudReports.ts`).
  - Anyone who has the URL can open these files. The URLs are random (user ID + UUID), not
    listed anywhere, and shown only to staff.
- **Why it matters:** evidence can contain other people's personal data. It's not a Play
  violation as such. But the Data safety form says "encrypted in transit" (true), and a reviewer
  or user might expect access control.
- **Fix:** upload evidence with `type: "authenticated"` (or private) and serve signed URLs from
  the admin API. No migration is needed for new files.

## 10. Target audience and children - PASS

- 18+ in the Terms (`terms.ts:37`) and the policy (`privacy.ts:85`).
- **Console:** Target audience → **18 and over** only. "Appeals to children": No.
- No Families SDKs.

## 11. Payments and financial features - PASS (not applicable)

- No in-app purchases or subscriptions.
- Console → App content → Financial features: **"My app doesn't provide any financial
  features."** Razorpay escrow is dormant (`PAYMENT_MODE=contact_only`). Revisit if enabled.
