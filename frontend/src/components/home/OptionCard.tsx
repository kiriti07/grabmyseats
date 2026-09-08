import Link from "next/link";

export function OptionCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-6 py-12 text-center transition-colors hover:border-gold active:bg-surface-raised"
    >
      <span className="font-display text-4xl tracking-wide text-gold transition-colors group-hover:text-gold-dim">
        {title}
      </span>
      <span className="max-w-[16rem] text-sm text-muted">{description}</span>
    </Link>
  );
}
