"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminAuthProvider, useAdminAuth } from "@/context/AdminAuthContext";
import { AdminButton } from "@/components/admin/AdminButton";

const LOGIN_PATH = "/admin/login";

// Entirely separate from the customer app's root layout/AuthContext -
// AdminAuthProvider is mounted here, scoped to /admin/*, not at the root.
// /admin/login itself is excluded from the session gate below (that's
// where an unauthenticated visitor lands) - middleware.ts does the same
// exclusion at the edge, before any admin HTML is even served; this is
// the client-side counterpart, needed for the isLoading window while the
// session check round-trips (see AdminAuthContext) and for the role-aware
// chrome around every other page.
function AdminGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { admin, isAuthenticated, isLoading, logout } = useAdminAuth();

  const isLoginPage = pathname === LOGIN_PATH;

  useEffect(() => {
    if (!isLoginPage && !isLoading && !isAuthenticated) {
      router.replace(LOGIN_PATH);
    }
  }, [isLoginPage, isLoading, isAuthenticated, router]);

  if (isLoginPage) return <>{children}</>;

  if (isLoading || !isAuthenticated) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background font-sans text-sm text-muted">
        Loading...
      </main>
    );
  }

  return (
    <div className="min-h-dvh bg-background font-sans">
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <span className="text-sm font-semibold text-foreground">GrabMySeats Admin</span>
          <span className="ml-3 text-xs text-muted">
            {admin!.username} · {admin!.role}
          </span>
        </div>
        <AdminButton variant="plain" onClick={logout}>
          Log out
        </AdminButton>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminGate>{children}</AdminGate>
    </AdminAuthProvider>
  );
}
