# Play Console - Screenshots and graphics

Specs come from Play's "Add preview assets" page (support.google.com/googleplay/android-developer/answer/9866151),
read on 2026-11-03.

## Required sizes

| Asset | Required? | Spec |
|---|---|---|
| **App icon** | Yes | **512 × 512**, **32-bit PNG (with alpha)**, ≤ 1024 KB |
| **Feature graphic** | Yes | **1024 × 500**, JPEG or **24-bit PNG (no alpha)** |
| **Phone screenshots** | Yes: 2-8 (at least 2 across all device types) | JPEG or 24-bit PNG (no alpha). Each side 320-3840 px. The long side can be at most 2× the short side. **To qualify for Play's screenshot-based promotion:** at least 4 screenshots at ≥1080 px. Portrait ≥ **1080 × 1920** |
| 7-inch tablet screenshots | Only if we support tablets | Same format rules. Large-screen guidance: 1080-7680 px per side, **9:16 portrait / 16:9 landscape**, ideally at least 4 |
| 10-inch tablet screenshots | Only if we support tablets | As for 7-inch |

**Recommendation: phone only for the first release.**
- The manifest doesn't block tablets: there's no `screenOrientation` or `<supports-screens>`
  limit (`frontend/android/app/src/main/AndroidManifest.xml`), so the app *installs* on tablets.
- The UI, though, is a phone-width layout (`max-w-sm` / `max-w-2xl` containers, e.g.
  `frontend/src/app/account/page.tsx:101`).
- **UNSURE:** I haven't checked how it looks on a tablet. If you later add tablet screenshots,
  check the pages on a 10" emulator first.

**Recommended capture size:** **1080 × 1920** portrait, PNG, from a Pixel-class emulator. That's
9:16 and meets the 1080 px promotion minimum. Flatten to remove alpha: `sips` keeps alpha, so
export as JPEG or use the command at the end.

## The 7 screens to capture

Use the **review account or a dedicated demo account** with **made-up data only**:
- invented names;
- phone numbers like `+91 90000 00001`;
- **no real user's listing or contact** (see app-access.md and policy-check.md items 6 and 7).

Don't show third-party brand names or logos (BookMyShow, PVR, INOX, IPL, team logos) in
screenshots or captions. Use generic event names like "Evening Show - Screen 2" and
"City Stadium".

| # | Screen | Route / component | What it should show | Caption (optional, plain) |
|---|---|---|---|---|
| 1 | Home / nearby listings | `/` (`frontend/src/app/page.tsx`) | Search box and nearby listings with distance | "Find spare seats near you" |
| 2 | Search results | `/buy` (`frontend/src/app/buy/page.tsx`, `components/search/ListingResults.tsx`) | Results for an event, with the city picker visible | "Search by event or venue" |
| 3 | Listing detail | `/buy/[listingId]` | Event, venue, date and time, seats, price, seller rating, Verified badge, description | "See the details before you reserve" |
| 4 | Sell - ticket read from screenshot | `/sell` | The form auto-filled after uploading a demo ticket image (made-up event and barcode) | "List a ticket from a screenshot" |
| 5 | Sell - venue on map | `/sell` (`components/sell/VenuePicker.tsx`) | Venue pin on the map, **with the OpenStreetMap attribution visible** (OSM licence requires it) | "Pick the venue" |
| 6 | Reserved - seller contact | `/buy/[listingId]` after reserving | Contact block with a fake name and number, Report button, and the contact-only disclaimer | "Contact the seller directly" |
| 7 | Ticket alerts | `/account/alerts` + `NotifyMeCard` | An alert or two, and the notification on the device if you can | "Get alerts for tickets you want" |
| 8 (optional) | My listings / Account | `/sell/my-listings` or `/account` | Listing with view count, mark sold or withdraw | "Manage your listings" |

**Captions:** keep them short and factual. No "#1", "best", "free" or price claims (metadata
policy). Captions are optional; plain device screenshots are fine.

## App icon (512 × 512) - exists only as a source, must be exported

- **Exists:**
  - `frontend/resources/icon.png`: **1024 × 1024**, **no alpha channel** (checked with `sips`).
    Used to generate the launcher icons.
  - `frontend/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (iOS, also
    1024).
- **Must make:**
  - A 512 × 512 **32-bit** PNG (RGBA).
  - Play draws its own rounded mask and shadow, so give it a **full-bleed square**: no rounded
    corners, no drop shadow.
  - Keep it under 1024 KB.

Local command (makes a new file only; doesn't change the source):

```sh
mkdir -p docs/play-store/assets
sips -z 512 512 frontend/resources/icon.png --out docs/play-store/assets/icon-512.png
# sips keeps the source's lack of alpha. Add an alpha channel (32-bit) with ImageMagick if installed:
magick docs/play-store/assets/icon-512.png -alpha on PNG32:docs/play-store/assets/icon-512.png
sips -g pixelWidth -g pixelHeight -g hasAlpha docs/play-store/assets/icon-512.png
```

**UNSURE:** Play has accepted 24-bit icons in the past but specifies 32-bit. The `PNG32:` step
removes the doubt. If ImageMagick isn't installed, export from any image editor as "PNG-24 with
transparency" or "RGBA".

## Feature graphic (1024 × 500) - does not exist, must be made

- **Exists:** nothing. I found no 1024 × 500 or "feature" image in the repo.
  `frontend/resources/splash.png` (2732 × 2732) is the splash, not usable as-is.
- **Must make:**
  - A **1024 × 500** JPEG or 24-bit PNG with **no alpha**.
  - Suggested content: the GrabMySeats wordmark or icon on the brand's dark background, with one
    short line such as "Spare tickets, near you".
  - **Keep the important content centred.** Play can crop the edges and overlay a play button
    when there's a promo video.
  - Same rules as captions: no rank, price, "free" or "new", and no third-party logos.
- **UNSURE:** the exact brand colours. Take them from the Tailwind theme (`frontend/tailwind.config.*`,
  the `gold` / `background` tokens) so the graphic matches the app.

## Flattening screenshots (remove alpha)

```sh
# For each PNG screenshot, write a JPEG copy (JPEG has no alpha):
for f in shots/*.png; do sips -s format jpeg -s formatOptions 90 "$f" --out "${f%.png}.jpg"; done
```

## Checklist before upload

- [ ] Icon 512 × 512, RGBA PNG, ≤ 1 MB
- [ ] Feature graphic 1024 × 500, no alpha
- [ ] 4-8 phone screenshots, 1080 × 1920, no alpha, demo data only, no third-party logos
- [ ] No real names or phone numbers visible
- [ ] OSM attribution visible on the map screenshot
- [ ] Tablet screenshots only if tablets are supported and the layout has been checked
