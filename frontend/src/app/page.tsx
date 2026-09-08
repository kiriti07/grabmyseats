"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useSearchLocation } from "@/hooks/useSearchLocation";
import { OptionCard } from "@/components/home/OptionCard";
import { SearchBar } from "@/components/search/SearchBar";

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const { coords } = useSearchLocation();
  const [query, setQuery] = useState("");

  // A shortcut that skips the extra tap into /buy: land there with the
  // search already filled in and results already loading, rather than
  // landing on an empty search box.
  function handleSubmit(text: string) {
    const trimmed = text.trim();
    router.push(trimmed ? `/buy?movieName=${encodeURIComponent(trimmed)}` : "/buy");
  }

  return (
    <main className="flex min-h-dvh flex-col bg-background px-5 py-6">
      <header className="flex items-center justify-between">
        <span className="font-display text-3xl tracking-wide text-gold">
          GrabMySeats
        </span>
        {/* The only entry point into /account (and from there, profile
            editing, my listings, share, and the legal/help pages) - Log out
            itself lives on /account now instead of floating bare here, so
            this is the one thing to click regardless of what you're after. */}
        {!isLoading &&
          (isAuthenticated ? (
            <Link
              href="/account"
              className="text-sm font-medium text-muted hover:text-foreground"
            >
              Account
            </Link>
          ) : (
            <Link href="/login" className="text-sm font-medium text-gold hover:text-gold-dim">
              Sign in
            </Link>
          ))}
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10">
        <h1 className="text-center font-display text-3xl tracking-wide text-foreground">
          What are you here for?
        </h1>
        <SearchBar
          value={query}
          onChange={setQuery}
          onSubmit={handleSubmit}
          coords={coords}
          placeholder="Search movies, events, or theaters"
          className="w-full max-w-sm sm:max-w-2xl"
        />
        <div className="flex w-full max-w-sm flex-col gap-4 sm:max-w-2xl sm:flex-row">
          <OptionCard
            href="/buy"
            title="Buy Tickets"
            description="Find sold-out show tickets near you"
          />
          <OptionCard
            href="/sell"
            title="Sell Tickets"
            description="Can't make it? Recover your money"
          />
        </div>
      </div>
    </main>
  );
}
