# Closed testing - setup, testers and the 14-day run

Written 2026-11-03 from the code on `master`, plus Google's help pages (read 2026-11-03):
- App testing requirements for new personal accounts: support.google.com/googleplay/android-developer/answer/14151465
- Set up an open, closed or internal test: .../answer/9845334

**UNSURE** marks anything I couldn't confirm from the code or those pages, such as exact Console
labels, which Google moves around.

---

## 0. Do we need 12 testers for 14 days?

Google: "personal developer accounts created after November 13, 2023" must run a closed test with
"a minimum of 12 testers who have been opted in continuously for at least 14 days". The 14 days
must be consecutive. Organization accounts are exempt.

**How to check which account type we have:**

1. **Play Console → Home (All apps) → the gear icon (Settings) → Developer account → Account
   details.**
   - It shows the account type, **Personal** or **Organization**.
   - **UNSURE:** the label may read "Account type" or "Developer account type".
2. **Cross-check:** an organization account needed a D-U-N-S number and organization details at
   sign-up. If you never entered a D-U-N-S number, it's a personal account.
3. **Strongest signal:** open the app's **Dashboard**.
   - If the rule applies, there's a "Apply for production" or "Test your app with testers"
     section that counts testers and days, and production is locked until you meet it.
   - If you can already create a production release with no such section, the rule doesn't apply.
4. **Creation date:** in the Google Payments profile used for the $25 registration fee, the
   registration receipt is dated. After 13 Nov 2023 plus personal means the rule applies.

**Plan for 15-20 testers, not 12.** Anyone who leaves the test, or opts out, ends their continuous
14 days. Every count below assumes some will drop.

---

## 1. Create the closed testing track

**Before you start:** the App content forms must be complete, or the release can't go to review:
- Privacy policy
- App access (the reviewer login; see `app-access.md`)
- Ads: No
- Content rating (`content-rating.md`)
- Target audience: 18+
- Data safety (`data-safety.md`)
- Government apps: No
- Financial features: none
- Health: No

The first closed release **is reviewed** like a production one.

1. **Build the release AAB.** Bump `versionCode` in `frontend/android/app/build.gradle` (it's 3
   now; every upload needs a new number), then run `scripts/build-android-release.sh`. Passwords
   come from env vars only (see `docs/android-release.md`).
2. **Create the track.** Play Console → **Test and release → Testing → Closed testing**.
   - Use the default track (often called "Closed testing" or "Alpha") → **Manage track**.
   - Only use **Create track** if you want a second one.
3. **Countries.** Track → **Countries / regions** tab → add **India**. Keep the same list as the
   planned production release (`store-listing.md`).
4. **Add the testers.** **Testers** tab. Pick one of:
   - **Email list:** **Create email list**, name it (`GMS closed test`), and paste the testers'
     **Google account** emails (the ones signed into Play on their phone), comma-separated, or
     upload a CSV.
     - Uploading a CSV **replaces** the list.
     - Limits: up to 2,000 users per list.
   - **Google Group (easier to manage):**
     1. Create `grabmyseats-testers@googlegroups.com` at groups.google.com. Joining: "Anyone can
        ask" or invite-only. Membership visible to managers only.
     2. Paste the group address in the Testers tab.
     3. Testers must **join the group first**, then opt in.
5. **Feedback channel** on the same tab: enter `support@grabmyseats.com`, or the feedback form URL
   from section 3.
6. **Upload the release.** **Create new release** → upload the AAB → release name `1.1.0 (3)`, or
   whatever you set → release notes (below) → **Next → Save → Send for review**. The send can also
   happen from **Publishing overview**.
7. **Wait for review.** Typically hours to a few days for a first release (**UNSURE:** Google gives
   no fixed time).
8. **Copy the opt-in link.** After the track shows **Published**: Testers tab → **How testers join
   your test** → **Copy link**.
   - It looks like `https://play.google.com/apps/testing/com.grabmyseats.app`.
   - Google: the link "displays only when an app status is 'Published'", and can take a few
     hours to start working.
   - There's also a web Play Store link; testers can install from either once they've opted in.

Release notes for the first closed release (plain, 500-char limit):
```
First test release of GrabMySeats: list tickets you can't use, find spare seats near you, ticket alerts with notifications, report a user, and account deletion. Please send problems to support@grabmyseats.com.
```

---

## 2. Message to testers (WhatsApp)

