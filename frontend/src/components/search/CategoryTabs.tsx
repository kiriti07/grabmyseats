import type { Category } from "@grabmyseats/shared";
import { CATEGORY_LABEL } from "@/lib/category";

// "ALL" isn't a real Category (the search endpoint just omits the category
// param for it - see GET /api/listings/search) - kept as a distinct type
// from Category so a caller can't accidentally send "ALL" as a filter
// value anywhere a real category is expected.
export type CategoryFilter = Category | "ALL";

const TABS: { value: CategoryFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "MOVIE", label: `${CATEGORY_LABEL.MOVIE}s` },
  { value: "EVENT", label: `${CATEGORY_LABEL.EVENT}s` },
  { value: "SPORT", label: `${CATEGORY_LABEL.SPORT}s` },
];

export function CategoryTabs({
  value,
  onChange,
}: {
  value: CategoryFilter;
  onChange: (value: CategoryFilter) => void;
}) {
  return (
    <div className="mt-4 flex w-full max-w-sm gap-2">
      {TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            value === tab.value
              ? "border-gold bg-gold/10 text-gold"
              : "border-line bg-surface text-muted hover:border-gold/50 hover:text-foreground"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
