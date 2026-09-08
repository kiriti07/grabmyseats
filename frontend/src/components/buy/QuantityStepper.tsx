export function QuantityStepper({
  value,
  max,
  onChange,
  disabled = false,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-4">
      <button
        type="button"
        disabled={disabled || value <= 1}
        onClick={() => onChange(Math.max(1, value - 1))}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-lg text-foreground hover:border-gold disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Decrease seats"
      >
        −
      </button>
      <span className="w-10 text-center font-display text-2xl tracking-wide text-foreground">
        {value}
      </span>
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-lg text-foreground hover:border-gold disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Increase seats"
      >
        +
      </button>
    </div>
  );
}
