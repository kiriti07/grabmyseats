export interface User {
  id: string;
  // A login identity once verified by SMS code (isPhoneVerified below);
  // until then self-reported, and shown as "Unverified" wherever it's
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
  // by POST /api/users/me/identifiers/claim/verify, or by the
  // send-verification -> GET /api/users/me/email/verify link. About email
  // only - phone has isPhoneVerified below. A verified email is required to
  // list, reserve or view contact details (always), as is a verified phone
  // when AuthOptions.requirePhoneVerification is on - see the "finish
  // verifying" banner on /account. Powers the "Verified" badge on /account; the seller/contact
  // equivalent for a user viewed through a listing or transaction is
  // ListingDetail.sellerIsVerified / TransactionContact.isVerified below,
  // not this field (neither of those embeds a full User).
  isVerified: boolean;
  // Derived, like isVerified: phone set and proven by SMS code.
  isPhoneVerified: boolean;
}

export type IdentifierChannel = "email" | "phone";

// GET /api/auth/options - what the sign-in/sign-up and verification screens
// may offer. phoneOtpAvailable is false in production until a real SMS
// provider is configured (codes would never arrive); smsCountryCodes are
// the calling codes (no "+") phone codes may be sent to.
export interface AuthOptions {
  phoneOtpAvailable: boolean;
  requirePhoneVerification: boolean;
  smsCountryCodes: string[];
}

// POST /api/auth/otp/verify (and POST /api/auth/signup/confirm, which only
// ever returns the first shape). noAccount only comes back for a sign-in
// whose (now proven) identifier has no account - signupToken then confirms
// "create an account?" without a second code.
export type OtpVerifyResult =
  | { user: User; token: string; isNewAccount: boolean }
  | { noAccount: true; signupToken: string };

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
  // requestIdentifierClaimCode/verifyIdentifierClaimCode).
  email?: string;
  // Omitted = unchanged, "" = clear (refused while the user has live
  // listings). E.164. Same rule as email once verified: 409 here, change
  // it through the claim flow.
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
// PATCH /api/users/me/profile. Verified identifiers aren't set here - they
// go through POST /api/users/me/identifiers/claim/*. phone is the
// *unverified* fallback for an email signup when SMS codes aren't
// available; required to sell either way. hasWhatsapp applies to whichever
// phone is on file.
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
