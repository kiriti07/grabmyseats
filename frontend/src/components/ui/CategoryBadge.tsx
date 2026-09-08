import type { Category } from "@grabmyseats/shared";
import { CATEGORY_LABEL } from "@/lib/category";

export function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className="whitespace-nowrap rounded-full border border-line bg-surface-raised px-2.5 py-0.5 text-xs font-medium text-muted">
      {CATEGORY_LABEL[category]}
    </span>
  );
}
