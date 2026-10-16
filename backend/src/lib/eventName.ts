// Whether a ticket alert's event name and a listing's event name are the same
// event (jobs/matchAlerts.ts, routes/alerts.ts). Deliberately strict - a
// different number or subtitle is a different event:
//
// 1. Both names are reduced to a key: lower case, anything in ( ) or [ ]
//    removed, punctuation turned into spaces, and noise words dropped -
//    certificates (U, U/A, A, S), formats (IMAX, 3D, ...) and languages.
// 2. Same key -> same event. "Jailer" = "JAILER (U/A)" = "Jailer - Telugu
//    IMAX 3D".
// 3. One typo is forgiven: the same words except one, which isn't a number,
//    has 5+ letters and is one letter off (two, if it has 9+): "Jailor" =
//    "Jailer", but "Leo" != "Leon", "Jailer" != "Jailer 2", and "The
//    Rule" != "The Rise".
// 4. A subtitle after ":" or a spaced "-" may be missing on either side,
//    when what comes before it matches the other name in full (by 2-3, so
//    numbers must still be equal): "Pushpa 2" = "Pushpa 2: The Rule" (and
//    the reverse), "Coldplay" = "Coldplay: Music of the Spheres". Two
//    different subtitles never match: "Pushpa 2: The Rule" != "Pushpa 2:
//    The Rise".

const NOISE_WORDS = new Set([
  // certificates
  "u", "ua", "a", "s",
  // formats
  "2d", "3d", "4d", "4dx", "imax", "screenx", "dolby", "atmos", "epiq", "ice", "pxl", "onyx", "laser", "70mm",
  // languages
  "telugu", "tamil", "hindi", "english", "malayalam", "kannada", "bengali", "marathi", "punjabi", "gujarati", "odia",
]);

// ":" anywhere, or a dash with a space before it ("CSK vs RCB - IPL",
// "Salaar – Ceasefire") - not the hyphen inside "Spider-Man".
const SUBTITLE_SEPARATOR = /:|\s[-–—]/;

export function eventKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !NOISE_WORDS.has(word))
    .join(" ");
}

// The key of the part before a subtitle separator, or null when the name
// has none.
function mainTitleKey(name: string): string | null {
  const match = SUBTITLE_SEPARATOR.exec(name);
  if (!match) return null;
  const key = eventKey(name.slice(0, match.index));
  return key || null;
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

function keysMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const wordsA = a.split(" ");
  const wordsB = b.split(" ");
  if (wordsA.length !== wordsB.length) return false;
  const differing = wordsA.flatMap((word, i) => (word === wordsB[i] ? [] : [[word, wordsB[i]]]));
  if (differing.length !== 1) return false;
  const [x, y] = differing[0];
  const shorter = Math.min(x.length, y.length);
  if (shorter < 5 || /\d/.test(x) || /\d/.test(y)) return false;
  return levenshtein(x, y) <= (shorter >= 9 ? 2 : 1);
}

export function eventNamesMatch(alertName: string, listingName: string): boolean {
  const alertKey = eventKey(alertName);
  const listingKey = eventKey(listingName);
  if (keysMatch(alertKey, listingKey)) return true;

  const listingMain = mainTitleKey(listingName);
  if (listingMain && keysMatch(alertKey, listingMain)) return true;
  const alertMain = mainTitleKey(alertName);
  return !!alertMain && keysMatch(alertMain, listingKey);
}
