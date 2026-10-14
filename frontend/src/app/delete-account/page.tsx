import type { Metadata } from "next";
import Link from "next/link";
import { DELETION_DELETED, DELETION_KEPT } from "@/lib/accountDeletionCopy";

// Public (no sign-in - src/middleware.ts only guards /account and /admin):
// the account-deletion URL given to Google Play. Explains the in-app path
// and, for anyone who can't sign in (including suspended accounts), how to
// ask by email - an ADMIN then deletes it via POST
// /api/admin/users/:id/delete. Procedural text only; the legal wording
// lives in the Privacy Policy.
export const metadata: Metadata = {
  title: "Delete your GrabMySeats account",
  description: "How to delete your GrabMySeats account and what happens to your data.",
};

const SUPPORT_EMAIL = "support@grabmyseats.com";
const MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Delete my GrabMySeats account")}`;

export default function DeleteAccountInfoPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-5 py-6">
      <header className="flex w-full max-w-2xl items-center">
        <Link href="/" className="text-sm font-medium text-muted hover:text-foreground">
          ← Home
        </Link>
      </header>

      <article className="mt-6 w-full max-w-2xl break-words text-sm leading-relaxed text-foreground">
        <h1 className="font-display text-3xl tracking-wide text-gold">Delete your account</h1>
        <p className="mt-1 text-muted">GrabMySeats, by Brilliant Eight</p>

        <h2 className="mt-8 font-display text-xl tracking-wide">In the app or on the website</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li>Sign in to GrabMySeats.</li>
          <li>
            Open <strong>Account</strong> and tap <strong>Delete my account</strong> at the bottom.
          </li>
          <li>Type DELETE to confirm.</li>
          <li>If we sent you a code, enter it.</li>
          <li>
            Tap <strong>Permanently delete my account</strong>. It happens straight away.
          </li>
        </ol>

        <h2 className="mt-8 font-display text-xl tracking-wide">If you can&apos;t sign in</h2>
        <p className="mt-3">
          Email{" "}
          <a href={MAILTO} className="font-medium text-gold underline">
            {SUPPORT_EMAIL}
          </a>{" "}
          with the subject &ldquo;Delete my GrabMySeats account&rdquo;. Send it from the email
          address on your account, or tell us the phone number on your account. We may ask you to
          confirm the account is yours before we delete it, and we&apos;ll reply when it&apos;s done.
        </p>

        <h2 className="mt-8 font-display text-xl tracking-wide">What gets deleted</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {DELETION_DELETED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <h2 className="mt-8 font-display text-xl tracking-wide">What we keep</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {DELETION_KEPT.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <p className="mt-8 text-muted">
          More about how we handle your data is in our{" "}
          <Link href="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>
      </article>
    </main>
  );
}
