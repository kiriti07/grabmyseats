import type { Category } from "./listing";

// Optional seller-written extras on a listing: a seat type (from a fixed
// list per category) and a short plain-text description. The backend
// (POST/PATCH /api/listings) runs these same checks and is the one that
// counts; the sell form and My Listings run them first only to show the
// message sooner. Neither field is part of alert matching, the ticket
// fingerprint, or push notification text.

export interface SeatTypeOption {
  value: string;
  label: string;
}

// The allowed seat types per category, in the order the dropdown shows
// them. Stored as the plain `value` (Listing.seatType is TEXT, not an enum),
// so adding options - including the first EVENT/SPORT ones - is just an edit
// here, no migration. A category with no options shows no dropdown and
// accepts no seat type.
export const SEAT_TYPE_OPTIONS: Record<Category, readonly SeatTypeOption[]> = {
  MOVIE: [
    { value: "RECLINER", label: "Recliner" },
    { value: "TOP_ROW", label: "Top row" },
    { value: "MIDDLE_ROW", label: "Middle row" },
    { value: "BOTTOM_ROW", label: "Bottom row" },
  ],
  EVENT: [],
  SPORT: [],
};

// The dropdown's empty choice - saved as no seat type (null).
export const SEAT_TYPE_SKIP_LABEL = "Not sure / skip";

export const LISTING_DESCRIPTION_MAX = 300;

export const LISTING_DESCRIPTION_CONTACT_MESSAGE =
  "Please don't put contact details or links here. Buyers get your contact after reserving.";

export type ListingDetailCheck =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

export function categoryHasSeatTypes(category: Category): boolean {
  return SEAT_TYPE_OPTIONS[category].length > 0;
}

// Display label for a stored seat type, or null for none - and for a value
// no longer in the list, which is then simply not shown.
export function seatTypeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  for (const options of Object.values(SEAT_TYPE_OPTIONS)) {
    const match = options.find((o) => o.value === value);
    if (match) return match.label;
  }
  return null;
}

// Not sent, null or "" = no seat type. Anything else must be one of this
// category's options.
export function checkSeatType(category: Category, raw: unknown): ListingDetailCheck {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "seatType must be text" };
  const options = SEAT_TYPE_OPTIONS[category];
  if (options.length === 0) return { ok: false, error: "Seat type isn't available for this category" };
  if (!options.some((o) => o.value === raw)) {
    return { ok: false, error: `seatType must be one of ${options.map((o) => o.value).join(", ")}` };
  }
  return { ok: true, value: raw };
}

// Zero-width and text-direction characters: invisible, and used to hide
// contact details from the checks below (or to reorder how text displays).
const INVISIBLE_CHARS = /[­​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

// The stored form: invisible characters removed, control characters and
// every run of whitespace (line breaks included) collapsed to one space,
// trimmed. Empty becomes null.
export function normalizeListingDescription(raw: string): string | null {
  const text = raw.replace(INVISIBLE_CHARS, "").replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

const EMAIL_RE =
  /[a-z0-9._%+-]+\s*(?:@|\(\s*at\s*\)|\[\s*at\s*\]|\{\s*at\s*\})\s*[a-z0-9-]+(?:\s*(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\])\s*[a-z0-9-]+)*\s*(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\])\s*[a-z]{2,}/i;

const LINK_TLDS = "com|in|net|org|io|me|co|app|link|ly|xyz|info|biz|site|online|shop|store|live|gg|to";
const LINK_RES = [
  /\b[a-z][a-z0-9+.-]*:\/\//i, // http://, https://, any scheme://
  /\bwww\s*\./i,
  /\b(?:wa\.me|t\.me|bit\.ly|tinyurl\.com|goo\.gl)\b/i,
  new RegExp(`\\b[a-z0-9][a-z0-9-]*\\.(?:${LINK_TLDS})\\b`, "i"),
  new RegExp(`(?:\\(\\s*dot\\s*\\)|\\[\\s*dot\\s*\\]|\\bdot)\\s*(?:${LINK_TLDS})\\b`, "i"),
];

// A run of digits joined only by short separators: "98765 43210",
// "+91-98765-43210", "(040) 2345 6789", "9 8 7 6 5 4 3 2 1 0".
const DIGIT_RUN_RE = /\+?\d(?:[\s().+-]{0,2}\d)+/g;
// Indian mobile (optionally +91 / 91 / 0 first). Any other run of 11+
// digits is treated as a phone number too (landlines with an STD code,
// other countries).
const INDIAN_MOBILE_RE = /^(?:91|0)?[6-9]\d{9}$/;

function containsPhoneNumber(text: string): boolean {
  for (const run of text.match(DIGIT_RUN_RE) ?? []) {
    const digits = run.replace(/\D/g, "");
    if (INDIAN_MOBILE_RE.test(digits) || digits.length >= 11) return true;
  }
  return false;
}

export function containsContactDetails(text: string): boolean {
  // NFKC folds look-alikes (fullwidth digits, "＠") into the ASCII forms the
  // patterns expect - for checking only; the stored text is left as typed.
  const folded = text.normalize("NFKC");
  return EMAIL_RE.test(folded) || LINK_RES.some((re) => re.test(folded)) || containsPhoneNumber(folded);
}

// Not sent, null, or blank after normalizing = no description.
export function checkListingDescription(raw: unknown): ListingDetailCheck {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "description must be text" };
  const text = normalizeListingDescription(raw);
  if (text === null) return { ok: true, value: null };
  if (text.length > LISTING_DESCRIPTION_MAX) {
    return { ok: false, error: `Description must be ${LISTING_DESCRIPTION_MAX} characters or fewer` };
  }
  if (containsContactDetails(text)) return { ok: false, error: LISTING_DESCRIPTION_CONTACT_MESSAGE };
  return { ok: true, value: text };
}
