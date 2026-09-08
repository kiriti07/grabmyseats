export interface OcrExtractedFields {
    movieName: string | null;
    theaterName: string | null;
    showtime: string | null;
    totalSeats: number | null;
    pricePerSeat: number | null;
    bookingId: string | null;
    totalAmountPaid: number | null;
}
export interface OcrResult {
    fields: OcrExtractedFields;
    qrData: string | null;
}
