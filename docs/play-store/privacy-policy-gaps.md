# Privacy policy vs. what the code does

The live policy is in `frontend/src/content/legal/privacy.ts`, shown at `/privacy`.

## Status - 3 November 2026 (Task A)

The P1-P3 items below are **applied** to the live policy, now dated 3 November 2026. A few were
reworded where a value couldn't be verified, as listed below. The live page has **no
placeholders**; the open values are here.

> **TODO - values needed from you (not on the live page):**
> - **TODO(region):** Supabase project region: ____ (Supabase dashboard → Project Settings → General).
> - **TODO(region):** Upstash Redis region: ____ (Upstash console → database → Details).
> - **TODO(region):** Cloudinary storage region, Vercel function region, SMTP provider name and region: ____.
> - **TODO(retention):** how long Caddy access logs on EC2 and Vercel request logs are kept: ____ days.
>
> Until these are filled in, the live text says only what's verified:
> - the backend runs on AWS in the United States (`infra/variables.tf:2`, `us-east-1`);
> - the other providers "may store or process data in other countries";
> - rate-limit data is deleted within 24 hours (longest window is `DAY`, `backend/src/middleware/rateLimit.ts:83`);
> - hosting logs are kept "for a limited time".
>
> Once you send the values, the two sentences to make specific are in section 5 (Where your data
> is stored) and section 6 (How long we keep it).

**Changes from the text proposed below:**
- **Section numbers:** the new "Where your data is stored" is section 5, and the later sections
  moved down one (6-12). Nothing linked to the old numbers (checked with a grep of `frontend/src`).
- **Data location:** names only AWS/US, as described above.
- **Rating comments (correction):** this doc first said comments are shown to buyers. They are
  **not shown on any screen**. They're collected (`frontend/src/app/account/purchases/page.tsx:67`)
  and returned inside `ratingSummary.recentComments` by the API (`backend/src/lib/ratingSummary.ts:19`),
  which no page renders. The live text says comments "may be shown to other users with that
  seller's rating, without your name", which is accurate for the API.
- **Report evidence:** the live text says these files sit at **unlisted links**: not published or
  shown to other users, but anyone with the link could open them. It does **not** say private.
  **Follow-up (not done):** upload evidence as Cloudinary `authenticated` and serve signed,
  short-lived URLs from the admin API (policy-check.md item 9).
- **Reports:** the text now mentions the reason picker, which is new in this task
  (`FraudReport.reason`).

Severity:
- **P1:** Play reviewers or a user could call this a false statement. Fix before submission.
- **P2:** missing detail that Play's User Data policy or the DPDP Act expects.
- **P3:** wording or accuracy.

---

## P1 - Deletion is described as email-only (section 6, line 77)

**Current:**
> Request deletion of your account and personal data at any time, by emailing support@grabmyseats.com.

**Reality:**
- In-app deletion exists: Account → Delete my account (`frontend/src/app/account/delete/page.tsx`,
  `DELETE /api/users/me` at `backend/src/routes/users.ts:493`).
- The public page `https://grabmyseats.com/delete-account` also exists.
- Play's account-deletion policy expects the policy and the Console to point to the same paths.

**Replace with:**
> - Delete your account and personal data at any time: in the app or on the website, open Account and tap "Delete my account". Deletion happens straight away. If you can't sign in, follow the steps at https://grabmyseats.com/delete-account or email support@grabmyseats.com from the address on your account.

## P1 - Location: precise location and stored alert locations are not mentioned (section 1, line 40)

**Current:**
> Approximate location: the city you choose. If you allow it, your device's location may be used to show nearby listings.

**Reality:**
- The home and search pages ask for device location as soon as they load
  (`frontend/src/hooks/useSearchLocation.ts:22`).
- Android 12+ grants approximate location. Android 11 and below grant **precise** location
  (`AndroidManifest.xml:68`).
- Search uses it without storing it (`GET /api/listings/search`).
- A ticket alert set "near me" **stores** the coordinates with the user's account
  (`TicketAlert.lat/lng`, `backend/src/routes/alerts.ts:74`).
- It is deleted with the alert or the account.

