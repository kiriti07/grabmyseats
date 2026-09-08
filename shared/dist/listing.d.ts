import type { PaymentMode } from "./config";
import type { DeliveryMethod, TxnStatus } from "./transaction";
import type { RatingSummary } from "./rating";
export type ListingStatus = "ACTIVE" | "PARTIALLY_SOLD" | "SOLD" | "EXPIRED" | "FLAGGED" | "WITHDRAWN";
export declare const LIVE_LISTING_STATUSES: ListingStatus[];
export type Category = "MOVIE" | "EVENT" | "SPORT";
export interface Listing {
    id: string;
    sellerId: string;
    category: Category;
    movieName: string;
    theaterName: string;
    theaterLat: number;
    theaterLng: number;
    showtime: string;
    bookingId: string;
    totalSeats: number;
    availableSeats: number;
    availableDeliveryMethods: DeliveryMethod[];
    pricePerSeat: number;
    totalAmountPaid: number | null;
    qrData: string | null;
    screenshotUrl: string | null;
    status: ListingStatus;
    createdAt: string;
}
export interface UpdateListingInput {
    pricePerSeat?: number;
    showtime?: string;
    totalSeats?: number;
}
export interface ListingSearchResult {
    id: string;
    movieName: string;
    theaterName: string;
    showtime: string;
    availableSeats: number;
    pricePerSeat: number;
    distanceKm: number;
}
export interface ListingDetail {
    id: string;
    category: Category;
    movieName: string;
    theaterName: string;
    showtime: string;
    totalSeats: number;
    availableSeats: number;
    pricePerSeat: number;
    status: ListingStatus;
    distanceKm: number | null;
    availableDeliveryMethods: DeliveryMethod[];
    paymentMode: PaymentMode;
    sellerRatingSummary: RatingSummary;
}
export interface MyListingTransactionSummary {
    id: string;
    seatsCount: number;
    amountPaid: number;
    status: TxnStatus;
    confirmedAt: string | null;
    payoutAt: string | null;
}
export interface MyListing {
    id: string;
    category: Category;
    movieName: string;
    theaterName: string;
    showtime: string;
    totalSeats: number;
    availableSeats: number;
    seatsSold: number;
    pricePerSeat: number;
    totalAmountPaid: number | null;
    screenshotUrl: string | null;
    status: ListingStatus;
    availableDeliveryMethods: DeliveryMethod[];
    createdAt: string;
    transactions: MyListingTransactionSummary[];
}
