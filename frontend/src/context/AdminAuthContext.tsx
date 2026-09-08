"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { AdminUser } from "@grabmyseats/shared";
import { fetchAdminMe, adminLogout as apiAdminLogout } from "@/lib/adminApi";
import { clearAdminToken, getAdminToken, setAdminToken } from "@/lib/adminToken";

// Deliberately separate from context/AuthContext.tsx (customer auth): its
// own token, its own cookie, its own "current user" shape (AdminUser, not
// User). Only ever mounted inside app/admin/layout.tsx, never at the root
// layout - customer pages have no reason to carry admin session state and
// vice versa.
interface AdminAuthContextValue {
  admin: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, admin: AdminUser) => void;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    fetchAdminMe()
      .then(({ admin }) => setAdmin(admin))
      .catch(() => {
        clearAdminToken();
        setAdmin(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback((token: string, admin: AdminUser) => {
    setAdminToken(token);
    setAdmin(admin);
  }, []);

  const logout = useCallback(() => {
    // Best-effort - the cookie is cleared client-side either way, so a
    // failed network call here shouldn't block signing out locally.
    apiAdminLogout().catch(() => {});
    clearAdminToken();
    setAdmin(null);
  }, []);

  return (
    <AdminAuthContext.Provider
      value={{ admin, isAuthenticated: admin !== null, isLoading, login, logout }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
