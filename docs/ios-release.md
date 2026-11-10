# iOS release - assessment and checklist

Written 2026-11-03 from the repo on `master`. Nothing has been signed or archived, and Xcode
hasn't been opened.

**Update 2026-11-03: repo-only prep done.** Checklist steps 5, 6, 7 and 9 are done, and step 8
partly. See "Done in the repo" just below and the step marks in section 2. Section 1 describes the
project **before** that prep.

### Done in the repo (2026-11-03)

| What | File | Check |
|---|---|---|
| `GoogleService-Info.plist` gitignored, before any such file exists | `frontend/ios/.gitignore` | `git check-ignore` matches `frontend/ios/App/App/GoogleService-Info.plist` |
| `npx cap sync ios`: brought in the **existing** plugins only (`@capacitor/push-notifications` 8.1.3, `@capacitor/share` 8.0.3), `errorPath: offline.html` and `offline.html` | `frontend/ios/App/CapApp-SPM/Package.swift` (tracked); `App/App/capacitor.config.json`, `App/App/public/` (gitignored, regenerated) | The sync log said "Building against production: https://grabmyseats.com" (no URL override). `packageClassList` = `PushNotificationsPlugin`, `SharePlugin` |
| iPhone only | `App.xcodeproj/project.pbxproj`: `TARGETED_DEVICE_FAMILY = 1` (Debug and Release) | Deployment target unchanged at 15.0 |
| Portrait only, `arm64` instead of `armv7`, iPad orientation list removed | `App/App/Info.plist` | `plutil -lint` OK |
| Usage strings: `NSCameraUsageDescription`, `NSLocationWhenInUseUsageDescription` (mentions that a "near me" alert saves the location), `NSPhotoLibraryUsageDescription`, plus `ITSAppUsesNonExemptEncryption = NO`. No other permission strings | `App/App/Info.plist` | Wording as in section 4 |
| App privacy manifest: no tracking, no tracking domains, no accessed APIs, 14 collected data types mirroring `docs/play-store/data-safety.md` | `App/App/PrivacyInfo.xcprivacy` (new), added to the App target's Resources in `project.pbxproj` | `plutil -lint` OK. `xcodebuild -list` reads the project (targets: App; schemes include CapacitorPushNotifications, CapacitorShare) |

**Data types in `PrivacyInfo.xcprivacy`:**
- All are linked to the user, not tracking, purpose App Functionality.
- The list: Name, EmailAddress, PhoneNumber, PhysicalAddress, OtherDataTypes (date of birth,
  gender, WhatsApp flag), UserID, DeviceID (push token), PreciseLocation, CoarseLocation,
  PhotosorVideos, OtherUserContent (descriptions, ratings, reports, PDF evidence, listings),
  PurchaseHistory, ProductInteraction, SearchHistory (alert search words).
- Keep this file, the App Privacy answers in App Store Connect and `data-safety.md` in step.

**Not done, by design:** push, Firebase, Universal Links, share code, `AppDelegate`, any npm
install, a build, signing and archiving. Version numbers are unchanged (`MARKETING_VERSION 1.0`,
build `1`).

**Side effects:**
- `xcodebuild -list` (read-only, to check the project still parses) resolved the Swift packages.
  That cloned `capacitor-swift-pm` 8.5.1 from GitHub into Xcode's cache under
  `~/Library/Developer/Xcode/DerivedData`, outside the repo.
- It also created `project.xcworkspace/xcshareddata/swiftpm/Package.resolved`, which I deleted
  because it wasn't in the agreed file list. Xcode recreates it when you open the project; commit
  it then, since it pins package versions.
- **Upload warning to expect:** the push plugin is now in the iOS binary. Until you add the Push
  Notifications capability (Xcode step 3 below), App Store Connect may email a "Missing Push
  Notification Entitlement" (ITMS-90078) warning on upload. It doesn't block the upload.

### What you must do yourself in Xcode (in order)

1. **Open** `frontend/ios/App/App.xcodeproj`, the project, not a workspace (this is an SPM
   project). Let it resolve packages. Commit the `Package.resolved` it creates.
