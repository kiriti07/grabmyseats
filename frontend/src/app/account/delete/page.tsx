"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AccountDeleteCodeResult } from "@grabmyseats/shared";
import { useAuth } from "@/context/AuthContext";
import { ApiError, deleteMyAccount, sendDeleteAccountCode } from "@/lib/api";
import { clearToken } from "@/lib/token";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { INPUT_CLASS } from "@/lib/styles";
import { DELETION_DELETED, DELETION_KEPT, isDeleteConfirmation } from "@/lib/accountDeletionCopy";

// "Delete my account" (Google Play's in-app deletion requirement) - see
// backend lib/accountDeletion.ts for what actually happens. Two steps:
// type DELETE, then - when the account has a verified email (or phone,
// while SMS works) - the code sent there. The server decides whether a code
// is needed; channel null means typing DELETE is the whole confirmation.
type Step =
  | { kind: "confirm" }
  | { kind: "code"; sent: AccountDeleteCodeResult }
  | { kind: "done" };

export default function DeleteAccountPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "confirm" });
  const [typed, setTyped] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && step.kind !== "done") router.replace("/login");
  }, [isLoading, isAuthenticated, router, step.kind]);

  async function handleContinue() {
    setError(null);
    setIsBusy(true);
    try {
      setStep({ kind: "code", sent: await sendDeleteAccountCode() });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDelete(needsCode: boolean) {
    setError(null);
    setIsBusy(true);
    try {
      await deleteMyAccount(needsCode ? code.trim() : null);
      // The session is over on the server too; drop ours without the
      // normal logout's redirect to /login.
      clearToken();
      setStep({ kind: "done" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsBusy(false);
    }
  }

  if (step.kind === "done") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-5 text-center">
        <h1 className="font-display text-3xl tracking-wide text-foreground">Your account has been deleted</h1>
        <p className="mt-3 max-w-sm text-sm text-muted">
          Your personal details have been removed from GrabMySeats. Thank you for using it.
        </p>
        {/* A full page load, so nothing of the old session lingers. */}
        <a href="/" className="mt-6 text-sm font-medium text-gold hover:underline">
          Back to home
        </a>
      </main>
    );
  }

  if (isLoading || !isAuthenticated) {
    return <main className="flex min-h-dvh items-center justify-center bg-background text-muted">Loading...</main>;
  }

  const needsCode = step.kind === "code" && step.sent.channel !== null;

  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-5 py-6">
      <header className="flex w-full max-w-sm items-center">
        <Link href="/account" className="text-sm font-medium text-muted hover:text-foreground">
          ← Account
        </Link>
      </header>

      <div className="mt-8 w-full max-w-sm">
        <h1 className="font-display text-3xl tracking-wide text-foreground">Delete my account</h1>
        <p className="mt-2 text-sm text-error">This is permanent and can&apos;t be undone.</p>

        <div className="mt-5 rounded-xl border border-line bg-surface p-4 text-sm">
          <p className="font-medium text-foreground">What gets deleted</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            {DELETION_DELETED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-4 font-medium text-foreground">What we keep</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            {DELETION_KEPT.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        {step.kind === "confirm" && (
          <div className="mt-5">
            <label htmlFor="confirm-delete" className="text-sm font-medium text-foreground">
              Type DELETE to confirm
            </label>
            <input
              id="confirm-delete"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className={`mt-1.5 ${INPUT_CLASS}`}
            />
            <ErrorText>{error}</ErrorText>
            <Button
              type="button"
              className="mt-3 !bg-error !text-white hover:!bg-error/85"
              disabled={!isDeleteConfirmation(typed)}
              isLoading={isBusy}
              onClick={handleContinue}
            >
              Continue
            </Button>
          </div>
        )}

        {step.kind === "code" && (
          <div className="mt-5">
            {needsCode ? (
              <>
                <label htmlFor="delete-code" className="text-sm font-medium text-foreground">
                  Enter the 6-digit code we sent to {step.sent.destination}
                </label>
                <input
                  id="delete-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className={`mt-1.5 ${INPUT_CLASS}`}
                />
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={isBusy}
                  className="mt-2 text-xs font-medium text-muted hover:text-foreground"
                >
                  Send a new code
                </button>
              </>
            ) : (
              <p className="text-sm text-muted">
                Your account has no verified email we can send a code to, so typing DELETE is your
                confirmation.
              </p>
            )}
            <ErrorText>{error}</ErrorText>
            <Button
              type="button"
              className="mt-3 !bg-error !text-white hover:!bg-error/85"
              disabled={needsCode && code.length !== 6}
              isLoading={isBusy}
              onClick={() => handleDelete(needsCode)}
            >
              Permanently delete my account
            </Button>
          </div>
        )}

        <p className="mt-6 text-xs text-muted">
          Can&apos;t sign in? See{" "}
          <Link href="/delete-account" className="underline hover:text-foreground">
            how to request deletion
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