**Replace with:**
> - Location: the city you choose, or, if you allow location access, your device's location. On Android 12 and later the app asks only for approximate location; on Android 11 and earlier, Android may share your precise location. We use it to show listings near you and do not store it for searches. If you create a ticket alert for "near me", we store that point and the distance you choose with the alert, until you delete the alert or your account.

## P1 - Cloudinary scope is incomplete (section 4, line 59)

**Current:**
> Image storage: Cloudinary (profile photos and report evidence).

**Reality:**
- Report evidence can also be a **PDF** (`ReportUserButton.tsx:101`).
- If escrow mode is ever enabled, ticket-delivery files are stored too (`transactions.ts` ~L374).

**Replace with:**
> - File storage: Cloudinary (profile photos, and the images or PDFs you attach to a report).

(Add ", and ticket files sent through a deal" only if escrow mode is switched on.)

## P1 - "What other users can see" overstates and understates (section 3, lines 52-53)

**Reality:**
- **Name:** shown only to a buyer who reserves (in the contact block). Listing pages show the
  rating summary and Verified badge, not the name (`listings.ts:712-783`).
- **Rating comments:** the API returns comments you **write** about a seller as "recent comments"
  (`backend/src/lib/ratingSummary.ts:19`). No screen displays them today (see the Status
  correction above).
- **WhatsApp:** whether you use WhatsApp is shown alongside your number.
- **Two directions:** a seller can see the buyer's contact too, from the transaction
  (`transactions.ts:678`).

**Replace the section 3 bullets with:**
> - On your listings, other users see the listing details you entered, your rating summary and your Verified badge.
> - When a buyer reserves seats on your listing, that buyer sees your name, phone number, whether you use WhatsApp, and your rating summary. The seller of a listing you reserve can see the same details about you. Do not list or reserve tickets if you are not comfortable with this.
> - Comments you write when rating a seller are shown to other users with that seller's rating, without your name.
> - We do not show your email address, date of birth, gender or address to other users.

Verified: comments are selected with stars and date only (`ratingSummary.ts:22`), never the
rater's name.

## P2 - Map tiles and venue search providers are missing (section 4)

**Reality:**
- The seller's venue picker loads map tiles directly from OpenStreetMap, which sees the device's
  IP address (`frontend/src/components/sell/VenuePicker.tsx:83`).
- Venue search text goes from our server to OpenStreetMap Nominatim (`backend/src/lib/geocode.ts:17`).

**Add to section 4:**
> - Maps: when you pick a venue while listing a ticket, your device loads map images from OpenStreetMap, which receives your IP address as part of that request. Venue names you search for are looked up through OpenStreetMap's Nominatim service from our servers, without your personal details.

## P2 - No data location / cross-border transfer statement

**Reality:**
- The backend server is in AWS **`us-east-1` (N. Virginia, USA)**. That's the only region in
  `infra/variables.tf:2` and the infra tfvars. So data **does** leave India, even for an
  India-only service.
- I couldn't check the regions for Supabase, Upstash, Vercel, Cloudinary or the SMTP provider
  from the repo. **UNCERTAIN:** check each dashboard.
- Google Vision and FCM are global services.

**Add a new section after section 4 (fill in the brackets after checking each dashboard):**
> ## 4a. Where your data is stored
> - Your data is stored and processed outside India. Our backend servers are run by Amazon Web Services in the United States, our database is hosted by Supabase in [region], and short-lived data such as one-time codes is held by Upstash in [region]. Our other service providers (Vercel, Cloudinary, Google Cloud Vision, Google Firebase Cloud Messaging and our email provider) may process data in other countries. We choose providers that protect data under contract, and we transfer data abroad only as allowed under the Digital Personal Data Protection Act, 2023 and any restrictions notified under it.

## P2 - "Technical logs are kept for a limited time" is vague (section 5, line 72)

**Reality:**
- The app has no request-logging middleware.
- IP addresses go into rate-limit counters, which expire within 10 minutes to 1 day
  (`backend/src/middleware/rateLimit.ts`).
- Caddy and Vercel keep their own access logs. **UNCERTAIN:** I didn't check how long.

