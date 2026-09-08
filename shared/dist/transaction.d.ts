import type { PaymentMode } from "./config";
import type { RatingSummary } from "./rating";
export type TxnStatus = "PENDING" | "RESERVED" | "EXPIRED" | "ESCROWED" | "BUYER_CONFIRMED" | "PAYOUT_RELEASED" | "DISPUTED" | "REFUNDED";
export type DeliveryMethod = "IN_PERSON" | "EMAIL_FORWARD";
export interface Transaction {
    id: string;
    listingId: string;
    buyerId: string;
    seatsCount: number;
    amountPaid: number;
    status: TxnStatus;
    deliveryMethod: DeliveryMethod;
    reservationExpiresAt: string | null;
    razorpayOrderId: string | null;
    transferId: string | null;
    refundId: string | null;
    refundedAt: string | null;
    buyerCheckInLat: number | null;
    buyerCheckInLng: number | null;
    buyerCheckInAt: string | null;
    sellerCheckInLat: number | null;
    sellerCheckInLng: number | null;
    sellerCheckInAt: string | null;
    emailForwardSubmittedAt: string | null;
    confirmedAt: string | null;
    payoutAt: string | null;
    createdAt: string;
}
export interface TransactionContact {
    name: string | null;
    phone: string;
    hasWhatsapp: boolean;
    ratingSummary: RatingSummary | null;
}
export interface TransactionEmailForward {
    text: string | null;
    fileUrl: string | null;
    submittedAt: string | null;
}
export interface TransactionDetail {
    transaction: Transaction;
    listing: {
        id: string;
        movieName: string;
        theaterName: string;
        showtime: string;
    };
    party: "buyer" | "seller";
    paymentMode: PaymentMode;
}
export interface ReserveResult {
    transaction: Transaction;
    contact: TransactionContact | null;
    paymentMode: PaymentMode;
}
export interface MyPurchase {
    id: string;
    status: TxnStatus;
    seatsCount: number;
    amountPaid: number;
    createdAt: string;
    listing: {
        id: string;
        movieName: string;
        theaterName: string;
        showtime: string;
    };
    isRated: boolean;
}
