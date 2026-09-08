"use client";

import type { ButtonHTMLAttributes } from "react";

interface AdminButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  variant?: "primary" | "danger" | "plain";
}

// Deliberately not components/ui/Button - that one is styled for the
// customer app's ticket-stub/gold theme. This is the internal tool's own
// plain, square-cornered button (blue "info" accent instead of gold) so
// /admin reads as a different, more utilitarian surface at a glance.
export function AdminButton({
  isLoading = false,
  disabled,
  children,
  variant = "primary",
  className = "",
  ...props
}: AdminButtonProps) {
  const variantClass =
    variant === "primary"
      ? "bg-info text-[#0f172a] hover:bg-info/85"
      : variant === "danger"
        ? "bg-error text-[#2a0e0b] hover:bg-error/85"
        : "border border-line bg-surface text-foreground hover:bg-surface-raised";

  return (
    <button
      disabled={disabled || isLoading}
      className={`relative flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${variantClass} ${className}`}
      {...props}
    >
      {isLoading && (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