**Replace with:**
> - Security data such as IP addresses used for rate limiting is kept for no more than 24 hours. Server and hosting logs (which include IP address and browser type) are kept for up to [N] days and then deleted.

## P2 - What is kept after deletion is incomplete (section 5, line 69)

**Reality:** compared with `backend/src/lib/accountDeletion.ts` and
`frontend/src/lib/accountDeletionCopy.ts`, the policy leaves out:
- Past listings and reservations are **kept, unlinked from you**. That includes the booking ID and
  the ticket fingerprint.
- Star ratings you gave are kept without your comment.
- Ratings you received stay part of the seller's average.
- Report evidence files are kept for 3 years, then deleted
  (`backend/src/jobs/purgeDeletedAccountRecords.ts`).

**Replace line 69 with:**
> - When you delete your account, we delete your email address, phone number, name, profile details and photo, your ticket alerts, the record of listings you viewed or contacted, your points, referral link and notification tokens, and the comments in ratings you gave. Your live listings are withdrawn. Past listings and reservations, and the star ratings you gave, are kept without anything that identifies you, so other users' histories and ratings stay accurate.

**Add to the 3-year bullet (line 70):** "...including any files attached to those reports."

## P2 - Push notification contents (section 4, line 62)

**Current:**
> Notifications include only the event, date and number of seats...

**Reality (corrected 2026-11-03).** An earlier version of this doc wrongly said the venue is
included. What `buildMessage` (`backend/src/jobs/matchAlerts.ts:446-480`) and
`FcmPushSender.send` (`backend/src/lib/push/FcmPushSender.ts:45-46`) actually send:
- title "Tickets available";
- body, one match: event name (links and control characters removed, up to 40 characters),
  show date, free seats, then " near you" (point alert), " in <city>" (city alert) or nothing;
- body, several matches: "N new matches:" plus up to two event names ("and N more");
- data: `path`, i.e. `/buy/<listingId>` or `/account/alerts`.

There's no venue, price, seller or buyer data.

**Applied (live text, section 4):**
> A notification about one match contains only the event name, the show date, the number of seats available and either "near you" or the city of your alert; a notification about several matches contains only how many there are and up to two event names. Each also carries a link that opens the match in the app. Notifications never include your personal details or anyone else's, the venue or the price.

## P3 - "Saved searches" (section 1, line 36)

There's no separate saved-search feature; alerts are the saved searches. Change "saved searches and
ticket alerts" to "ticket alerts (including the search words you save with them)".

## P3 - The phone number is unverified in production

The SMS provider is a console stub (`backend/src/lib/sms/index.ts`), so section 4 line 63 ("when we
turn it on") is correct. No change is needed. Just remember to name the vendor when you turn it on.

## P3 - Section 9 "sign-in token on your device"

This is accurate: an httpOnly session cookie (`backend/src/routes/auth.ts:213`), and a referral code
in `localStorage` (`frontend/src/lib/referralCode.ts:29`). No change.

## OK - already matches the code

- **Children:** 18+ (section 8), matching `terms.ts:37`. Keep it. In Console → Target audience,
  choose 18+ only.
- **Contact email:** `support@grabmyseats.com` and a postal address (section 11). Make sure the
  Console's developer email is a mailbox someone reads.
- **Ticket screenshot:** not stored, fingerprint only (line 35), matching `listings.ts` ~L336.
- **No sale of data, no ads** (line 57): there's no ads SDK.
- **Notification tokens:** deleted on sign-out, on deletion, or when the token is invalid (line 73),
  matching `pushTokens.ts:68` and `accountDeletion.ts`.
- **Third parties named:** AWS, Vercel, Supabase, Upstash, Cloudinary, Vision, email, FCM, SMS.

## Also link the policy where Play expects it

- **Console:** Privacy policy URL `https://grabmyseats.com/privacy`. It must load without signing
  in. **UNCERTAIN:** check that `frontend/src/middleware.ts` doesn't redirect `/privacy` or
  `/delete-account` to login. I saw only account routes being protected.
- **In app:** Account → Privacy Policy (`frontend/src/app/account/page.tsx:172`) exists. A link on
  the sign-up screen is recommended too (see policy-check.md, UGC).
