import { randomUUID } from "node:crypto";
import Redis from "ioredis";

// Runs before every test file (vitest.config.mts setupFiles). Test-only:
// the app never imports this, so no production code path changes.
//
// The patches below are installed once per worker process (the flags on
// globalThis), since a worker can run several test files and ioredis /
// fetch are shared by all of them. Only the per-file values are reset.
const state = globalThis as typeof globalThis & {
  __gmsTestThrottleKey?: string;
  __gmsTestPatched?: boolean;
};

// 1. Nominatim throttle. lib/geocode.ts reserves request slots on one Redis
// key shared by every backend process - right in production, but test files
// running in parallel then queue behind each other's slots (geocode.test
// sets a 3s interval on purpose), and a lookup that would wait past its
// maxWaitMs gives up, so a listing falls back to CITY. Each test file gets
// its own key instead, so files never wait on one another.
const THROTTLE_KEY = "geo:nominatim:next-slot";
state.__gmsTestThrottleKey = `${THROTTLE_KEY}:test:${randomUUID()}`;

// 2. Nominatim itself. Test files that create listings with a venue reach
// the geocoder without mocking fetch; they get "no match" ([]) here instead
// of a real request. Files that spy on fetch themselves (geocode,
// listingLocation, venueLookup) replace this and are unaffected. Set
// TEST_ALLOW_REAL_NOMINATIM=1 to let requests through to the real service.
const NOMINATIM_ORIGIN = "https://nominatim.openstreetmap.org/";

if (!state.__gmsTestPatched) {
  state.__gmsTestPatched = true;

  type Eval = (...args: unknown[]) => Promise<unknown>;
  const proto = Redis.prototype as unknown as { eval: Eval };
  const originalEval = proto.eval;
  proto.eval = function (this: Redis, ...args: unknown[]) {
    // eval(script, numKeys, key1, ...): the throttle script has one key.
    if (args[2] === THROTTLE_KEY) args[2] = state.__gmsTestThrottleKey;
    return originalEval.apply(this, args);
  };

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(NOMINATIM_ORIGIN) && process.env.TEST_ALLOW_REAL_NOMINATIM !== "1") {
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return realFetch(input, init);
  }) as typeof fetch;
}
