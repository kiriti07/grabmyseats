// Showtimes are India time (Asia/Kolkata, UTC+05:30, no daylight saving)
// wall-clock values, stored with those same numbers in the UTC fields:
// 10:30 PM IST on 18 Sep 2026 is stored as "2026-09-18T22:30:00.000Z". Every
// saved listing, the OCR parser and the frontend's display (format.ts,
// timeZone: "UTC") already use this, so it's kept rather than converting
// to the true instant (which would shift every existing listing by 5:30).
//
// The one consequence: "now" has to be expressed the same way before it
// can be compared with a showtime - real UTC now plus 5:30.
export const SHOWTIME_TIME_ZONE = "Asia/Kolkata";
export const SHOWTIME_UTC_OFFSET_MINUTES = 330;

// The current moment in showtime representation: IST wall clock in the
// UTC fields (read it with getUTC*).
export function showtimeClockNow(nowMs: number = Date.now()): Date {
  return new Date(nowMs + SHOWTIME_UTC_OFFSET_MINUTES * 60_000);
}

export function isShowtimeInFuture(showtime: Date | string, nowMs: number = Date.now()): boolean {
  return new Date(showtime).getTime() > showtimeClockNow(nowMs).getTime();
}
