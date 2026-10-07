import { cityIdForName, isWithinCityBounds } from "@grabmyseats/shared";
import { prisma } from "../prisma";
import { haversineDistanceMeters } from "./haversine";
import { normalizeVenueText, parseTheaterName } from "./venueQueries";

// Pins within this distance of each other (or of the venue) "agree".
export const AGREEMENT_RADIUS_METERS = 150;
// Different sellers who must agree on a new spot before an existing venue
// moves - one seller can never move a venue on their own.
export const SELLERS_REQUIRED_TO_MOVE = 3;

export type VenueLearningOutcome =
  | "skipped_approximate"
  | "skipped_unknown_city"
  | "skipped_no_name"
  | "rejected_out_of_bounds"
  | "created"
  | "confirmed"
  | "vote_recorded"
  | "moved";

interface Pin {
  lat: number;
  lng: number;
}

function distance(a: Pin, b: Pin): number {
  return haversineDistanceMeters(a.lat, a.lng, b.lat, b.lng);
}

function centroid(pins: Pin[]): Pin {
  return {
    lat: pins.reduce((sum, p) => sum + p.lat, 0) / pins.length,
    lng: pins.reduce((sum, p) => sum + p.lng, 0) / pins.length,
  };
}

// The largest group of pins (one per seller) that all sit within
// AGREEMENT_RADIUS_METERS of their own centroid, or null if none reaches
// SELLERS_REQUIRED_TO_MOVE.
function agreeingGroup(pins: Pin[]): Pin[] | null {
  let best: Pin[] | null = null;
  for (const seed of pins) {
    const near = pins.filter((p) => distance(p, seed) <= AGREEMENT_RADIUS_METERS);
    const center = centroid(near);
    const group = near.filter((p) => distance(p, center) <= AGREEMENT_RADIUS_METERS);
    if (group.length >= SELLERS_REQUIRED_TO_MOVE && (!best || group.length > best.length)) {
      best = group;
    }
  }
  return best;
}

// Records a pin a seller confirmed on the sell form - called after their
// listing was created (POST /api/listings), so only real, gated listings
// ever teach the Venue table.
// - An approximate pin the seller didn't move (a locality centroid) is
//   never learned.
// - A pin outside the selected city's bounding area is refused.
// - A new name+locality creates the venue at this pin.
// - For an existing venue, the seller's vote is recorded (latest pin per
//   seller); the venue only moves when SELLERS_REQUIRED_TO_MOVE different
//   sellers agree on a spot more than AGREEMENT_RADIUS_METERS from where it
//   is now, and then to their centroid.
export async function learnVenuePin(input: {
  userId: string;
  theaterName: string;
  cityName: string | null;
  lat: number;
  lng: number;
  approximate: boolean;
}): Promise<VenueLearningOutcome> {
  if (input.approximate) return "skipped_approximate";
  const cityId = cityIdForName(input.cityName);
  if (!cityId) return "skipped_unknown_city";
  if (!isWithinCityBounds(cityId, input.lat, input.lng)) return "rejected_out_of_bounds";

  const parsed = parseTheaterName(input.theaterName);
  const normalizedName = normalizeVenueText(parsed.name);
  if (!normalizedName) return "skipped_no_name";
  const locality = normalizeVenueText(parsed.locality ?? "");
  const pin = { lat: input.lat, lng: input.lng };

  return prisma.$transaction(async (tx) => {
    const key = { cityId, normalizedName, locality };
    const existing = await tx.venue.findUnique({
      where: { cityId_normalizedName_locality: key },
    });

    if (!existing) {
      await tx.venue.create({
        data: {
          ...key,
          displayName: [parsed.name, parsed.locality].filter(Boolean).join(", "),
          ...pin,
          source: "SELLER_CONFIRMED",
          pinVotes: { create: { userId: input.userId, ...pin } },
        },
      });
      return "created";
    }

    await tx.venuePinVote.upsert({
      where: { venueId_userId: { venueId: existing.id, userId: input.userId } },
      create: { venueId: existing.id, userId: input.userId, ...pin },
      update: pin,
    });
    if (distance(pin, existing) <= AGREEMENT_RADIUS_METERS) return "confirmed";

    const votes = await tx.venuePinVote.findMany({
      where: { venueId: existing.id },
      select: { lat: true, lng: true },
    });
    const disagreeing = votes.filter((v) => distance(v, existing) > AGREEMENT_RADIUS_METERS);
    const group = agreeingGroup(disagreeing);
    if (!group) return "vote_recorded";

    await tx.venue.update({ where: { id: existing.id }, data: centroid(group) });
    return "moved";
  });
}
