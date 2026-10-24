"use client";

// The invite (referral) code input on /signup and on /login/verify's "No
// account yet" screen - see lib/referralCode.ts. Required while sign-up is
// invite-only (AuthOptions.requireReferral), optional otherwise.
export function InviteCodeField({
  value,
  onChange,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  required: boolean;
}) {
  return (
    <div className="mt-4">
      <label htmlFor="invite-code" className="mb-2 block text-sm font-medium text-foreground">
        Invite code{required ? "" : " (optional)"}
      </label>
      <input
        id="invite-code"
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        maxLength={20}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder="e.g. K7M2QXR"
        className="w-full rounded-lg border border-line bg-surface px-4 py-3.5 font-mono text-lg uppercase tracking-widest text-foreground placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
      />
      <p className="mt-1.5 text-xs text-muted">
        {required ? "GrabMySeats is invite-only for now. " : ""}
        Ask a friend on GrabMySeats for theirs - it&apos;s on their Account page.
      </p>
    </div>
  );
}