2. **App target → Signing & Capabilities:**
   - tick **Automatically manage signing**;
   - choose your **Team** (after Apple Developer Program enrolment);
   - check the bundle ID shows `com.grabmyseats.app`.
3. **+ Capability → Push Notifications.** This creates `App/App.entitlements` with
   `aps-environment`. Leave Background Modes off: we send only visible notifications.
4. **(Later, with Universal Links) + Capability → Associated Domains** → `applinks:grabmyseats.com`.
5. **General tab:**
   - check **Supported Destinations** shows iPhone only. If Xcode lists "iPad" or
     "Mac (Designed for iPad)", remove them;
   - check Device Orientation is **Portrait** only, and Minimum Deployments is iOS **15.0**;
   - set **Version 1.1.0** and **Build 1**, or tell me and I'll set them in `project.pbxproj`.
6. **Build to a real iPhone** (Product → Run), and walk the device checks in section 2, step 16:
   - the camera, photo library and location prompts show the new texts;
   - check for a second, website-level location prompt (section 4).
7. **Product → Build** with the Release scheme, and look at **Report Navigator → privacy report**
   (or Archive → Generate Privacy Report). It should list only our data types and Capacitor's
   empty manifests.
8. When push work (section 3) and Firebase are ready, do steps 12-15 in section 2, then the
   TestFlight phase.

**UNSURE** marks things that need a device, Xcode, or App Store Connect to confirm.

Sources (read 2026-11-03):
- Capacitor 8 upgrade guide: capacitorjs.com/docs/updating/8-0
- Push Notifications API: capacitorjs.com/docs/apis/push-notifications
- Firebase push guide: capacitorjs.com/docs/guides/push-notifications-firebase
- App Review Guidelines: developer.apple.com/app-store/review/guidelines
- Screenshot specifications: developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications

---

## 1. Current state of `frontend/ios`

**It exists. `npx cap add ios` is not needed.**

| Item | Value | Evidence |
|---|---|---|
| Project type | **Swift Package Manager** (Capacitor 8 default), no CocoaPods | `frontend/ios/App/CapApp-SPM/Package.swift` |
| Capacitor | 8.5.1 installed (8.6.0 available, not upgrading) | `npx cap doctor`: "iOS looking great" |
| Xcode | **26.5** (17F42). Capacitor 8 requires **Xcode 26.0+**, so this is **compatible** | `xcodebuild -version` |
| Deployment target | iOS **15.0**, the Capacitor 8 minimum | `App.xcodeproj/project.pbxproj` |
| Bundle ID | `com.grabmyseats.app` (same as Android) | `project.pbxproj:312` |
| Version / build | `MARKETING_VERSION 1.0`, `CURRENT_PROJECT_VERSION 1` (Android is 1.1.0 / 3) | `project.pbxproj:303,310` |
| Devices | **iPhone and iPad** (`TARGETED_DEVICE_FAMILY = "1,2"`) | `project.pbxproj:316` |
| App delegate | Scene-based (`SceneDelegate` → `CAPBridgeViewController`). `AppDelegate` has **no push methods** | `ios/App/App/AppDelegate.swift`, `SceneDelegate.swift` |
| Server | Loads `https://grabmyseats.com`, like Android | `ios/App/App/capacitor.config.json` |
| Entitlements | **None.** No Push Notifications capability yet | no `*.entitlements` |
| Icon | `AppIcon-512@2x.png`: **1024×1024, no alpha** (good) | `Assets.xcassets/AppIcon.appiconset` |
| Launch screen | `LaunchScreen.storyboard` + `Splash` image set (2732×2732, light and dark) | `Base.lproj/`, `Assets.xcassets/Splash.imageset` |
| Privacy manifest | Capacitor core ships an empty one (no required-reason APIs, no tracking). **The app has none of its own** | `node_modules/@capacitor/ios/Capacitor/Capacitor/PrivacyInfo.xcprivacy` |
| Info.plist usage strings | **None** | `ios/App/App/Info.plist` |

**The iOS project is stale.** It hasn't been synced since the Android work:
- `Package.swift` lists only `Capacitor` and `Cordova`. The **push and share plugins aren't
  included**.
