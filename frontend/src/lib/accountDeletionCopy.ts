// What account deletion removes and keeps - shown on /account/delete and on
// the public /delete-account page (Google Play's deletion URL), so both
// always say the same thing. Must match backend lib/accountDeletion.ts and
// jobs/purgeDeletedAccountRecords.ts (DELETED_ACCOUNT_RETENTION_YEARS).

export const DELETION_RETENTION_YEARS = 3;

export const DELETION_DELETED = [
  "Your email address, phone number and name, and your profile details (photo, date of birth, gender, address).",
  "Your listings that are still live - they're withdrawn and no longer shown.",
  "Any seats you're holding, and any holds on your tickets - they're released.",
  "Your ticket alerts, your record of listings you viewed or contacted, and your points.",
  "The written comments in ratings you gave.",
  "Your referral link.",
];

export const DELETION_KEPT = [
  "The stars of ratings you gave (without your comments or name), so sellers' averages stay accurate.",
  "Past listings and transactions, without anything that identifies you.",
  `Reports about you and any suspension record, for fraud prevention - deleted after ${DELETION_RETENTION_YEARS} years.`,
  `If your account was suspended: a one-way code made from your email address and phone number (they can't be read back from it), so they can't be used to sign up again - deleted after ${DELETION_RETENTION_YEARS} years.`,
  "Reports you made about other users stay with those users' records.",
];

// The first confirmation step: the exact word, ignoring surrounding spaces
// (the server requires exactly "DELETE" too).
export function isDeleteConfirmation(typed: string): boolean {
  return typed.trim() === "DELETE";
}
