export interface User {
  id: string;
  phone: string;
  name: string | null;
  trustScore: number;
  strikes: number;
  createdAt: string;
  // Profile fields - see GET/PATCH /api/users/me/profile. phone above is
  // the OTP-verified login identity and isn't editable through that
  // endpoint.
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
  email?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  hasWhatsapp: boolean;
}

// POST /api/auth/complete-profile request body - the one-time "who are
// you" step shown right after a brand-new signup (see isNewAccount on the
// POST /api/auth/otp/verify response). Sets User.name/email directly -
// deliberately not UpdateProfileInput's fullName/dateOfBirth/etc, which
// are a separate, later-in-the-relationship set of fields edited via
// PATCH /api/users/me/profile.
export interface CompleteProfileInput {
  name: string;
  email?: string;
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
