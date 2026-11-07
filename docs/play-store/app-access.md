# Play Console - App access

Console → Policy → App content → **App access** → "All or some functionality is restricted" →
**Add instructions**. Fill in the placeholders in Play Console only. **Never commit the real
values.**

| Console field | Value |
|---|---|
| Name | `GrabMySeats reviewer account` |
| Username / email | `<REVIEWER_EMAIL>` |
| Password | `<REVIEWER_CODE>` (a fixed 6-digit sign-in code, not a password) |
| Any other information | the text in the box below |

## Before you submit (do these on the server, not in this repo)

1. **Set the reviewer variables.** `REVIEW_EMAIL=<REVIEWER_EMAIL>` and `REVIEW_OTP=<REVIEWER_CODE>`
   must both be set in the backend's secrets.
   - The login works only while **both** are set (`backend/src/lib/reviewAccess.ts`).
   - The code must be 6 digits and not trivially guessable, or the server **refuses to boot**
     (`checkReviewLoginConfigAtStartup`).
   - **UNCERTAIN:** I haven't checked whether they are set in production now. Look for
     `[review-login] ENABLED for ...` in the backend log after a deploy.
2. **Use an address no real user has.** `<REVIEWER_EMAIL>` must not belong to a regular account,
   or the login is refused (`loginReviewAccount`). It does **not** need a working inbox.
3. **The invite code isn't needed.** The reviewer login is handled before any account lookup or
   invite check (`backend/src/routes/auth.ts:284`). The reviewer gets in even when
   `REQUIRE_REFERRAL_FOR_SIGNUP=true`. Tell the reviewer this so they don't look for an invite.
4. **Seed test data so every feature has something to show.** The reviewer's own listings are
   hidden from real users (`backend/src/routes/listings.ts:615,735,932`, `alertMatching.ts:77`).
   - Recommended: sign in as the reviewer yourself and create one listing at a well-known
     cinema with a showtime about a week out, so "My Listings" isn't empty.
5. **Privacy risk to fix or accept (UNCERTAIN, see policy-check.md item 7).** The reviewer can
   **reserve a real user's listing** and see that seller's real name and phone number.
   - Only the reverse direction is blocked: real users can't reserve the reviewer's listings
     (`listings.ts:932`).
   - The reviewer also **can't** reserve their own test listing, so today the contact flow can
     only be tested on a real listing. See the end of this file.
6. **Keep the login on until the review is done**, including any later updates. Turn it off by
   unsetting either variable. Any reviewer session then dies on its next request
   (`backend/src/middleware/auth.ts:24`).

## Text for "Any other information"

Paste as plain text. It's about 1,600 characters; check the Console's limit when you paste.

```
GrabMySeats signs users in with a one-time code instead of a password. Sign-up is invite-only, but the review account below does not need an invite code.

SIGN IN
1. Open the app and tap "Sign in" (or Account).
2. Enter the email <REVIEWER_EMAIL> and tap Continue/Send code.
3. Enter the code <REVIEWER_CODE>. No email is needed - this fixed code works only for this review account.
4. If asked for a name, enter any name and continue.

BROWSE AND SEARCH (no sign-in needed)
- Home: allow location, or choose a city (e.g. Hyderabad) to see listings near you.
- Search: type a movie or venue name. Tap a listing to see its details.

SELL A TICKET
- Tap Sell. Upload any ticket screenshot that shows a barcode/QR code; the app reads the event details from it. Pick the venue on the map, check the details, set seats and price, and publish.
- My Listings (Account > My Listings) shows it; you can edit, mark as sold or withdraw it.
- Listings made by this review account are visible only to this account.

BUY / CONTACT A SELLER
- Open a listing, choose the number of seats and reserve it to see the seller's contact details (name, phone, WhatsApp). No payment is taken in the app; buyer and seller arrange the deal themselves. Listings belong to real people, so please do not call or message the seller. A short video of this flow is attached [delete this sentence if no video is provided].

TICKET ALERTS (push notifications)
- Search for an event, tap "Notify me", choose a city or "near me", and save. Allow notifications when asked. Manage alerts under Account > My Alerts.

REPORT A USER
- On a reservation (Account > My Purchases > a reservation), tap "Report this user", describe the problem and optionally attach a file.

ACCOUNT
- Account > Edit Profile: name, phone, photo and optional details.
- Account > Share GrabMySeats: invite link and invite code (Refer & Earn).
- Account > Privacy Policy / Terms & Conditions / Help Center.
- Account > Delete my account: type DELETE and confirm. Deleting the review account is fine; signing in again creates a fresh one.

Contact: support@grabmyseats.com
```

## Where each step is backed by code

| Step | Code |
|---|---|
| Reviewer code accepted for one email only | `backend/src/lib/reviewAccess.ts` `isReviewLoginAttempt`, `backend/src/routes/auth.ts:284` |
| Counts as email- and phone-verified, so it can list and reserve | `backend/src/lib/serialize.ts:43,55`, `listings.ts:191` |
| Search without sign-in | `GET /api/listings/search` has no `requireAuth` (`listings.ts:529`) |
| Listing detail needs sign-in | `GET /api/listings/:id` uses `requireAuth` (`listings.ts:712`) |
| Reviewer listings hidden from others | `listings.ts:615,735,932`, `backend/src/lib/alertMatching.ts:77` |
| Report a user (only from a reservation) | `frontend/src/app/buy/[listingId]/page.tsx:279`, `frontend/src/app/transactions/[transactionId]/page.tsx:566,789` |
| Delete account | `frontend/src/app/account/delete/page.tsx`, `backend/src/routes/users.ts:470,493` |

**UNCERTAIN (button labels):** the exact wording in steps 2 and "Reserve/Contact seller" is
paraphrased. Before submitting, walk the flow once on the release build and correct the labels.

**CONFIRMED gap - the reviewer can only test "contact seller" on a real person's listing.**

The code allows only these three combinations:
- A seller can't reserve their own listing (`listings.ts:917`, `CannotReserveOwnListingError`).
- There is exactly one review account (`loginReviewAccount`).
- Real users can't see or reserve review-account listings (`listings.ts:615,932`).

So "reserve and see contact details" works for the reviewer **only** on a real listing, which
reveals a real seller's name and phone. Options, best first:
1. **Code change (not done; needs your OK):** add a demo seller that is visible only to the review
   account. One option is a second `isReviewAccount` user whose listings the reviewer can see and
   reserve. Its contact would be `<REVIEWER_DEMO_PHONE>`.
2. Attach a screen recording of the reserve and contact flow, recorded with two of your own test
   accounts. Ask the reviewer not to reserve.
3. Accept the risk, keep the "please do not call or message" line, and tell the affected seller.

Also check the button labels against the release build. "Sign in", "Send code" and
"Report this user" above are paraphrased; I only confirmed "Notify me"
(`frontend/src/components/search/NotifyMeCard.tsx:65`).
