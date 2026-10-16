import { ALERT_MAX_DATES } from "@grabmyseats/shared";

// The alert form's picked dates ("YYYY-MM-DD", India): kept sorted and
// unique, at most ALERT_MAX_DATES. The server re-checks everything
// (shared alertDatesProblem).

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function toggleAlertDate(dates: string[], date: string): string[] {
  if (dates.includes(date)) return dates.filter((d) => d !== date);
  if (dates.length >= ALERT_MAX_DATES) return dates;
  return [...dates, date].sort();
}

// "Tue 20 Oct" - short enough for chips on a phone.
export function shortAlertDate(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return date;
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// "Tue 20 Oct, Thu 22 Oct and 3 more" - for the alert list.
export function describeAlertDates(dates: string[], shown = 3): string {
  if (dates.length === 0) return "Any date";
  const labels = [...dates].sort().map(shortAlertDate);
  if (labels.length <= shown) return labels.join(", ");
  return `${labels.slice(0, shown).join(", ")} and ${labels.length - shown} more`;
}
