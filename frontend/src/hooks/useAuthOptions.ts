"use client";

import { useEffect, useState } from "react";
import type { AuthOptions } from "@grabmyseats/shared";
import { fetchAuthOptions } from "@/lib/api";

// Conservative until loaded (and if the fetch fails): no phone option, no
// phone requirement - the backend enforces the real rules either way.
const DEFAULT_OPTIONS: AuthOptions = {
  phoneOtpAvailable: false,
  requirePhoneVerification: false,
  smsCountryCodes: ["91"],
};

// Module-level so every screen in a session shares one fetch.
let cached: Promise<AuthOptions> | null = null;

// GET /api/auth/options - whether phone codes can be offered, and whether
// a verified phone is currently required to list/reserve/view contacts.
export function useAuthOptions(): AuthOptions {
  const [options, setOptions] = useState<AuthOptions>(DEFAULT_OPTIONS);

  useEffect(() => {
    cached ??= fetchAuthOptions().catch(() => {
      cached = null;
      return DEFAULT_OPTIONS;
    });
    let active = true;
    cached.then((o) => active && setOptions(o));
    return () => {
      active = false;
    };
  }, []);

  return options;
}