- `capacitor.config.json` has `"packageClassList": []` and **no `errorPath`**.
- `ios/App/App/public/` has **no `offline.html`**.

`npx cap sync ios` fixes all three. It's the first repo step below.

**Other things to fix in the project:**
- `Info.plist` lists `UIRequiredDeviceCapabilities = armv7`, an old template value. Use `arm64`.
- Info.plist allows landscape on iPhone. The layout is phone-portrait, so make it **portrait
  only**, as on Android.
- Supporting iPad means **13" iPad screenshots are required**, and review may happen on an iPad.
  **Recommendation:** iPhone only (`TARGETED_DEVICE_FAMILY = 1`) for the first release.
  Reviewers may still run it on an iPad in iPhone compatibility mode.
- `GoogleService-Info.plist` is **not gitignored** (`frontend/ios/.gitignore` has no rule).
  Android's `google-services.json` is (`frontend/android/.gitignore:105`). Add the rule
  **before** the file is created.

---

## 2. Checklist, in order

**C** = Claude Code can do it in the repo, after your OK. **Y** = you must do it yourself.

### Phase 0 - Accounts (start now; enrollment can take days)
1. **Y** Enrol in the **Apple Developer Program** ($99/year).
   - As an individual, the seller name is your legal name.
   - As an organization (Brilliant Eight), you need a D-U-N-S number, and the seller name is
     "Brilliant Eight", matching the privacy policy.
   - **Recommended:** organization, for consistency with the policy and Play.
2. **Y** In **Certificates, Identifiers & Profiles**:
   1. Register the App ID `com.grabmyseats.app`, with the **Push Notifications** capability.
   2. Also add **Associated Domains** if you'll add Universal Links (section 5, 4.2).
3. **Y** **Keys** → create an **APNs Auth Key (.p8)**. Download it once and store it like a
   secret (never in the repo). Note the Key ID and your Team ID.
4. **Y** **App Store Connect → My Apps → + New App**:
   - platform iOS;
   - name "GrabMySeats" (30-char limit);
   - primary language English (India) or English (U.K.) (**UNSURE** which is offered);
   - bundle ID `com.grabmyseats.app`;
   - SKU `grabmyseats-ios`.

### Phase 1 - Repo preparation (no signing)
5. **C ✅ done** Add `App/App/GoogleService-Info.plist` to `frontend/ios/.gitignore`.
6. **C ✅ done** Run `npx cap sync ios`. It brings in `@capacitor/push-notifications` and
   `@capacitor/share`, `errorPath` and `offline.html`.
7. **C ✅ done** In Info.plist:
   - add the usage strings from section 4;
   - add `ITSAppUsesNonExemptEncryption = NO` (HTTPS only), which skips the export-compliance
     question on every upload;
   - change `armv7` to `arm64`;
   - make iPhone portrait-only.
8. **C ◐ partly done** `project.pbxproj`:
   - `TARGETED_DEVICE_FAMILY = 1` (if you agree);
   - `TARGETED_DEVICE_FAMILY = 1`: done.
   - `MARKETING_VERSION 1.1.0`, `CURRENT_PROJECT_VERSION 1`: **not done** (not asked; see
     "What you must do yourself in Xcode", step 5).
9. **C ✅ done** Add an app-level `ios/App/App/PrivacyInfo.xcprivacy` (section 5).
10. **C** Push code changes for iOS (section 3: frontend `push.ts`, `api.ts`, `capacitor.config.ts`;
    backend `pushTokens.ts`, `FcmPushSender.ts`; `AppDelegate.swift`).
11. **C** Update `docs/play-store/*` and the privacy policy if anything iOS-specific differs. It
    shouldn't: same site, same data.

### Phase 2 - Firebase and Xcode (needs your Apple account)
12. **Y** Firebase console → the existing project → **Add app → iOS**, bundle ID
    `com.grabmyseats.app`.
    - Download **`GoogleService-Info.plist`** and put it at
      `frontend/ios/App/App/GoogleService-Info.plist`.
    - Add it to the App target in Xcode ("Copy items if needed", target App checked).
    - Don't send it to me or commit it.
