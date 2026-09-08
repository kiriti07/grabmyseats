"use client";

import { useEffect, useState } from "react";
import type { AdminRole, AdminUser } from "@grabmyseats/shared";
import { AdminButton } from "@/components/admin/AdminButton";
import { ErrorText } from "@/components/ui/ErrorText";
import { ApiError, createStaff, listStaff, setStaffActive } from "@/lib/adminApi";

const ROLES: AdminRole[] = ["SUPPORT", "ADMIN"];

export function StaffManagement() {
  const [staff, setStaff] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [role, setRole] = useState<AdminRole>("SUPPORT");
  const [isCreating, setIsCreating] = useState(false);
  // Shown once, right after creation - see the comment on
  // CreateStaffResult in shared/src/admin.ts for why this never
  // reappears afterward.
  const [justCreated, setJustCreated] = useState<{ username: string; password: string } | null>(
    null,
  );

  const [togglingId, setTogglingId] = useState<string | null>(null);

  function load() {
    setIsLoading(true);
    listStaff()
      .then(({ staff }) => setStaff(staff))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load staff."))
      .finally(() => setIsLoading(false));
  }

  useEffect(load, []);

  async function handleCreate() {
    if (!username.trim()) return;
    setError(null);
    setIsCreating(true);
    try {
      const { staff: created, temporaryPassword } = await createStaff({
        username: username.trim(),
        role,
      });
      setStaff((prev) => [...prev, created]);
      setJustCreated({ username: created.username, password: temporaryPassword });
      setUsername("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create this account.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    setTogglingId(id);
    setError(null);
    try {
      const { staff: updated } = await setStaffActive(id, isActive);
      setStaff((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update this account.");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="rounded-md border border-line bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-info focus:outline-none focus:ring-1 focus:ring-info"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
              className="rounded-md border border-line bg-background px-3 py-2 text-sm text-foreground focus:border-info focus:outline-none focus:ring-1 focus:ring-info"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <AdminButton onClick={handleCreate} isLoading={isCreating} disabled={!username.trim()}>
            Create account
          </AdminButton>
        </div>
        <ErrorText>{error}</ErrorText>

        {justCreated && (
          <div className="mt-3 rounded-md border border-info/40 bg-info/10 p-3 text-sm">
            <p className="text-foreground">
              Created <strong>{justCreated.username}</strong>. Temporary password (shown once,
              hand it off securely):
            </p>
            <p className="mt-1 font-mono text-info">{justCreated.password}</p>
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-4 py-2 font-medium">Username</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2 text-foreground">{s.username}</td>
                  <td className="px-4 py-2 text-muted">{s.role}</td>
                  <td className="px-4 py-2">
                    <span className={s.isActive ? "text-success" : "text-error"}>
                      {s.isActive ? "Active" : "Revoked"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <AdminButton
                      variant="plain"
                      onClick={() => handleToggleActive(s.id, !s.isActive)}
                      isLoading={togglingId === s.id}
                    >
                      {s.isActive ? "Revoke" : "Reactivate"}
                    </AdminButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
