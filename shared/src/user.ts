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