13. **Y** Firebase → Project settings → **Cloud Messaging → Apple app configuration** → upload
    the **APNs Auth Key (.p8)** with the Key ID and Team ID. One key covers development and
    production.
14. **Y or C** Xcode → **File → Add Package Dependencies** →
    `https://github.com/firebase/firebase-ios-sdk`. Add the product **FirebaseMessaging** only,
    to the **App** target.
    - Don't edit `CapApp-SPM/Package.swift` (marked "managed by Capacitor CLI").
    - I can make this pbxproj edit, but the Xcode UI is less error-prone.
15. **Y** Xcode → App target → **Signing & Capabilities**:
    - select your Team, with automatic signing;
    - **+ Capability → Push Notifications**, which creates `App.entitlements` with
      `aps-environment`;
    - if you use Universal Links: **+ Associated Domains** → `applinks:grabmyseats.com`.
16. **Y** Run on a **real iPhone** from Xcode. Push doesn't work in all simulators reliably. Check:
    - sign-in;
    - location;
    - the notification prompt on the first alert;
    - a push from a second account's matching listing;
    - share;
    - the photo picker and camera;
    - account deletion.

### Phase 3 - TestFlight
17. **Y** Xcode → Product → **Archive** → Distribute App → App Store Connect → Upload.
18. **Y** App Store Connect → TestFlight:
    - **internal testing** (up to 100 team members, no review);
    - then **external testing** (needs a short Beta App Review and the demo account notes from
      section 5).
19. **Y** Collect feedback, much like `docs/play-store/closed-testing.md`. Apple has no
    12-tester / 14-day rule.

### Phase 4 - Submission
20. **Y** In App Store Connect, fill in:
    - **App Privacy** (nutrition labels, section 5);
    - privacy policy URL `https://grabmyseats.com/privacy`;
    - support URL `https://grabmyseats.com/help`;
    - age rating questionnaire (18+, user-generated content);
    - category (Lifestyle or Entertainment; Apple has no "Events" category; **UNSURE**);
    - screenshots (section 7);
    - description (reuse `docs/play-store/store-listing.md`, same metadata rules);
    - **App Review Information**: demo account plus notes (section 5).
21. **Y** **Before submitting, Task B (blocking and report-listing) must be deployed.** Apple's
    1.2 explicitly requires blocking (section 5).
22. **Y** Submit for review, and answer any rejection with the evidence in section 5.

---

## 3. Push notifications - recommendation

**The problem:**
- `@capacitor/push-notifications` returns an **APNs token on iOS**, not an FCM token. The
  Capacitor docs say "On iOS it contains the APNS token".
- Our backend sends with **firebase-admin** to **FCM tokens**
  (`backend/src/lib/push/FcmPushSender.ts:42-51`), and only accepts `platform: "android"`
  (`backend/src/routes/pushTokens.ts:28,41`).

**Options:**
- **(a) iOS returns an FCM token.** Recommended. There are two ways:
  - **(a1) Firebase iOS SDK in `AppDelegate`, keeping `@capacitor/push-notifications`.**
    Recommended. This is Capacitor's own documented recipe. `AppDelegate` hands the APNs token
    to `Messaging.messaging()`, gets the FCM token, and posts it to Capacitor as the
    registration token. The JS API stays exactly the same, and **Android is untouched** (it's in
    closed testing).
  - **(a2) Swap to `@capacitor-firebase/messaging` on both platforms.** It's a different JS API
    and it replaces the Android plugin too: two Firebase messaging services in one Android app
    conflict. That's more change, and it's risky during the Android closed test. Worth it later
    only if we want its extras.
- **(b) Native APNs tokens plus a backend APNs sender.**
  - It needs an HTTP/2 APNs client (e.g. `@parse/node-apn`), a second sender beside FCM, the
    `.p8` key in Secrets Manager, and sandbox-versus-production endpoint handling.
  - It also needs per-platform token routing and invalid-token handling for APNs error codes.
  - It's more backend code and a new secret, for no user-visible gain.

**Recommendation: (a1).**

### Changes for (a1). Not implemented.

