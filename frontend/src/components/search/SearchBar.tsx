"use client";

import { useEffect, useState } from "react";
import type { Coordinates } from "@/lib/geolocation";
import { useSearchSuggestions } from "@/hooks/useSearchSuggestions";

// Shared free-text search input + autocomplete dropdown, used on both the
// home screen (submit navigates to /buy) and the /buy page itself (submit
// runs the search immediately, bypassing that page's own debounce). The
// caller owns `value` - this component only renders it, reports keystrokes,
// and reports submissions (Enter, or picking a suggestion).
export function SearchBar({
  value,
  onChange,
  onSubmit,
  coords,
  placeholder,
  autoFocus,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  coords: Coordinates | null;
  placeholder: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const suggestions = useSearchSuggestions(value, coords);
  const [isOpen, setIsOpen] = useState(false);

  // New suggestions arriving (or the field being cleared down to nothing)
  // should reopen/close the dropdown even without another focus event.
  useEffect(() => {
    setIsOpen(suggestions.length > 0);
  }, [suggestions]);

  function selectSuggestion(text: string) {
    onChange(text);
    onSubmit(text);
    setIsOpen(false);
  }

  return (
    <div className={`relative ${className}`}>
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsOpen(suggestions.length > 0)}
        onBlur={() => setIsOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setIsOpen(false);
            onSubmit(value);
          } else if (e.key === "Escape") {
            setIsOpen(false);
          }
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-foreground placeholder:text-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
      />
      {isOpen && (
        <ul className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-line bg-surface-raised text-left shadow-lg">
          {suggestions.map((suggestion) => (
            <li key={`${suggestion.type}-${suggestion.value}`}>
              <button
                type="button"
                // onMouseDown (not onClick) fires before the input's onBlur,
                // so the selection registers instead of the dropdown
                // closing out from under the click.
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectSuggestion(suggestion.value);
                }}
                className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm text-foreground hover:bg-surface"
              >
                <span className="truncate">{suggestion.value}</span>
                <span className="flex-shrink-0 text-xs text-muted">
                  {suggestion.type === "title" ? "Title" : "Venue"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
