export interface User {
  id: string;
  // Self-reported and never verified (there's no phone verification - SMS
  // OTP isn't wired up), so it's always shown as "Unverified" wherever it's
  // revealed. null until the user adds one; required before selling (POST
  // /api/listings).
  phone: string | null;
  name: string | null;
  trustScore: number;
  strikes: number;
  createdAt: string;
  // Profile fields - see GET/PATCH /api/users/me/profile. email doubles as
  // the login identity once verified (isVerified below) - see
  // backend/src/lib/emailIdentity.ts.
  profileImageUrl: string | null;
  email: string | null;
  fullName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  // Self-reported: does `phone` above also take WhatsApp messages? Shown
  // to the other party at contact reveal (see TransactionContact in
  // ./transaction.ts) alongside phone, so it's meaningless without phone
  // and never exposed on its own.
  hasWhatsapp: boolean;
  // Derived (backend/src/lib/serialize.ts's isUserVerified), not a stored
  // column - true once email is both set and verified: by email-OTP login,
  // by POST /api/users/me/email/claim/verify, or by the
  // send-verification -> GET /api/users/me/email/verify link. Phone never
  // counts toward this (it's unverified). false means this account has no
  // working login identity yet - see the "add an email" banner on
  // /account. Powers the "Verified" badge on /account; the seller/contact
  // equivalent for a user viewed through a listing or transaction is
  // ListingDetail.sellerIsVerified / TransactionContact.isVerified below,
  // not this field (neither of those embeds a full User).
  isVerified: boolean;
}

// PATCH /api/users/me/profile request body (sent as multipart/form-data so
// profileImage can ride along - see the frontend's updateProfile). Every
// text field here is a full replace, not a partial merge: the edit form
// always submits the whole profile, so an omitted/blank optional field
// means "clear it", not "leave unchanged". profileImageUrl is the one
// exception - it only changes when a new profileImage file is actually
// attached; there's no "remove my photo" affordance yet. hasWhatsapp is a
// checkbox, not a free-text field, so it's always sent (no "omitted means
// unchanged" case the way the text fields have).
export interface UpdateProfileInput {
  fullName: string;
  // Ignored when unchanged; a *verified* email can't be changed here (409)
  // - that goes through the claim flow instead (see the frontend's
  // requestEmailClaimCode/verifyEmailClaimCode).
  email?: string;
  // Omitted = unchanged, "" = clear (refused while the user has live
  // listings). E.164.
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  hasWhatsapp: boolean;
}

// GET /api/users/me/delivery-eligibility response: whether this user
// currently qualifies to offer EMAIL_FORWARD as a seller. New sellers
// default to IN_PERSON-only until they've built a track record - see the
// trust gate in backend/src/lib/sellerTrust.ts, which this mirrors so the
// sell form can explain *why* the option is locked instead of just hiding
// it.
export interface SellerDeliveryEligibility {
  emailForwardEligible: boolean;
  completedSales: number;
  requiredCompletedSales: number;
  hasUnresolvedReviewFlags: boolean;
}

// POST /api/auth/complete-profile request body - the one-time "who are
// you" step shown right after a brand-new signup (see isNewAccount on the
// POST /api/auth/otp/verify response). Sets User.name/phone directly -
// deliberately not UpdateProfileInput's fullName/dateOfBirth/etc, which
// are a separate, later-in-the-relationship set of fields edited via
// PATCH /api/users/me/profile. Email isn't here: it's already the
// verified login identity. phone is optional at signup but required to
// sell; hasWhatsapp only applies when phone is given.
export interface CompleteProfileInput {
  name: string;
  phone?: string;
  hasWhatsapp?: boolean;
}

// GET /api/users/me/referrals response - see backend/src/lib/referral.ts.
// referralCode is the only piece needed to build the shareable link
// (<origin>/signup?ref=<code>); the frontend builds that full URL itself
// (same pattern as the existing Share feature's window.location.origin
// use in account/page.tsx) rather than the backend guessing its own public
// domain. referredCount only counts a referred user once they've
// completed a real listing or reservation - see REFERRAL_MILESTONE in
// backend/src/lib/referral.ts for why signup alone doesn't count.
export interface ReferralSummary {
  referralCode: string;
  referredCount: number;
  pointsBalance: number;
  // Both derived from the same 20-referral interval
  // (backend/src/lib/referral.ts's REFERRAL_MILESTONE_INTERVAL) - e.g. at
  // referredCount 23, nextMilestoneAt is 40 and referralsUntilNextMilestone
  // is 17.
  nextMilestoneAt: number;
  referralsUntilNextMilestone: number;
}