**Native (`frontend/ios/App/App/AppDelegate.swift`):**
- `import FirebaseCore` and `import FirebaseMessaging`.
- In `didFinishLaunchingWithOptions`, call `FirebaseApp.configure()`.
- Add `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`:
  1. Set `Messaging.messaging().apnsToken = deviceToken`.
  2. Call `Messaging.messaging().token { token, error in … }`.
  3. On success, `NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)`.
  4. On error, post `.capacitorDidFailToRegisterForRemoteNotifications`.
- Add `application(_:didFailToRegisterForRemoteNotificationsWithError:)`, posting the failure.

**Frontend (`frontend/src/lib/push.ts`):**
- **Platform gate.** Push is Android-only today: `isAndroidApp()` (line 24) gates
  `pushSupported()` (line 43) and `getPushStatus()` (line 151). Change the gate to "native app
  (android or ios) and plugin present", and keep `isAndroidApp()` only where it's genuinely
  Android-specific.
- **Channel creation.** `push.createChannel(...)` (around line 256) is Android-only; guard it with
  `Capacitor.getPlatform() === "android"`.
- **Permission flow.** `requestPermissions()` (line 287) shows the iOS system prompt; the flow
  stays as it is. There's no "denied forever" difference to handle: iOS asks once, then the user
  must use Settings. Make the status text say "Settings → GrabMySeats → Notifications" on iOS.
- **Comments and status strings** that say "Android" (lines 4-12, 148-176): make them neutral.
- **Tap handling** (`pushNotificationActionPerformed`, line 341) stays the same. FCM puts our
  `data.path` into the iOS `userInfo`, which the plugin exposes as `notification.data`.
  **UNSURE:** check on a device that `path` arrives at the top level.

**Other frontend files:**
- `frontend/src/lib/api.ts:509`: send `platform: Capacitor.getPlatform()` instead of the
  hard-coded `"android"`.
- `frontend/capacitor.config.ts`: add `plugins.PushNotifications.presentationOptions`.
  - Today the app shows its own in-app update when a push arrives in the foreground (the
    `gms:alert-match` event), so `[]` keeps that behaviour.
  - `["banner", "sound", "list"]` also shows the system banner.
  - **Recommended:** `["list"]`, which keeps the item in Notification Centre without a duplicate
    banner.

**Backend:**
- `backend/src/routes/pushTokens.ts:28,41`: accept `platform` of `"android"` or `"ios"`, and
  store it.
  - `PushToken.platform` is already a `String`, so **no migration**.
  - Update the error message.
- `backend/src/lib/push/FcmPushSender.ts:42-51`: add an `apns` block next to `android`:
  - `headers: { "apns-collapse-id": "ticket-alerts", "apns-priority": "10" }`, the iOS
    equivalent of the Android `tag` (a new alert replaces the old one);
  - `payload: { aps: { sound: "default" } }`.

  The `android` block is ignored on iOS. The invalid-token cleanup is unchanged, because FCM
  reports invalid iOS tokens the same way.
- Tests: extend `backend/src/lib/push/push.test.ts` and `routes/pushTokens.test.ts` for the
  `"ios"` platform and the `apns` block.

**Things you do by hand** (Phase 2): steps 12-15 in section 2.
1. Add an iOS app in Firebase and download `GoogleService-Info.plist` into the App target.
2. Upload the APNs .p8 key to Firebase Cloud Messaging.
3. Add the Push Notifications capability.
4. Add FirebaseMessaging through SPM.

**Background Modes → Remote notifications** isn't needed: we only send visible notifications,
never silent ones.

**Privacy wording:** the privacy policy already says pushes go through FCM and lists their exact
contents. On iOS, FCM relays them through Apple Push Notification service. **Recommended:** add
", which uses Apple's push service on iPhone" to the FCM bullet when iOS ships.

---

## 4. Info.plist usage-description strings

Wording follows what the app actually does.

