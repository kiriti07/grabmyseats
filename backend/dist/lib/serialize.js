"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSharedUser = toSharedUser;
exports.toSharedListing = toSharedListing;
exports.toListingDetail = toListingDetail;
exports.toMyListing = toMyListing;
exports.toSharedTransaction = toSharedTransaction;
exports.toSharedTicketAlert = toSharedTicketAlert;
exports.toSharedFraudReport = toSharedFraudReport;
exports.toSharedReviewFlag = toSharedReviewFlag;
exports.toSharedAdminUser = toSharedAdminUser;
exports.toAdminUserSummary = toAdminUserSummary;
exports.toSharedRating = toSharedRating;
const config_1 = require("./config");
function toSharedUser(user) {
    return {
        id: user.id,
        phone: user.phone,
        name: user.name,
        trustScore: user.trustScore,
        strikes: user.strikes,
        createdAt: user.createdAt.toISOString(),
        profileImageUrl: user.profileImageUrl,
        email: user.email,
        fullName: user.fullName,
        dateOfBirth: user.dateOfBirth?.toISOString() ?? null,
        gender: user.gender,
        address: user.address,
        hasWhatsapp: user.hasWhatsapp,
    };
}
function toSharedListing(listing) {
    return {
        id: listing.id,
        sellerId: listing.sellerId,
        category: listing.category,
        movieName: listing.movieName,
        theaterName: listing.theaterName,
        theaterLat: listing.theaterLat,
        theaterLng: listing.theaterLng,
        showtime: listing.showtime.toISOString(),
        bookingId: listing.bookingId,
        totalSeats: listing.totalSeats,
        availableSeats: listing.availableSeats,
        pricePerSeat: listing.pricePerSeat,
        totalAmountPaid: listing.totalAmountPaid,
        qrData: listing.qrData,
        screenshotUrl: listing.screenshotUrl,
        status: listing.status,
        availableDeliveryMethods: listing.availableDeliveryMethods,
        createdAt: listing.createdAt.toISOString(),
    };
}
// Deliberately omits screenshotUrl - see the comment on ListingDetail in
// shared/src/listing.ts. Buyers never see the raw screenshot pre-purchase
// (it exposes the QR code and booking ID); it's only ever revealed via
// GET /api/transactions/:id/screenshot once the transaction is escrowed.
function toListingDetail(listing, distanceKm, sellerRatingSummary) {
    return {
        id: listing.id,
        category: listing.category,
        movieName: listing.movieName,
        theaterName: listing.theaterName,
        showtime: listing.showtime.toISOString(),
        totalSeats: listing.totalSeats,
        availableSeats: listing.availableSeats,
        pricePerSeat: listing.pricePerSeat,
        status: listing.status,
        distanceKm,
        availableDeliveryMethods: listing.availableDeliveryMethods,
        paymentMode: config_1.PAYMENT_MODE,
        sellerRatingSummary,
    };
}
function toMyListing(listing) {
    return {
        id: listing.id,
        category: listing.category,
        movieName: listing.movieName,
        theaterName: listing.theaterName,
        showtime: listing.showtime.toISOString(),
        totalSeats: listing.totalSeats,
        availableSeats: listing.availableSeats,
        // availableSeats is now kept correct end-to-end (POST /:id/reserve and
        // jobs/expireReservations.ts both maintain it - see their comments),
        // so this reads straight off it instead of re-deriving from
        // transactions. Keeping two mechanisms that compute the same number
        // is exactly how they'd eventually disagree - this is the one source
        // of truth now.
        seatsSold: listing.totalSeats - listing.availableSeats,
        pricePerSeat: listing.pricePerSeat,
        totalAmountPaid: listing.totalAmountPaid,
        screenshotUrl: listing.screenshotUrl,
        status: listing.status,
        availableDeliveryMethods: listing.availableDeliveryMethods,
        createdAt: listing.createdAt.toISOString(),
        transactions: listing.transactions.map((txn) => ({
            id: txn.id,
            seatsCount: txn.seatsCount,
            amountPaid: txn.amountPaid,
            status: txn.status,
            confirmedAt: txn.confirmedAt?.toISOString() ?? null,
            payoutAt: txn.payoutAt?.toISOString() ?? null,
        })),
    };
}
function toSharedTransaction(txn) {
    return {
        id: txn.id,
        listingId: txn.listingId,
        buyerId: txn.buyerId,
        seatsCount: txn.seatsCount,
        amountPaid: txn.amountPaid,
        status: txn.status,
        deliveryMethod: txn.deliveryMethod,
        reservationExpiresAt: txn.reservationExpiresAt?.toISOString() ?? null,
        razorpayOrderId: txn.razorpayOrderId,
        transferId: txn.transferId,
        refundId: txn.refundId,
        refundedAt: txn.refundedAt?.toISOString() ?? null,
        buyerCheckInLat: txn.buyerCheckInLat,
        buyerCheckInLng: txn.buyerCheckInLng,
        buyerCheckInAt: txn.buyerCheckInAt?.toISOString() ?? null,
        sellerCheckInLat: txn.sellerCheckInLat,
        sellerCheckInLng: txn.sellerCheckInLng,
        sellerCheckInAt: txn.sellerCheckInAt?.toISOString() ?? null,
        emailForwardSubmittedAt: txn.emailForwardSubmittedAt?.toISOString() ?? null,
        confirmedAt: txn.confirmedAt?.toISOString() ?? null,
        payoutAt: txn.payoutAt?.toISOString() ?? null,
        createdAt: txn.createdAt.toISOString(),
    };
}
function toSharedTicketAlert(alert) {
    return {
        id: alert.id,
        titleQuery: alert.titleQuery,
        cityId: alert.cityId,
        lat: alert.lat,
        lng: alert.lng,
        radiusKm: alert.radiusKm,
        category: alert.category,
        isActive: alert.isActive,
        createdAt: alert.createdAt.toISOString(),
        expiresAt: alert.expiresAt.toISOString(),
    };
}
function toSharedFraudReport(report) {
    return {
        id: report.id,
        reporterId: report.reporterId,
        reportedUserId: report.reportedUserId,
        relatedTransactionId: report.relatedTransactionId,
        description: report.description,
        evidenceUrls: report.evidenceUrls,
        status: report.status,
        createdAt: report.createdAt.toISOString(),
        reviewedAt: report.reviewedAt?.toISOString() ?? null,
    };
}
function toSharedReviewFlag(flag) {
    return {
        id: flag.id,
        transactionId: flag.transactionId,
        reason: flag.reason,
        razorpayOrderId: flag.razorpayOrderId,
        amountPaid: flag.amountPaid,
        createdAt: flag.createdAt.toISOString(),
        resolvedAt: flag.resolvedAt?.toISOString() ?? null,
    };
}
// Never include passwordHash - this is what every admin-facing response
// (login, GET/POST/PATCH /api/admin/staff) sends instead of the raw row.
function toSharedAdminUser(admin) {
    return {
        id: admin.id,
        username: admin.username,
        role: admin.role,
        isActive: admin.isActive,
        createdByAdminId: admin.createdByAdminId,
        createdAt: admin.createdAt.toISOString(),
    };
}
// GET /api/admin/users (phone lookup) response shape - see the comment on
// AdminUserSummary in shared/src/admin.ts for why this exposes
// suspension fields that toSharedUser (customer-facing) doesn't.
function toAdminUserSummary(user) {
    return {
        id: user.id,
        phone: user.phone,
        name: user.name,
        fullName: user.fullName,
        suspendedAt: user.suspendedAt?.toISOString() ?? null,
        suspensionReason: user.suspensionReason,
        createdAt: user.createdAt.toISOString(),
    };
}
// POST /api/transactions/:id/rate response shape - the full row, since
// only the rater themselves ever sees this response (a rating's public
// footprint elsewhere is only ever through RatingSummary, which never
// carries raterId - see shared/src/rating.ts).
function toSharedRating(rating) {
    return {
        id: rating.id,
        raterId: rating.raterId,
        ratedUserId: rating.ratedUserId,
        transactionId: rating.transactionId,
        stars: rating.stars,
        comment: rating.comment,
        createdAt: rating.createdAt.toISOString(),
    };
}
//# sourceMappingURL=serialize.js.map