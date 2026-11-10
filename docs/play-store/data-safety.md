# Play Console - Data safety answers

Based on the code as of 2026-11-03 (branch `master`, uncommitted Android work included).
**Updated 2026-11-03 (Task A)** to match the privacy policy dated 3 November 2026
(`frontend/src/content/legal/privacy.ts`). Policy section numbers below are the new ones: 5 is
"Where your data is stored", and 6 is "How long we keep it".
Line numbers are approximate anchors (`file:line`), taken when this was written.

**Legend:** **UNCERTAIN** = could not be proven from the repo, or Play's definitions can be read
two ways. Each one says what to check and which answer we recommend.

Play definitions used (Data safety help page, support.google.com/googleplay/android-developer/answer/10787469):

- **Collected** = transmitted off the device. Data processed only in memory ("ephemerally") is still
  collected, but you can tick "processed ephemerally".
- **Shared** = transferred to a third party, **except** to a *service provider* processing it on our
  behalf, for *legal* reasons, on a *user-initiated* action, or when fully *anonymised*.
- **Optional** = the user can choose whether it is collected (an opt-in or opt-out), and the app
  still works without it.

---

## 1. Section-level answers

| Question | Answer | Evidence |
|---|---|---|
| Does the app collect or share any required user data types? | **Yes** | See section 3 |
| Is all user data encrypted in transit? | **Yes** | App loads only `https://grabmyseats.com` (`frontend/capacitor.config.ts`). Release builds set `usesCleartextTraffic=false` (`frontend/android/app/build.gradle`, `AndroidManifest.xml:14`). API is HTTPS behind Caddy (`trust proxy`, `backend/src/app.ts`). Push goes over FCM (TLS). |
| Do you provide a way for users to request that their data is deleted? | **Yes** | In app: Account → "Delete my account" (`frontend/src/app/account/page.tsx:247`, `frontend/src/app/account/delete/page.tsx`) → `POST /api/users/me/delete/send-code` (`backend/src/routes/users.ts:470`) + `DELETE /api/users/me` (`users.ts:493`). Web: `https://grabmyseats.com/delete-account` (`frontend/src/app/delete-account/page.tsx`) |
| Account creation methods | **Username and other authentication** → choose "OTP / one-time code by email" (phone OTP is code-ready but off in prod, see note) | `backend/src/routes/auth.ts:77` (otp/request), `auth.ts:268` (otp/verify). SMS is a console stub only (`backend/src/lib/sms/index.ts`), so phone sign-in is not offered in production (`phoneOtpAvailable()`). |
| Delete account URL | `https://grabmyseats.com/delete-account` | `frontend/src/app/delete-account/page.tsx` |
| Independent security review | No (not done) | - |
| Committed to Play Families policy | Not applicable: 18+ only (`frontend/src/content/legal/terms.ts:37`) | - |

**UNCERTAIN (encryption between servers):** server-to-provider links (backend → Supabase Postgres,
→ Upstash Redis, → SMTP) depend on the connection strings in the server's `.env` or Secrets
Manager, which I did not read. Play's question is about data in transit from the app, so the answer
is still **Yes**. Even so, confirm the Redis URL is `rediss://`, Postgres uses `sslmode=require`,
and SMTP uses TLS/STARTTLS.

---

## 2. Third parties: service provider or "sharing"?

