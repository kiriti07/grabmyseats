# Play Console - Content rating (IARC questionnaire)

Console → Policy → App content → **Content rating** → Start questionnaire.

**UNCERTAIN (question wording):** IARC changes the exact question text and order now and then, and
it isn't published outside the Console. So each answer below is grouped by topic. Match each
Console question to the closest topic, and pick the most specific answer the Console offers.

- **Email for the rating certificate:** `support@grabmyseats.com`
- **Category:** "All Other App Types". IARC's category for apps that aren't games, social
  networks or streaming stores (sometimes worded "Utility, Productivity, Communication, or
  Other"). Don't pick these:
  - **Not "Social Networking / UGC sharing":** there are no feeds, profiles to follow or in-app
    messages.
  - **Not "Consumer Store / Commercial Streaming":** we don't sell digital content, and no money
    goes through the app (`PAYMENT_MODE=contact_only`).

## Content questions

| Topic | Answer | Reasoning / evidence |
|---|---|---|
| Violence (any kind, realistic or fantasy, blood, gore) | **No** | Ticket listings only |
| Fear / horror content | **No** | We show movie titles as text and generate no posters or trailers. **UNCERTAIN:** if listing images ever show film posters, revisit this. Today no listing image is stored or shown (`listings.ts` ~L336) |
| Sexual content, nudity, sexual innuendo | **No** | None in the app. User text is limited to a 300-character description and rating comments (see user interaction) |
| Profanity / crude humour | **No** | We write none. User text is covered by the user-interaction answers |
| Controlled substances (drugs, alcohol, tobacco) | **No** | Nothing referenced, sold or promoted |
| Gambling / simulated gambling / real-money games | **No** | No betting or prizes. Referral points have no cash value (`frontend/src/content/legal/terms.ts` section 7) and can't be redeemed yet ("Redeem - Coming Soon", `frontend/src/app/account/page.tsx:235`) |
| Discriminatory / hateful content | **No** | None |
| Promotes age-restricted products or activities | **No** | Event tickets aren't age-restricted products. **UNCERTAIN:** a user could list a ticket for an A-rated (adult) film. The app is 18+ only (`terms.ts:37`), so answer No |

## Interactive elements and other questions

| Topic | Answer | Reasoning / evidence |
|---|---|---|
| **Users can interact or exchange content with each other** | **Yes** | Users can do all of the following:<br>- read other users' listing descriptions (`shared/src/listingDetails.ts:121`);<br>- read rating comments (`backend/src/lib/ratingSummary.ts:19`);<br>- see each other's name and phone after a reservation (`listings.ts` ~L985), then talk by phone or WhatsApp outside the app.<br>There's no in-app chat. |
| **Shares users' personal information with other users or third parties** | **Yes** | A seller's name, phone number and WhatsApp flag go to the buyer who reserves (`listings.ts` ~L995). A buyer's go to the seller (`backend/src/routes/transactions.ts:678`) |
| **Shares the user's current physical location with other users** | **No** | The user's location is sent only to our server for search, and to alerts. Other users never see it. A listing shows the **venue** (a public cinema or stadium), not where the seller is |
| **Digital purchases / in-app purchases** | **No** | No Play Billing, no digital goods. Ticket deals happen between users outside the app (`terms.ts` section 1) |
| Unrestricted internet access / web browser | **No** | The app shows only `https://grabmyseats.com` (`frontend/capacitor.config.ts`). The only links out are `tel:` and WhatsApp deep links (`frontend/src/components/ui/ContactPhone.tsx:29`, `WhatsAppButton.tsx`) and the OpenStreetMap tile images in the venue map. **UNCERTAIN:** if your form has a separate "links to external websites" question, answer it **Yes**, since terms or help pages may link out |
| Ads | **No** | No ads SDK. **Separately**, answer "No" to Console → App content → Ads |
| Is the app primarily for or targeting children | **No** | Target audience: 18+ only (`terms.ts:37`, `frontend/src/content/legal/privacy.ts:85`) |
| Is it a news app? (separate App content section) | **No** | |

## Expected result (for a sanity check)

- With "users interact" and "shares personal info" set to Yes, ratings usually land around **ESRB
  Everyone/Teen, PEGI 3-12, IARC 3+-12+**.
- They also come with the interactive-element notices **"Users Interact"** and **"Shares Info"**.
- **Not a promise.** IARC decides. If it shows anything with violence or gambling, re-check the
  answers.

## Things that would change these answers

- Turning on in-app payments (Razorpay escrow). This is still not a "digital purchase", because
  the goods are physical event tickets, but re-read the payments question if it comes up.
- Adding in-app chat between users. It adds messaging, which is more UGC exposure and needs
  blocking (see policy-check.md).
- Showing film posters or trailers.