| Key | Needed? | Why | Proposed string |
|---|---|---|---|
| `NSCameraUsageDescription` | **Yes** | The site's `<input type="file" accept="image/*">` (Sell ticket screenshot, profile photo, report evidence: `ReportUserButton.tsx:101`) offers **Take Photo** in WKWebView. Without this key the app **crashes** when that's tapped | "GrabMySeats uses the camera only when you choose to take a photo of your ticket, your profile picture, or proof for a report." |
| `NSPhotoLibraryUsageDescription` | **Recommended** | Picking an image goes through the system picker. iOS 14+ doesn't strictly need this key for that, but WKWebView's chooser may use the library path on some versions. **UNSURE:** if a device test shows no prompt, it's harmless to keep | "GrabMySeats opens your photo library only when you choose a ticket screenshot, profile picture, or proof for a report to upload." |
| `NSPhotoLibraryAddUsageDescription` | **No** | We never save images to the library | - |
| `NSLocationWhenInUseUsageDescription` | **Yes** | `navigator.geolocation` in the WebView (`frontend/src/lib/geolocation.ts:17`) for "near me" search and "near me" alerts (stored with the alert). Without it, location silently fails | "GrabMySeats uses your location to show ticket listings near you. If you create a "near me" ticket alert, that location is saved with the alert. You can choose a city instead." |
| `NSLocationAlwaysAndWhenInUseUsageDescription` | **No** | No background location. Don't add it, or review will ask why | - |
| Notifications | **No key exists** | iOS has no usage-description string for notifications. The system prompt text is fixed. The context is our own UI: the prompt appears when the user saves their first alert (`push.ts:287`) | - |
| `NSMicrophoneUsageDescription` | **No** | No audio or video capture (inputs are `image/*` and PDF) | - |
| `NSUserTrackingUsageDescription` | **No** | No tracking or ads, so no App Tracking Transparency prompt | - |
| `ITSAppUsesNonExemptEncryption` | Set to **NO** | Only standard HTTPS/TLS | - |

**UNSURE: two location prompts.** WKWebView can show its own "grabmyseats.com would like to use
your current location" prompt after the system one, and again on later launches. Test this on a
device. If it happens, the fix is `@capacitor/geolocation` with a small change in
`frontend/src/lib/geolocation.ts` to use it in the native app. That's an npm install, so I'd ask
first.

---

## 5. App Store review risks and evidence

### 4.2 Minimum functionality (repackaged website)

- **The rule:** apps must "elevate it beyond a repackaged website… 'app-like'". Apple is
  **stricter than Play** here; this is the most likely rejection.
- **Already have:**
  - push notifications with tap-to-open (once section 3 is done; `push.ts:341`);
  - the native share sheet (`frontend/src/lib/share.ts`, once synced);
  - native location and notification permission handling;
  - the bundled offline page (once synced);
  - `tel:` and WhatsApp hand-off (`ContactPhone.tsx:29`, `WhatsAppButton.tsx`).
- **Missing, and cheap to add** (see `docs/play-store/review-readiness.md` section 1; each needs
  an npm install, asked first):
  - **Universal Links** (Associated Domains + `apple-app-site-association` on grabmyseats.com):
    invite and listing links open the app. **Strongest addition.**
  - **Haptics** on publish and reserve.
  - Native **camera / photo picker** (`@capacitor/camera`).
  - **Status bar** styling.
  - Home-screen **quick actions** (UIApplicationShortcutItems in Info.plist; no plugin).
- **Recommendation:** ship push, share, Universal Links and haptics in the first iOS build. In
  the review notes, list the native features.

### 1.2 User-generated content

- **Apple requires all four:**
  1. "a method for filtering objectionable material";
  2. "a mechanism to report offensive content and timely responses";
  3. "the ability to block abusive users";
  4. "published contact information".
- **Already have:**
  - **Report:** reporting with reasons (Task A: `ReportUserButton.tsx`, `FraudReport.reason`),
    an admin queue (`FraudReportQueue.tsx`) and suspension (`backend/src/routes/admin.ts`).
  - **Contact:** support@grabmyseats.com in the Terms, Privacy and Help pages, and the help
    page link from Account (`frontend/src/app/account/page.tsx:177`).
  - **Terms acceptance** (Task A, `TermsConsentNote.tsx`).
