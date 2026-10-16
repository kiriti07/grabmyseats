# Ticket-alert push notifications: setup

Ticket alerts reach buyers as push notifications in the Android app, via
Firebase Cloud Messaging (FCM). Matches always appear in **My Alerts** too, so
the website, older APKs and people who decline notifications still see them.
No secret belongs in this repository: the server key and `google-services.json`
are both gitignored.

## 1. Firebase project and Android app

1. Go to <https://console.firebase.google.com> and choose **Add project**, or
   use an existing one. Google Analytics is not needed.
2. **Add app → Android**:
   - package name: `com.grabmyseats.app`
   - nickname: `GrabMySeats Android`
   - SHA-1: optional, FCM doesn't need it.
3. Download **`google-services.json`** and put it at
   `frontend/android/app/google-services.json`. Don't commit it.
   - A release build fails without it.
   - Debug builds still work, with push off.
4. **Project settings → Cloud Messaging**: check that the
   **Firebase Cloud Messaging API (V1)** is enabled. Don't enable the legacy API.
5. Restrict the Android API key. In Google Cloud console → **APIs & Services →
   Credentials**, open the key named in `google-services.json`:
   - **Application restrictions**: Android apps, package `com.grabmyseats.app`.
     Add your release signing SHA-1 if you want to bind it to your signature.
   - **API restrictions**: only the Firebase APIs the app uses (Firebase
     Installations API and Firebase Cloud Messaging API).

## 2. The `fcm-sender` service account (minimal access)

The backend sends with its own service account that can do nothing except
send messages. Don't use the default `firebase-adminsdk-…` account: it has
broad admin rights.

1. Google Cloud console (same project) → **IAM & Admin → Service Accounts →
   Create service account**.
   - Name: `fcm-sender`. Description: "Sends GrabMySeats ticket-alert pushes".
2. **Grant this service account access to the project**:
   - Role: **Firebase Cloud Messaging API Admin**
     (`roles/firebasecloudmessaging.admin`).
   - No other roles.
   - The permission the backend actually uses is
     `cloudmessaging.messages.create`. Check that the role you picked includes
     it (IAM → Roles → search the role → Permissions).
3. Open the new account → **Keys → Add key → Create new key → JSON**. The file
   downloads once and can't be downloaded again.
   - If key creation is blocked by the organization policy
     `iam.disableServiceAccountKeyCreation` (the default in newer Google Cloud
     organizations), a project owner must allow it for this project. Go to
     **IAM → Organization policies → Disable service account key creation →
     Override for this project**.
4. Treat the file like a password:
   - Don't email it, paste it into chat or tickets, or commit it.
   - The root `.gitignore` blocks `fcm-sender*.json`, `*service-account*.json`
     and `*firebase-adminsdk*.json`.

## 3. Put the key on the server

The backend reads exactly one of these two variables. Neither its value nor
the key is ever logged.

**Recommended: an environment variable.** No Docker Compose change is needed.

```sh
# on the server, where you copied the key file
base64 -w0 fcm-sender-key.json   # prints one long line - don't paste it anywhere else
sudo nano /opt/grabmyseats/.env  # already chmod 600; add the two lines below
```

```
PUSH_NOTIFICATIONS_ENABLED=true
FIREBASE_SERVICE_ACCOUNT_BASE64=<the base64 line>
```

Then delete the key file from the server: `shred -u fcm-sender-key.json`.
Keep the original only in your password manager.

**Alternative: a file.**
1. Store it at `/opt/grabmyseats/secrets/fcm-sender.json`, owned by root:
   `sudo chmod 600` it, and `sudo chmod 700` the `secrets` directory.
2. Mount it read-only into the backend container. Add this to the `backend`
   service in `/opt/grabmyseats/docker-compose.yml`:
   ```yaml
       volumes:
         - ./secrets/fcm-sender.json:/run/secrets/fcm-sender.json:ro
   ```
3. Set these in `/opt/grabmyseats/.env`:
   ```
   PUSH_NOTIFICATIONS_ENABLED=true
   FIREBASE_SERVICE_ACCOUNT_FILE=/run/secrets/fcm-sender.json
   ```

**Behaviour:**
- `PUSH_NOTIFICATIONS_ENABLED` unset or not `true`: push is off. Alerts still
  match and show in My Alerts. The backend logs `[config] PUSH=disabled`.
- `PUSH_NOTIFICATIONS_ENABLED=true` in production without a valid key: **the
  backend refuses to start**, and names the variable (never its value).
- Outside production a missing key just leaves push off.

**Rotating the key** (if it may have leaked, or yearly):
1. Create a new key for `fcm-sender`.
2. Replace the value on the server and restart the backend.
3. Delete the old key under Keys.

## 4. Database migration

Migration `backend/prisma/migrations/20261016120000_alert_dates_seats_push`:
- adds alert dates and seats wanted
- makes alert `lat`/`lng` optional
- adds notification status
- adds the `PushToken` and `PushDelivery` tables

It drops no index, trigger or extension. Check it yourself first:

```sh
npm run check:migrations -w backend
```

Then apply it the way you usually do.

## 5. Order of release

1. Apply the migration.
2. Deploy the backend with the new environment variables. Check the log for
   `[config] PUSH=enabled`.
3. Deploy the website (Vercel). The new alert form, My Alerts and its dot work
   right away, on the website and inside the current APK.
4. Build and release the new APK (versionCode 2) with `google-services.json`
   in place:
   ```sh
   cd frontend && npx cap sync android
   cd android && ./gradlew assembleRelease   # or bundleRelease for Play
   ```
   Only this step brings push notifications to phones. Users must update the
   app, then allow notifications when they create their first alert.

## 6. Checking it works

- In the new APK, create an alert → **Allow** → Android's permission prompt.
  The backend then holds a `PushToken` row for that account.
- From another account, list a matching ticket: same category and event, one
  of the alert's dates, enough seats, in the area. Within about 5 minutes the
  phone shows "Tickets available", and tapping it opens the listing.
- Limits: at most 3 pushes per user per hour; extra matches are combined into
  the next one. One push per alert per listing, ever.
