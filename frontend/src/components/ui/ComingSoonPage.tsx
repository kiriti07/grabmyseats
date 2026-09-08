import Link from "next/link";

// Shared shell for /terms, /privacy, and /help - none of these have real
// content yet. The copy is deliberately explicit that this is a
// placeholder, not just an empty page, so nobody mistakes "Coming soon"
// for finished legal/support content.
export function ComingSoonPage({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-5 py-6">
      <header className="flex w-full max-w-sm items-center">
        <Link href="/account" className="text-sm font-medium text-muted hover:text-foreground">
          ← Account
        </Link>
      </header>

      <div className="mt-10 w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center">
        <p className="font-display text-2xl tracking-wide text-gold">{title}</p>
        <p className="mt-4 font-display text-lg tracking-wide text-foreground">Coming soon</p>
        <p className="mt-2 text-sm text-muted">{message}</p>
      </div>
    </main>
  );
}