| Third party | What it receives | Play classification | Reasoning / evidence |
|---|---|---|---|
| **Supabase** (Postgres) | All stored data | **Service provider** - not sharing | Database host on our behalf (`backend/prisma/schema.prisma`) |
| **Upstash** (Redis) | OTP codes (5 min TTL, `backend/src/lib/otpStore.ts:4`), email-verification and pending-signup tokens, rate-limit counters keyed by IP/identifier (`backend/src/middleware/rateLimit.ts`), Nominatim cache | **Service provider** | Short-lived cache on our behalf |
| **AWS** (EC2) / **Vercel** | All API traffic / page requests (IP, user agent) | **Service provider** | Hosting |
| **Cloudinary** | Profile photos (`backend/src/routes/users.ts` PATCH /me/profile ~L223), fraud-report evidence (`backend/src/routes/fraudReports.ts` ~L86), email-forward files (escrow only, `backend/src/routes/transactions.ts` ~L374) | **Service provider** | Storage on our behalf, via `backend/src/lib/storage/CloudinaryStorageProvider.ts` |
| **Google Cloud Vision** | Ticket screenshot image, for OCR (`POST /api/listings/ocr`, `backend/src/routes/listings.ts:446`, `backend/src/lib/ocrVision.ts`) | **Service provider** | Processes the image for us and returns text. We don't store the image (`listings.ts` ~L336, multer `memoryStorage` in `backend/src/middleware/upload.ts:8`) |
| **Firebase Cloud Messaging** | FCM token, notification title/body (event name, show date, free seats, and "near you" or the alert's city; never venue, price or anyone's personal data) and a path to the listing (`backend/src/lib/push/FcmPushSender.ts:45`, `backend/src/jobs/matchAlerts.ts:456`) | **Service provider** | Delivers our notifications. FCM is not an analytics SDK here (only `@capacitor/push-notifications`, no Firebase Analytics) |
| **SMTP email provider** | Email address, OTP code, verification link | **Service provider** | `backend/src/lib/email/SmtpEmailProvider.ts` |
| **OpenStreetMap Nominatim** | Venue search text typed by a seller (not personal data). Called from the backend, so OSM sees our server IP, not the user's | **Not user data → nothing to declare** | `backend/src/lib/geocode.ts:17`, `POST /api/listings/geocode` (`listings.ts:485`) |
| **OpenStreetMap tile servers** | The user's **device** requests map tiles directly (IP address + tile area) on the seller's venue picker only | **UNCERTAIN** - see note | `frontend/src/components/sell/VenuePicker.tsx:83` |
| **Razorpay** | Nothing today: `PAYMENT_MODE=contact_only` | **Not active** - declare nothing now | Re-do this form before switching to escrow (`backend/src/lib/razorpay.ts`) |
| **Other users (buyer ↔ seller)** | Seller's name, phone, WhatsApp flag, rating summary go to a buyer who reserves (`listings.ts` ~L985-1010, `transactions.ts:678-720`) | **UNCERTAIN - recommend "not shared"** | See note |

**Note - OSM tiles:** the device sends its IP address and the area being viewed straight to
`tile.openstreetmap.org`, which is not acting as our processor.
- **Recommended:** declare nothing. The tiles show the venue the seller searched for, not where the
  user is.
- **Better long-term fix:** use a tile provider we have a processing agreement with, or proxy the
  tiles through our server.

**Note - contact sharing:** the seller agrees by publishing a listing. The Terms (`terms.ts:51`) and
the policy (section 3) say a buyer who reserves sees the seller's name, phone, WhatsApp flag and
rating summary, and the seller can see the same about the buyer.
The buyer then starts each transfer by tapping Reserve. Play exempts "user-initiated" transfers, so
**recommended:** don't mark Name/Phone as shared. Whichever box you tick, the privacy policy must
describe this sharing (it already does).
- **Conservative alternative:** mark Name and Phone number as **Shared**, purpose "App
  functionality". There is no downside except that the label reads stricter.

---

## 3. Per data type

Columns: **Collected** / **Shared** / **Optional?** / **Ephemeral?** / **Deletable** / **Purposes**.
"Deletable" means removed or anonymised by account deletion (`backend/src/lib/accountDeletion.ts:77`).

### Personal info

| Type | Collected | Shared | Optional | Deletable | Purpose | Evidence |
|---|---|---|---|---|---|---|
| **Name** | Yes | No (see contact note) | **Required**: asked on the welcome step, and needed to list or reserve | Yes, nulled | App functionality, Account management | `User.name`/`fullName` (`schema.prisma`), `POST /api/auth/complete-profile` (`auth.ts:413`), `frontend/src/app/login/welcome/page.tsx` |
| **Email address** | Yes | No | Required (only sign-in method in prod) | Yes | Account management, App functionality (OTP), Fraud prevention | `auth.ts:77`, `users.ts:281` |
| **User IDs** | Yes (internal user ID, referral code) | No | Required | Yes (referral code cleared) | Account management, App functionality | `User.id`, `User.referralCode` |
| **Address** | Yes, only if the user adds it | No | **Optional** | Yes | App functionality (profile) | `PATCH /api/users/me/profile` (`users.ts:125`) |
| **Phone number** | Yes | No (see contact note) | Required to **sell** (`listings.ts:191`), optional otherwise | Yes | App functionality (buyer contacts seller), Fraud prevention | `users.ts:125`, `welcome/page.tsx` |
| **Other info** | Yes: date of birth, gender (optional profile fields), WhatsApp yes/no flag | No | **Optional** | Yes | App functionality | `User.dateOfBirth`, `User.gender`, `User.hasWhatsapp` |
| Race, politics, religion, sexual orientation | **No** | - | - | - | - | No such fields in `schema.prisma` |

