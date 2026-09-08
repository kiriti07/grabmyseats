"use client";

import { useRequireAuth } from "@/hooks/useRequireAuth";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useRequireAuth();

  if (isLoading || !isAuthenticated) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background text-muted">
        Loading...
      </main>
    );
  }

  return <>{children}</>;
}
