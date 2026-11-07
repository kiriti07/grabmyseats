# Play Console - Main store listing

Rules followed (Play metadata policy, support.google.com/googleplay/android-developer/answer/9898842):
- The title is 30 characters or less.
- No ranking or performance claims ("#1", "best", "top").
- No price or promo wording. "Free" is left out too, even though the app has no charges.
- No emojis, no ALL CAPS, no repeated keywords, no testimonials.
- **Character counts:** checked with `python3 len()` on 2026-11-03 (results under each block). The
  limits are title 30, short description 80, full description 4000.

## Recommended

**App name (title)**
```
GrabMySeats: Spare Tickets
```
26 / 30 characters.

**Short description**
```
Can't make the show? List your ticket so someone nearby can use the seat.
```
73 / 80 characters.

**Full description**
```
GrabMySeats helps people pass on tickets they can't use. If plans change and you can't make a movie, event or match, list your ticket. People nearby who are looking for seats can find it and contact you.

Sign-up is by invitation
GrabMySeats is invite-only for now. To create an account you need an invite link or invite code from someone who already uses GrabMySeats. If you have an account already, just sign in.

How it works for sellers
- Upload a screenshot of your ticket. The app reads the barcode to make sure the same ticket isn't listed twice, and fills in the details it can read.
- Check the event, venue, date, time, seats and price, then publish.
- Mark the listing as sold, or withdraw it, when it's no longer available. Listings expire after the show.

How it works for buyers
- Search by movie, event or venue, and see listings near you or in a city you choose.
- Reserve seats to see the seller's contact details, then call or message them to arrange the handover.
- Set a ticket alert and get a notification when matching tickets are listed.

Please note
- GrabMySeats is a listing service only. We don't sell tickets or take payments. Payment and handover happen directly between buyer and seller, at their own risk.
- Check the ticket before you pay, and meet in a public place if you meet in person.
- Ratings and a Verified badge help you decide, but they are not a guarantee.
- You can report a user from a reservation if something goes wrong.

Your account
- Sign in with a one-time code sent to your email. There are no passwords to remember.
- Edit your profile, manage your listings and alerts, or delete your account at any time from the Account page.

GrabMySeats is for people aged 18 and over in India.

Privacy policy: https://grabmyseats.com/privacy
Help: https://grabmyseats.com/help
```
1,818 / 4,000 characters.

## Variants (title + short description)

| # | Title (chars) | Short description (chars) |
|---|---|---|
| A (recommended) | `GrabMySeats: Spare Tickets` (26) | `Can't make the show? List your ticket so someone nearby can use the seat.` (73) |
| B | `GrabMySeats: Find Spare Seats` (29) | `Find spare movie, event and sports tickets listed by people near you.` (69) |
| C | `GrabMySeats` (11) | `List tickets you can't use, or find seats others can't use, near you.` (69) |

Variant C keeps the title to the brand name only. Play's guidance favours plain titles, and
"spare tickets" then lives in the short description.

## Other listing fields

| Field | Value | Notes |
|---|---|---|
| App category | **Events** | Matches "movies, events and sports tickets". Entertainment is the alternative |
| Tags (up to 5, from Play's fixed list) | Pick the closest of: *Events*, *Tickets*, *Movies*, *Local*, *Marketplace* | **UNCERTAIN:** the tag list belongs to Google and appears only in the Console (Store presence → Store settings → Manage tags). Use whichever of these exist |
| Contact email | `support@grabmyseats.com` | Must be a mailbox that's checked. The same address is in the privacy policy (`frontend/src/content/legal/privacy.ts:95`) |
| Website | `https://grabmyseats.com` | |
| Phone | Leave empty (optional) | |
| Privacy policy URL | `https://grabmyseats.com/privacy` | Public route (`frontend/src/middleware.ts` protects only `/account` and `/admin`) |
| Default language | English (India) - `en-IN` | All UI copy is English |
| Countries / regions | **India only** | Cities, phone format, DPDP Act and Indian law in the Terms. **UNCERTAIN:** your call |

## Why invite-only is in the description

- **Today:** `REQUIRE_REFERRAL_FOR_SIGNUP` is **not** set in production
  (`backend/src/lib/config.ts:62` reads it). So right now anyone can sign up, and the "invite-only"
  sentence would be **untrue**. That breaks Play's "deceptive behavior / metadata must match the
  app" rule.
- **Before publishing this text:** turn the flag on (you planned to after the secrets migration),
  **or** replace the "Sign-up is by invitation" paragraph with:

```
Sign-up may be invite-only at times. When it is, you need an invite link or code from someone who already uses GrabMySeats.
```

(That line matches `frontend/src/content/help.ts:32`.)

## Wording checks

- **"We don't sell tickets or take payments":** true while `PAYMENT_MODE=contact_only`. Change it
  before enabling escrow.
- **"Reads the barcode ... make sure the same ticket isn't listed twice":** matches
  `backend/src/lib/ticketBarcode.ts`, `ticketFingerprint.ts` and the Terms (`terms.ts:46`).
- **"Sign in with a one-time code sent to your email":** phone codes are off in production
  (console SMS stub), so the description says email only.
- **"Delete your account at any time from the Account page":** matches `account/page.tsx:247`.
- **"For people aged 18 and over in India":** matches `terms.ts:37`.
