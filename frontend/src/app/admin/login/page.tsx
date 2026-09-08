"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AdminButton } from "@/components/admin/AdminButton";
import { ErrorText } from "@/components/ui/ErrorText";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { ApiError, adminLogin } from "@/lib/adminApi";

// Deliberately plain - no ticket-stub theming, no display font. This is an
// internal tool, not the customer-facing marketplace, and should read as
// one at a glance.
export default function AdminLoginPage() {
  const router = useRouter();
  const { login } = useAdminAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError("Username and password are required");
      return;
    }

    setIsLoading(true);
    try {
      const { admin, token } = await adminLogin(username.trim(), password);
      login(token, admin);
      router.push("/admin/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 font-sans">
      <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-8">
        <h1 className="text-lg font-semibold text-foreground">GrabMySeats Admin</h1>
        <p className="mt-1 text-sm text-muted">Internal staff sign-in</p>

        <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-foreground">
              Username
            </label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              className="w-full rounded-md border border-line bg-background px-3 py-2.5 text-foreground placeholder:text-muted focus:border-info focus:outline-none focus:ring-1 focus:ring-info"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-md border border-line bg-background px-3 py-2.5 text-foreground placeholder:text-muted focus:border-info focus:outline-none focus:ring-1 focus:ring-info"
            />
          </div>

          <ErrorText>{error}</ErrorText>

          <AdminButton type="submit" isLoading={isLoading} className="mt-2 w-full">
            {isLoading ? "Signing in..." : "Sign in"}
          </AdminButton>
        </form>
      </div>
    </main>
  );
}
