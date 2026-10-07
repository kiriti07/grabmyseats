// Marks a venue pin that's only its locality's position (e.g. "Kokapet"),
// not the venue's own - see VenuePicker and the sell form.
export function ApproximateBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs font-medium text-gold">
      Approximate location
    </span>
  );
}