472 characters with the placeholders in (checked with a script). Filling them in adds
characters:
- the opt-in link (`https://play.google.com/apps/testing/com.grabmyseats.app`, 56 chars)
  adds 43;
- a 7-character code takes away 7;
- the guide link adds its own length minus 12.

So the message **stays under 600 if the guide link is 95 characters or less**. Use a short link,
or drop the guide line and pin the guide in the chat.

```
Hi! I'm testing my app GrabMySeats on Google Play and need your help for 14 days.
1) Open this link on your Android phone, signed in with the Gmail you gave me: <OPT_IN_LINK>
2) Tap "Become a tester", then install from the Play Store link on that page.
3) Sign up in the app with invite code <INVITE_CODE>
Please keep the app installed and stay in the test for 14 days. A short guide: <GUIDE_LINK>
Problems or ideas: reply here or email support@grabmyseats.com. Thank you!
```

Replace `<OPT_IN_LINK>`, `<INVITE_CODE>` (section 5) and `<GUIDE_LINK>` (the guide below, e.g. as
a shared Google Doc or a pinned message).

---

## 2b. Tester guide (one page)

> ### GrabMySeats - tester guide
>
> **Thank you for testing!** GrabMySeats lets people list movie, event and sports tickets they can't use, so someone nearby can use the seats. Please stay in the test for **14 days** and keep the app installed - leaving early resets our count with Google.
>
> **1. Join and install**
> - Open the opt-in link on your Android phone while signed in to Play with the Gmail you gave us. *(If we use a Google Group, join the group first.)*
> - Tap **Become a tester**, then **Download it on Google Play** and install.
> - If you installed a GrabMySeats test file (APK) from us before, **uninstall it first** - Play can't update over it.
>
> **2. Sign up**
> - Open the app → **Sign up** → enter your email → type the invite code we sent in **Invite code** → **Send code**.
> - Enter the 6-digit code from your email (check spam). Add your name. A phone number is optional, but you need one to list tickets.
> - Tip: the invite *link* opens in your browser, not the app - in the app, type the code instead.
>
> **3. Things to try** (tick them off)
> - [ ] **Allow or deny location** when asked, and check you still see listings (pick a city if you deny).
> - [ ] **Search** for a movie or venue and open a listing.
> - [ ] **Post a test listing:** Sell → upload a picture that contains a QR code (we'll send you a test ticket image) → check the details → pick the venue on the map → set seats and price → publish. Name the event **"GMS TEST - <your name>"** so real users know it's a test, and **withdraw it the same day** (My Listings → Withdraw).
> - [ ] **Set an alert:** search for your partner's test event → **Notify me** → choose the city → save → **allow notifications**.
> - [ ] **Receive a push:** when your partner posts a matching test listing, you should get a "Tickets available" notification within a few minutes. Tap it - it should open the app.
> - [ ] **Reserve your partner's test listing** and check you see their contact details. **Report this user** from that screen with reason "Something else" and the text "TEST REPORT".
> - [ ] **Share GrabMySeats** from the Account page.
> - [ ] **Log out and sign in again.**
> - [ ] **Last day only: delete your account** (Account → Delete my account → type DELETE). Tell us if anything is left behind.
>
> *(Reporting a listing directly, without reserving, isn't in the app yet - report the user from the reservation instead.)*
>
> **4. Send feedback**
> - Fill in the feedback form: <FEEDBACK_FORM_LINK> - once at the start and once at the end, plus any time something breaks.
> - Or email support@grabmyseats.com / message us. A screenshot or screen recording helps a lot.
> - Please don't stop the test or uninstall before day 14.

**Notes behind the guide (for you, not testers):**
- **Push needs a partner.** Alerts never match your own listings (`backend/src/lib/alertMatching.ts`
  `l."sellerId" <> ta."userId"`), so pair testers up. Matching runs right after a listing is
  created (`matchListingInBackground`) and also every 5 minutes (`backend/src/jobs/index.ts`).
  Each user gets at most 3 pushes an hour (`PUSHES_PER_USER_PER_HOUR`, `backend/src/jobs/matchAlerts.ts:34`).
- **Push must be on in production.** It needs `PUSH_NOTIFICATIONS_ENABLED=true`
  (`backend/src/lib/push/config.ts:23`). **UNSURE:** I didn't check the production value.
- **Test ticket images.** A listing needs an image with a QR, Aztec or similar code holding at least
  4 characters (`backend/src/lib/ticketBarcode.ts:49,62`), and no two live listings may share the
  same code. Make one image per tester with a free QR generator, encoding e.g.
  `GMS-TEST-<tester>-<n>`.
- **Test listings are real production listings.** Real users nearby will see them, which is why
  the guide asks for "GMS TEST" names and same-day withdrawal. Keep the price at ₹1.
- **No deep links.** The invite link opens in the browser: the app has no VIEW intent filter
  (`AndroidManifest.xml`). That's why the guide says to type the code. Note that
  The Help page now says this too (`frontend/src/content/help.ts`, "Do I need an invite to
  join?"; Task A). App Links would fix it properly (`review-readiness.md` section 1, #1).
- **Reserving needs a verified identity.** Email sign-up verifies the email.
  **UNSURE:** if `REQUIRE_PHONE_VERIFICATION=true` in production, nobody can reserve, because SMS
  isn't wired up (`backend/src/lib/sms/index.ts`). Check that it's off.

---

## 3. Feedback form outline (Google Forms)

1. **Your name** (short answer)
2. **The Gmail you use for Play** (short answer, needed to match the tester list)
3. **Phone model** (short answer) and **Android version** (dropdown: 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, Don't know)
4. **Which form is this?** (Start of test / During the test / End of test)
5. **What did you try?** (checkboxes: Sign up with invite code, Location, Search, Post a listing,
   Alert, Got a notification, Reserve and contact, Report a user, Share, Log out and in, Delete account)
6. **Did anything not work?** (paragraph) plus **Upload a screenshot or recording** (file upload;
   needs Google sign-in)
7. **Did the app crash or freeze?** (Yes / No; if yes, what were you doing?)
8. **How easy was it to use?** (1-5)
9. **What was confusing or missing?** (paragraph)
10. **Would you use this for real?** (Yes / Maybe / No, and why)

Put the form link in the Testers tab "Feedback URL or email address" field and in the guide.

The answers feed straight into the production application questions: whether testers used all
features, whether usage matched real use, a feedback summary, and the changes made (section 4,
day 14).

## 3b. Tracker

Keep this as a Google Sheet. The columns:

| # | Tester | Play Gmail | Opted-in date | In Group / list? | Android version | Phone | Signed up? | Paired with | Tried (from checklist) | Issues (link to form row) | Still opted in (day 7 / 14) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | | / |
| 2 | | | | | | | | | | | / |
| ... 20 | | | | | | | | | | | / |

Issue log (second tab):

| ID | Date | Tester | Android | Area | What happened | Severity (crash / blocker / minor) | Fixed in versionCode | Status |
|---|---|---|---|---|---|---|---|---|

---

## 4. Day-by-day plan

**Day 0 is the day the closed release is approved and the opt-in link works.** The 14 days count
per tester from when they're opted in. In practice, aim to have **≥15 opted in by day 1** and keep
**≥12** opted in through day 14.

**Every day (5 minutes):**
- **Testers count:** Dashboard → the "Apply for production" / testing-requirement card shows
  opted-in testers and days. **UNSURE:** exact placement. If it **drops below 12**, message
  stand-by testers the same day. A tester joining later starts their own 14 days, so the run
  extends.
- **Crashes and ANRs:** **Monitor and improve → Android vitals → Crashes and ANRs**. With few users,
  open each cluster rather than looking at rates. Data can lag about a day.
- **Backend:** check the server logs for `[jobs]` errors and 5xx responses (`scripts/ssm-run.sh`,
  read-only). Filter out OTP lines, as per the team rule.

| Day | Do | Check in Play Console |
|---|---|---|
| -3 to -1 | Recruit 18-20 testers and collect their Play Gmails. Make the Google Group or email list. Make the test ticket QR images. Set up the form and tracker. Confirm `REQUIRE_PHONE_VERIFICATION` is off and `PUSH_NOTIFICATIONS_ENABLED` is on in production | App content all green. **Pre-launch report** for the uploaded AAB (**Test and release → Testing → Pre-launch report**) |
| 0 | Release approved. Copy the opt-in link and send the message (section 2) to everyone | Track shows "Published"; open the opt-in link yourself to check it |
| 1 | Chase anyone not opted in. Pair testers for push tests | Opt-in count ≥15? Install count on the track |
| 2 | Testers sign up with the invite code (section 5) | Vitals: any crash on first launch? |
| 3 | Testers post test listings and set alerts on their partner's event | Vitals. Backend log for `instant` match lines |
| 4 | Push test: partner posts, other receives | Ask in the group who got the notification; log Android version for failures (13+ needs the permission) |
| 5 | Reserve + contact + report test | Admin dashboard: TEST REPORTs arrived with reason "Something else". Dismiss them |
| 6 | Mid-test feedback form | Vitals; count < 12? |
| 7 | **Checkpoint.** Triage issues; build the fix release (versionCode +1) if needed | Fill in the tracker's day-7 column. **Pre-launch report** for any new upload. Updating the closed track does **not** reset testers' days |
| 8 | Ship the fix release to the closed track, if there is one | New release review status. Pre-launch report on it |
| 9 | Testers re-test what was fixed. Location and permission denial paths | Vitals for the new version |
| 10 | Share, log out and in, profile edit | Opt-in count |
| 11 | Free use: "use it like you would for real" | Vitals |
| 12 | Remind everyone: don't leave before the end | Opt-in count; line up stand-by testers if near 12 |
| 13 | End-of-test feedback form. Testers withdraw all test listings | Check no "GMS TEST" listing is still live |
| 14 | Selected testers delete their account (the deletion test). Everyone else stays opted in until you've applied | Dashboard shows 12+ testers × 14 days met → **Apply for production** |
| 14+ | Fill in the application | See the questions below |

**Production application.** Google asks:
- **About the test:**
  - how easy recruiting was;
  - whether testers used all features;
  - whether usage matched expected production behaviour;
  - a summary of feedback and how you collected it.
- **About the app:** the target audience, the value proposition, and expected installs in the
  first year.
- **About readiness:** changes made because of the test, and how you decided it was ready.

Draft the answers from the form and the tracker's issue log.

**After the test.** Keep testers opted in until production access is granted. Google says
nothing about leaving afterwards, but there's no reason to rush.

---

## 5. Invite codes for 12-20 testers

**How codes work today** (no backend change needed):
- **Every account gets one permanent code** at creation (`generateUniqueReferralCode`,
  `backend/src/lib/referral.ts:24`). It's stored as `User.referralCode`.
- **A code has no use limit.** `resolveReferrer` (`referral.ts:66`) only looks up the owner and
  refuses the code if the owner is **deleted, suspended, or the Play review account**
  (`referral.ts:83`). One code can bring in all 20 testers.
- **Codes are only needed if invite-only is on.** Today `REQUIRE_REFERRAL_FOR_SIGNUP` is **not**
  set in production (`backend/src/lib/config.ts:62`), so testers can sign up without one. If a
  code is entered anyway, it's still recorded as their referrer
  (`backend/src/routes/auth.ts`, `signupReferral`).
- **Typed codes are forgiving.** Lowercase, spaces and dashes are accepted, and older hex codes
  accept O for 0 and I/l for 1 (`backend/src/routes/referralOnlySignup.test.ts`).
- **There's no admin tool to mint codes,** and you don't need one.

**Exactly what to do:**
1. Sign in to **your own regular account**, in the app or at https://grabmyseats.com. Not the
   review account: its code is refused.
2. **Account → Refer & Earn → "Your invite code"** (`frontend/src/app/account/page.tsx:197`).
   Copy that code into the tester message as `<INVITE_CODE>`.
3. Optional check: on a browser in a private window, open `https://grabmyseats.com/signup`, type
   the code in **Invite code**, and see that it's accepted. `POST /api/auth/referral/check` only
   says valid or not. Don't finish signing up.
4. **If you plan to turn on `REQUIRE_REFERRAL_FOR_SIGNUP`:** do it **before** testers sign up, so
   the test covers the real invite-only path. The code is the same either way.
5. **Spare codes.** Each tester's own code (their Account → Refer & Earn) also works. If your
   account were ever suspended or deleted, your code stops working. Keep a second regular
   account's code as a backup.

**Side effects to know:**
- **Points.** Your account will show the testers as referrals. A referral "counts" once the
  tester lists or reserves, and every 20 counted referrals give 200 points. Points can't be
  redeemed ("Coming Soon"), so this is harmless. It just inflates your own referral numbers.
- **The invite link** `https://grabmyseats.com/signup?ref=<CODE>` opens in the phone's browser,
  not in the app (no deep links). Signing up in the browser also works, and the tester can then
  sign in inside the app. But the test should go through the app, so the message tells testers
  to type the code.
