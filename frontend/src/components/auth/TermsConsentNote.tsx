import Link from "next/link";

// Under the button that creates an account - the sign-up form, and "No
// account yet" after a sign-in. The backend records termsAcceptedAt when an
// account is created from either (routes/auth.ts). Shown to everyone on
// those screens, but an existing account just signs in and is never asked
// to accept again.
export function TermsConsentNote() {
  return (
    <p className="mt-3 text-center text-xs text-muted">
      By creating an account you agree to the{" "}
      <Link href="/terms" className="underline hover:text-foreground">
        Terms &amp; Conditions
      </Link>{" "}
      and{" "}
      <Link href="/privacy" className="underline hover:text-foreground">
        Privacy Policy
      </Link>
      .
    </p>
  );
}
