"use client";

import { useState } from "react";
import type { AdminUserSummary } from "@grabmyseats/shared";
import { AdminButton } from "@/components/admin/AdminButton";
import { ErrorText } from "@/components/ui/ErrorText";
import { ApiError, lookupUserByPhone, suspendUser, unsuspendUser } from "@/lib/adminApi";

// SUPPORT and ADMIN both use this - staff only ever have a phone number to
// go on for a user they're acting on (same reason TransactionContact never
// carries a user id), so lookup-by-phone is the entry point.
export function UserSuspendPanel() {
  const [phone, setPhone] = useState("");
  const [user, setUser] = useState<AdminUserSummary | null | undefined>(undefined);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isActing, setIsActing] = useState(false);

  async function handleLookup() {
    const trimmed = phone.trim();
    if (!trimmed) return;
    setError(null);
    setIsLookingUp(true);
    try {
      const { user } = await lookupUserByPhone(trimmed);
      setUser(user);
      setReason("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lookup failed.");
      setUser(undefined);
    } finally {
      setIsLookingUp(false);
    }
  }

  async function handleSuspend() {
    if (!user || !reason.trim()) return;
    setError(null);
    setIsActing(true);
    try {
      const { user: updated } = await suspendUser(user.id, reason.trim());
      setUser(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't suspend this user.");
    } finally {
      setIsActing(false);
    }
  }

  async function handleUnsuspend() {
    if (!user) return;
    setError(null);
    setIsActing(true);
    try {
      const { user: updated } = await unsuspendUser(user.id);
      setUser(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't unsuspend this user.");
    } finally {
      setIsActing(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex gap-2">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLookup()}
          placeholder="+919876543210"
          className="w-full max-w-xs rounded-md border border-line bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-info focus:outline-none focus:ring-1 focus:ring-info"
        />
        <AdminButton variant="plain" onClick={handleLookup} isLoading={isLookingUp}>
          Look up
        </AdminButton>
      </div>

      <ErrorText>{error}</ErrorText>

      {user === null && <p className="mt-3 text-sm text-muted">No user with that phone number.</p>}

      {user && (
        <div className="mt-4 rounded-md border border-line bg-background p-3">
          <p className="text-sm font-medium text-foreground">
            {user.fullName ?? user.name ?? "(no name on file)"}
          </p>
          <p className="text-sm text-muted">{user.phone}</p>

          {user.suspendedAt ? (
            <div className="mt-3">
              <p className="text-sm text-error">Suspended: {user.suspensionReason}</p>
              <AdminButton
                variant="plain"
                className="mt-2"
                onClick={handleUnsuspend}
                isLoading={isActing}
              >
                Unsuspend
              </AdminButton>
            </div>
          ) : (
            <div className="mt-3">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for suspension"
                rows={2}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-info focus:outline-none focus:ring-1 focus:ring-info"
              />
              <AdminButton
                variant="danger"
                className="mt-2"
                onClick={handleSuspend}
                isLoading={isActing}
                disabled={!reason.trim()}
              >
                Suspend
              </AdminButton>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
