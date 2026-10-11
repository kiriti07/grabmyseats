"use client";

import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import {
  SHOWTIME_MINUTE_STEP,
  addDays,
  calendarDate,
  dateFromCalendar,
  formatShowtimeDate,
  istToday,
  latestShowtimeDate,
  partsToShowtimeIso,
  showtimeIsoToParts,
  showtimeProblem,
  type Meridiem,
} from "@/lib/showtime";

// Showtime field for the sell form and My Listings' edit form: a calendar
// popup for the date plus hour / minute / AM-PM selectors. The value is
// always India time, whatever the device's timezone - see lib/showtime.ts
// for the conversion to and from the stored value.
//
// `value` is the stored ISO string ("" until a date and a full time have
// been picked); onChange reports the new one, or "" while incomplete.

interface Draft {
  date: string;
  hour12: number | null;
  minute: number | null;
  meridiem: Meridiem | null;
}

const EMPTY_DRAFT: Draft = { date: "", hour12: null, minute: null, meridiem: null };

function draftFromValue(value: string): Draft {
  return showtimeIsoToParts(value) ?? EMPTY_DRAFT;
}

function isoFromDraft({ date, hour12, minute, meridiem }: Draft): string {
  if (!date || hour12 === null || minute === null || meridiem === null) return "";
  return partsToShowtimeIso({ date, hour12, minute, meridiem }) ?? "";
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const STEP_MINUTES = Array.from({ length: 60 / SHOWTIME_MINUTE_STEP }, (_, i) => i * SHOWTIME_MINUTE_STEP);

const SELECT_CLASS =
  "h-12 min-w-0 flex-1 appearance-none rounded-lg border border-line bg-surface px-3 text-center text-base text-foreground focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold";

export function ShowtimePicker({
  id,
  value,
  onChange,
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  // A message from the form (e.g. "Pick a showtime" on submit), shown
  // when the picked value itself has nothing to complain about.
  error?: string | null;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFromValue(value));
  const [open, setOpen] = useState(false);
  const lastEmitted = useRef(value);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // On wider screens the calendar drops down below the field and can end
  // up past the bottom of the window - bring all of it into view. (On
  // phones it's a fixed, centered dialog, which this leaves alone.)
  useEffect(() => {
    if (open) panelRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  // A value set from outside (OCR auto-fill, opening the edit form)
  // replaces the draft; our own onChange echoing back doesn't.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setDraft(draftFromValue(value));
    }
  }, [value]);

  function update(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    const iso = isoFromDraft(next);
    if (iso !== lastEmitted.current) {
      lastEmitted.current = iso;
      onChange(iso);
    }
  }

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function pickDate(date: string) {
    update({ date });
    close();
  }

  const today = istToday();
  const tomorrow = addDays(today, 1);
  const latest = latestShowtimeDate();
  const complete = isoFromDraft(draft);
  const message = (complete && showtimeProblem(complete)) || error || null;
  const messageId = `${id}-message`;

  // Keeps a stored minute that isn't on the 5-minute grid (an older listing,
  // or a ticket's own time) instead of silently rounding it.
  const minutes =
    draft.minute !== null && !STEP_MINUTES.includes(draft.minute)
      ? [...STEP_MINUTES, draft.minute].sort((a, b) => a - b)
      : STEP_MINUTES;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={message ? messageId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="flex h-12 w-full items-center justify-between rounded-lg border border-line bg-surface px-4 text-left text-base text-foreground focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
      >
        <span className={draft.date ? "" : "text-muted"}>
          {draft.date ? formatShowtimeDate(draft.date) : "Pick a date"}
        </span>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 shrink-0 fill-gold">
          <path d="M6 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Zm10 7H4v7h12V9Z" />
        </svg>
      </button>

      {open && (
        <>
          {/* Closes on a tap/click anywhere outside the calendar; dims the
              page on phones, where the calendar is a centered dialog. */}
          <div className="fixed inset-0 z-40 bg-black/60 sm:bg-transparent" onClick={close} aria-hidden="true" />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Choose the show date"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                close();
              }
            }}
            className="fixed inset-x-4 top-1/2 z-50 mx-auto max-w-sm -translate-y-1/2 rounded-xl border border-line bg-surface-raised p-3 shadow-2xl sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-max sm:translate-y-0"
          >
            <DayPicker
              mode="single"
              required
              autoFocus
              className="showtime-calendar mx-auto w-max"
              today={calendarDate(today)}
              selected={draft.date ? calendarDate(draft.date) : undefined}
              defaultMonth={calendarDate(draft.date && draft.date >= today && draft.date <= latest ? draft.date : today)}
              startMonth={calendarDate(today)}
              endMonth={calendarDate(latest)}
              disabled={[{ before: calendarDate(today) }, { after: calendarDate(latest) }]}
              onSelect={(day) => pickDate(dateFromCalendar(day))}
            />
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => pickDate(today)}
                className="h-11 rounded-lg border border-line text-sm font-medium text-foreground hover:border-gold"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => pickDate(tomorrow)}
                className="h-11 rounded-lg border border-line text-sm font-medium text-foreground hover:border-gold"
              >
                Tomorrow
              </button>
            </div>
          </div>
        </>
      )}

      <div className="mt-2 flex items-center gap-2" role="group" aria-label="Show time">
        <select
          aria-label="Hour"
          value={draft.hour12 ?? ""}
          onChange={(e) => update({ hour12: e.target.value ? Number(e.target.value) : null })}
          className={SELECT_CLASS}
        >
          <option value="" disabled>
            Hour
          </option>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className="text-muted">
          :
        </span>
        <select
          aria-label="Minute"
          value={draft.minute ?? ""}
          onChange={(e) => update({ minute: e.target.value ? Number(e.target.value) : null })}
          className={SELECT_CLASS}
        >
          <option value="" disabled>
            Min
          </option>
          {minutes.map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, "0")}
            </option>
          ))}
        </select>
        <div className="flex h-12 shrink-0 overflow-hidden rounded-lg border border-line">
          {(["AM", "PM"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={draft.meridiem === m}
              onClick={() => update({ meridiem: m })}
              className={`w-14 text-sm font-semibold transition-colors ${
                draft.meridiem === m ? "bg-gold text-[#1a1408]" : "bg-surface text-muted hover:text-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {message ? (
        <p id={messageId} role="alert" className="mt-1.5 text-sm text-error">
          {message}
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-muted">India time (IST)</p>
      )}
    </div>
  );
}