### Financial info

| Type | Answer | Evidence |
|---|---|---|
| Payment info / credit score / other financial info | **No** | `PAYMENT_MODE=contact_only`: no payment taken. Razorpay is dormant |
| **Purchase history** | **UNCERTAIN - recommend Yes** (collected, not shared, required, deletable/anonymised, App functionality) | A reservation is stored as a `Transaction` (listing, seats, price) linked to the buyer (`listings.ts:805`). No money moves through us, but it is a record of what the user bought. After deletion the rows stay, unlinked from the person (`accountDeletion.ts`, `frontend/src/lib/accountDeletionCopy.ts`) |

### Location

| Type | Collected | Shared | Optional | Ephemeral? | Deletable | Purpose | Evidence |
|---|---|---|---|---|---|---|---|
| **Approximate location** | Yes | No | **Optional**: the user can deny and pick a city | **No**: search requests use it ephemerally, but **alerts store it** | Yes, alerts deleted | App functionality (nearby listings, "notify me near here") | `frontend/src/hooks/useSearchLocation.ts:22` (asks on page load), `frontend/src/lib/geolocation.ts:17`, `GET /api/listings/search?lat&lng` (`listings.ts:529`, not stored), `TicketAlert.lat/lng` via `POST /api/alerts` (`backend/src/routes/alerts.ts:74,194`, `frontend/src/components/alerts/AlertForm.tsx:91`) |
| **Precise location** | **Yes, Android 11 and below only** (`ACCESS_FINE_LOCATION maxSdkVersion=30`, `AndroidManifest.xml:68`). Android 12+ gets approximate | No | Optional | No (stored on alerts) | Yes | App functionality | As above. In escrow mode only, check-in GPS is also stored (`transactions.ts` check-in, `Transaction.buyerCheckInLat`). That mode is off |

The venue lat/lng on a listing (`Listing.theaterLat/Lng`, `VenuePinVote`) is the cinema or stadium,
not the user, so it isn't user location. **UNCERTAIN:** a seller's `VenuePinVote` links a venue
position to the user. It's not their location, so don't declare it.

**Escrow-mode gap (not active):** `Transaction.*CheckInLat/Lng` is **not cleared** by
`deleteUserAccount`. Fix that before switching on escrow.

### Personal messages

| Type | Answer | Evidence |
|---|---|---|
| Emails / SMS / Other in-app messages | **No** | No messaging between users. The buyer gets a `tel:` / WhatsApp link and talks outside the app (`frontend/src/components/ui/ContactPhone.tsx:29`). We send OTP emails, but we don't collect the user's emails |

### Photos and videos

| Type | Collected | Shared | Optional | Ephemeral? | Deletable | Purpose | Evidence |
|---|---|---|---|---|---|---|---|
| **Photos** | Yes | No | Profile photo and report evidence: **optional**. Ticket screenshot: **required to sell** (`terms.ts:46`) | Ticket screenshot: **yes, ephemeral** (memory only, OCR via Vision and barcode read, then dropped; only a hash is kept: `listings.ts` ~L336). Profile photo and evidence: **stored**, at unlisted Cloudinary links (not private; policy section 4) | Profile photo: deleted from Cloudinary on deletion (`accountDeletion.ts:171`). **Evidence: kept 3 years** (`backend/src/jobs/purgeDeletedAccountRecords.ts:6`) | App functionality (profile), Fraud prevention, security and compliance (ticket check, reports) | `listings.ts:184,446`, `users.ts:125`, `fraudReports.ts` |
| Videos | **No** | - | - | - | - | - | Upload filters are `image/*` (`backend/src/middleware/upload.ts:11`). Evidence also allows PDF |

Because photos are both stored and processed ephemerally, Play's form won't accept "ephemeral" for
the whole type. Tick "collected", leave "processed ephemerally" **unticked**.

### Audio files

**No.**

### Files and docs

| Type | Answer | Evidence |
|---|---|---|
| **Files and docs** | **Yes**: PDF evidence files on fraud reports (`frontend/src/components/report/ReportUserButton.tsx:101` `accept="image/*,application/pdf"`). The evidence upload has no file-type filter (`upload.ts:38`). Collected, not shared, optional, Fraud prevention. **Kept 3 years after deletion** (still "deletable" via the purge) | `fraudReports.ts` |

Email-forward attachments (`transactions.ts` ~L374) exist only in escrow mode. Not active, but
**not cleared by account deletion**. Fix before enabling.

### Calendar / Contacts

