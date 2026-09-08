import Link from "next/link";

// Shared by /login and /login/verify - neither had any way back to Home
// before this (verify has its own "edit" link back to /login to change the
// phone number, which is a different, narrower thing than abandoning
// sign-in entirely).
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-background px-5 py-6">
      <header className="flex w-full max-w-sm items-center">
        <Link href="/" className="text-sm font-medium text-muted hover:text-foreground">
          ← Home
        </Link>
      </header>

      <div className="flex w-full flex-1 flex-col items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <p className="font-display text-4xl tracking-wide text-gold">
              GrabMySeats
            </p>
            <h1 className="mt-6 font-display text-2xl tracking-wide text-foreground">
              {title}
            </h1>
            <p className="mt-2 text-sm text-muted">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
