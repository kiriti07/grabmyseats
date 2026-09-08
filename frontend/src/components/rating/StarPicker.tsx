"use client";

const STARS = [1, 2, 3, 4, 5];

// Plain 1-5 tap-to-pick star control for POST /api/transactions/:id/rate's
// stars field - no half-stars, matching the integer-only backend contract.
export function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {STARS.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n === value}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          disabled={disabled}
          onClick={() => onChange(n)}
          className={`text-2xl leading-none transition-colors disabled:cursor-not-allowed ${
            n <= value ? "text-gold" : "text-line hover:text-gold-dim"
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