**No.** Sharing uses the system share sheet (`frontend/src/lib/share.ts`). We never read contacts.

### App activity

| Type | Collected | Shared | Optional | Deletable | Purpose | Evidence |
|---|---|---|---|---|---|---|
| **App interactions** | Yes: listing views, contacts (reveals), points/referrals | No | Required (automatic) | Yes, deleted | App functionality (view and contact counts), Fraud prevention | `ListingView` upsert (`listings.ts` ~L751), `ListingContact` (`listings.ts` ~L1005), `PointsLedger` |
| **In-app search history** | **UNCERTAIN - recommend Yes**: free-text search isn't stored, but an alert stores the search text (`TicketAlert.titleQuery`) as a saved search | No | **Optional** (only if the user creates an alert) | Yes | App functionality | `alerts.ts:194` |
| Installed apps | **No** | | | | | |
| **Other user-generated content** | Yes: listing descriptions (≤300 chars, `shared/src/listingDetails.ts:121`), rating stars and comments (no screen shows comments; the API returns them without the rater's name: `backend/src/lib/ratingSummary.ts:19`), fraud-report reason and text (`FraudReport.reason`, `backend/src/routes/fraudReports.ts`) | No | Optional | Descriptions nulled. Rating comments cleared, stars kept anonymised. **Report text kept 3 years** | App functionality, Fraud prevention | `listings.ts:184`, `transactions.ts` /:id/rate, `fraudReports.ts` |
| **Other actions** | Yes: listings created (event, venue, showtime, seats, price, booking ID, ticket fingerprint), and when the account was created on a screen showing the Terms/Privacy consent line (`User.termsAcceptedAt`, new in Task A; not a separate Play data type) | No | Required to sell | Live ones withdrawn. **Past listings kept**, including `bookingId` and fingerprint, unlinked from personal fields | App functionality, Fraud prevention | `schema.prisma` `Listing`, `accountDeletion.ts` |

### Web browsing

**No.**

### App info and performance

| Type | Answer | Evidence |
|---|---|---|
| Crash logs | **No** | No crash SDK (no Crashlytics/Sentry in `frontend/package.json` or `backend/package.json`) |
| Diagnostics | **No** | No analytics SDK. Server `console.*` logs are operational |
| Other app performance data | **No** | |

**UNCERTAIN:** host-level logs (Caddy access logs on EC2, Vercel request logs) record IP and user
agent. Play treats IP address as part of "Device or other IDs" only when it's used as an
identifier. We use it only for short rate-limit windows (`middleware/rateLimit.ts`), plus one
reviewer-login log line (`auth.ts:290`). **Recommended:** don't declare IP. Do check how long Caddy
and Vercel keep logs, and put that in the privacy policy (see privacy-policy-gaps.md).

### Device or other IDs

| Type | Collected | Shared | Optional | Deletable | Purpose | Evidence |
|---|---|---|---|---|---|---|
| **Device or other IDs** | Yes: FCM registration token | No (FCM is a service provider) | **Optional**: only after the user allows notifications (Android 13+ runtime prompt, asked when the first alert is created: `AndroidManifest.xml:59`) | Yes: deleted on sign-out, on account deletion, or when FCM says it's invalid | App functionality (notifications) | `PushToken` model, `POST/DELETE /api/push/tokens` (`backend/src/routes/pushTokens.ts:26,68`) |

No advertising ID: no ads SDK. Don't declare `AD_ID`. Answer **"No"** to the advertising ID
question in Play Console → App content.

---

## 4. Summary of checkboxes to tick

- **Personal info:** Name, Email address, User IDs, Address, Phone number, Other info.
- **Financial info:** Purchase history (recommended; UNCERTAIN).
- **Location:** Approximate location, Precise location.
- **Photos and videos:** Photos.
- **Files and docs:** Files and docs.
- **App activity:** App interactions, In-app search history (recommended; UNCERTAIN), Other
  user-generated content, Other actions.
- **Device or other IDs:** Device or other IDs.
- **For every type:**
  - **Shared:** No (see the contact-sharing note in section 2).
  - **Encrypted in transit:** Yes.
  - **Deletion request:** Yes.

## 5. Re-do this form if

- `PAYMENT_MODE` is switched to `escrow`. That adds Razorpay (financial info, which Razorpay
  processes as an independent payment processor, so likely "shared"), check-in GPS and
  email-forward files.
- A real SMS provider is wired in (`backend/src/lib/sms/index.ts`). Add it as a service provider.
- Any analytics or crash SDK is added.