- **Partial:**
  - **Filter.** Only contact details are filtered out of descriptions
    (`shared/src/listingDetails.ts:129`). There's no profanity or abuse filter on descriptions
    or rating comments. **Add a small word-list filter** to `checkListingDescription` and the
    rating comment (`backend/src/routes/transactions.ts` rate).
  - **Report.** Reporting a listing isn't built yet; you can only report a user from a
    reservation.
  - **"Timely responses":** state a response time in Help only if you can keep it.
- **Missing: blocking. Apple's text makes it mandatory, unlike Play's ambiguity.** That's
  **Task B**, required before the iOS submission.

### 5.1.1(v) In-app account deletion

- **Satisfied:**
  - Account → "Delete my account" (`frontend/src/app/account/page.tsx:247`), then
    `/account/delete` → `DELETE /api/users/me` (`backend/src/routes/users.ts:493`).
  - Deletion is immediate, not just a "request".
  - The web page `https://grabmyseats.com/delete-account` is a bonus.
- **Nothing missing.** Note in review notes: "Account → Delete my account (bottom of the page)".

### 5.1.1 Data collection and App Privacy labels

- **Already have:**
  - the privacy policy in-app (Account → Privacy Policy) and at a public URL;
  - only data the features need;
  - no tracking or ads.
- **App Privacy answers** (from `docs/play-store/data-safety.md`):
  - **Tracking:** No.
  - **Data linked to the user:**
    - **Contact Info:** Name, Email, Phone, Physical Address (optional).
    - **Location:** Precise and Coarse. On iOS, the user's "Precise" toggle decides, so declare
      both. Used for App Functionality.
    - **User Content:** Photos (profile photo, report evidence; the ticket screenshot is
      processed, not kept), Other User Content (descriptions, ratings, reports), Customer
      Support (report text).
    - **Identifiers:** User ID.
    - **Purchases:** Purchase History (reservations).
    - **Usage Data:** Product Interaction (views and contacts).
    - **Search History:** alert search words.
  - **Not collected:** Health, Financial Info, Contacts, Browsing History, Diagnostics,
    Sensitive Info.
  - **UNSURE:** whether to declare the push token under **Identifiers → Device ID**. Apple
    describes Device ID as identifiers like the advertising ID. **Conservative:** declare it,
    App Functionality, not tracking.
- **Missing:** nothing in code. The App Privacy form itself is yours to fill in (Phase 4).

### Privacy manifest (`PrivacyInfo.xcprivacy`) and required-reason APIs

- **Already have:**
  - Capacitor core and CapacitorCordova ship manifests with **no** required-reason APIs and
    `NSPrivacyTracking = false` (`node_modules/@capacitor/ios/Capacitor/Capacitor/PrivacyInfo.xcprivacy`).
  - `@capacitor/push-notifications` and `@capacitor/share` iOS sources don't use required-reason
    APIs (no UserDefaults, file timestamps, system boot time or disk space; checked with a grep).
- **Comes with (a1):** the Firebase iOS SDK (FirebaseMessaging and its dependencies) is on
  Apple's list of commonly used SDKs. Recent versions ship their own signed privacy manifests.
  Use a current `firebase-ios-sdk`. **UNSURE:** confirm the version on the release notes when
  adding it.
- **Missing:** an **app-level** `ios/App/App/PrivacyInfo.xcprivacy`. It isn't strictly required
  when the app's own code uses no required-reason APIs, but Xcode's privacy report combines all
  manifests and Apple expects one. It should declare:
  - `NSPrivacyTracking = false`;
  - no tracking domains;
  - `NSPrivacyCollectedDataTypes` matching the App Privacy answers above;
  - `NSPrivacyAccessedAPITypes` left empty unless the Xcode privacy report shows something.

  (Repo step 9.)

### 2.1 Demo account (invite-only sign-up)

- **Already have:**
  - The reviewer login works on any platform, because it's backend-only (`lib/reviewAccess.ts`,
    `backend/src/routes/auth.ts:284`).
  - It skips the invite check and the welcome step's phone requirement.
  - The reviewer's listings are hidden from real users.
