"use client";

import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
}

export function Button({
  isLoading = false,
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || isLoading}
      className={`relative flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-3.5 font-sans text-base font-semibold text-[#1a1408] transition-colors hover:bg-gold-dim disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    >
      {isLoading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-[#1a1408]/30 border-t-[#1a1408]"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
