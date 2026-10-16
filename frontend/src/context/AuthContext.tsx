"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { User } from "@grabmyseats/shared";
import { fetchMe } from "@/lib/api";
import { clearToken, getToken, setToken } from "@/lib/token";
import { stopPush } from "@/lib/push";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  // Refreshes the in-memory user without touching the session token - used
  // by /login/welcome once POST /api/auth/complete-profile returns the
  // now-named user, so the rest of the app immediately sees it without a
  // full re-fetch. login/logout/isAuthenticated/isLoading are unchanged.
  updateUser: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    fetchMe(token)
      .then(({ user }) => setUser(user))
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback((token: string, user: User) => {
    setToken(token);
    setUser(user);
  }, []);

  const updateUser = useCallback((user: User) => {
    setUser(user);
  }, []);

  // Removes this device's push token first (it needs the session) - at most
  // 1.5s, so signing out never hangs on the network.
  const logout = useCallback(() => {
    const done = () => {
      clearToken();
      setUser(null);
      router.push("/login");
    };
    Promise.race([stopPush(), new Promise((resolve) => setTimeout(resolve, 1500))])
      .catch(() => {})
      .finally(done);
  }, [router]);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: user !== null, isLoading, login, updateUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