- **App Review Information in App Store Connect:**
  - **User name:** `<REVIEWER_EMAIL>`. **Password:** `<REVIEWER_CODE>`. Fill these in App Store
    Connect only.
  - **Notes:** adapt `docs/play-store/app-access.md`. Say "use **Sign in**, not Sign up. The
    6-digit code is fixed for this account; no email is needed. No invite code is needed."
  - Say "choose the city Hyderabad", because reviewers are outside India and "near me" will be
    empty.
- **Missing** (same dead ends as Play: `review-readiness.md` section 3):
  - the reviewer has no ticket image for Sell (host a sample image);
  - they can't reserve, report or receive a push without touching real users.

  Attach the screen recording. Apple accepts a video link in the notes.
- **Operational:** keep `REVIEW_EMAIL`/`REVIEW_OTP` set for the whole review, and again for each
  update.

### Also relevant

- **5.1.2 / 5.0 Legal (ticket resale):** as with Play, the Terms require the right to transfer
  and fair pricing (`frontend/src/content/legal/terms.ts` sections 3 and 5). Payments happen off
  the app, so **3.1 (in-app purchase) doesn't apply** to physical event tickets.
- **Age rating:** answer user-generated content Yes, unrestricted web No. Set **18+** to match
  the Terms (**UNSURE** which age band Apple's questionnaire gives).

---

## 6. Sign in with Apple - not required

- **Guideline 4.8:** another login service is required only for "apps that use a third-party or
  social login service (such as Facebook Login, Google Sign-In, …) to set up or authenticate the
  user's primary account". An app that "exclusively uses your company's own account setup and
  sign-in systems" is exempt.
- **We use our own email one-time codes** (`backend/src/routes/auth.ts:77`, `/otp/request`, and
  `auth.ts:268`, `/otp/verify`). Phone codes use the same system but are off in production.
- **Verified: no third-party login.** I searched `frontend/src` and `backend/src` for
  `signInWith`, `oauth`, `google.accounts`, `GoogleAuth` and `facebook` and found **nothing**.
  There's no social login SDK in either `package.json`. Admin login is username/password on our
  own system (`backend/src/routes/adminAuth.ts`).
- **So Sign in with Apple is not required.** If Google or other social sign-in is ever added, it
  becomes required.

---

## 7. Icon, launch screen and screenshots

| Asset | Requirement | Status |
|---|---|---|
| **App icon** | 1024×1024 PNG, **no alpha**, no rounded corners (Apple applies the mask). Xcode 26 accepts a single-size icon | **Exists:** `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`, 1024×1024, `hasAlpha: no` (checked with `sips`). Optional: an iOS 26 Liquid Glass layered icon (Icon Composer), not required |
| **Launch screen** | A launch storyboard (no static launch images) | **Exists:** `LaunchScreen.storyboard` plus the `Splash` image set (2732×2732, light and dark). Check on a device that the splash isn't stretched on tall iPhones (**UNSURE**) |
| **iPhone screenshots** | **Required:** iPhone with Dynamic Island, large (6.9"): **1320×2868**, 1290×2796 or 1260×2736 portrait. A 6.5" set (1284×2778 or 1242×2688) is needed only if the 6.9" set is missing. 1-10 per size, PNG or JPEG, **no alpha** | To make. Capture on the iPhone 17 Pro Max simulator, same 7-8 screens as `docs/play-store/screenshots.md`, demo data only |
| **iPad screenshots** | **Required only if iPad is supported:** 13" **2064×2752** or 2048×2732 | Avoid by going iPhone-only (`TARGETED_DEVICE_FAMILY = 1`, repo step 8) |
| **App preview video** | Optional | - |

Apple scales the largest set down for smaller iPhones, so one 6.9" set is enough.

---

## Could not verify (summary)

- Anything needing a real device:
  - the WKWebView double location prompt;
  - whether the photo library key is needed;
  - push `path` delivery on iOS;
  - the splash on tall screens.
- Whether `armv7` in `UIRequiredDeviceCapabilities` blocks upload today. It's an old template
  value; replace it with `arm64` anyway.
- Apple's current age-rating bands, the category choice, and the primary-language list.
- The firebase-ios-sdk version that ships the required signed privacy manifests (check its
  release notes when adding it).
- Your Apple Developer account type (individual or organization). That decides the seller name.
