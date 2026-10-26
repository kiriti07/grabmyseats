import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Category, ListingSearchResult } from "@grabmyseats/shared";
import { ListingExtras } from "./ListingExtras";
import { ListingDetailsFields } from "./ListingDetailsFields";
import { ListingResults } from "@/components/search/ListingResults";

// Rendered to static HTML (no DOM needed): what buyers and sellers actually
// see for a listing's seat type and description, and the form fields.
describe("ListingExtras", () => {
  it("shows the seat type label and the description", () => {
    const html = renderToStaticMarkup(
      <ListingExtras seatType="RECLINER" description="Corner seats, next to the aisle" />,
    );
    expect(html).toContain("Seat type: <span");
    expect(html).toContain("Recliner");
    expect(html).toContain("Corner seats, next to the aisle");
  });

  it("renders nothing for an old listing with neither", () => {
    expect(renderToStaticMarkup(<ListingExtras seatType={null} description={null} />)).toBe("");
    // An older backend that doesn't send the fields at all.
    expect(renderToStaticMarkup(<ListingExtras />)).toBe("");
  });

  it("hides a seat type value that isn't in the list", () => {
    expect(renderToStaticMarkup(<ListingExtras seatType="BALCONY" description={null} />)).toBe("");
  });

  it("escapes HTML in the description - it is shown as text, never markup", () => {
    const xss = `<script>alert(1)</script><img src=x onerror="alert(2)">`;
    const html = renderToStaticMarkup(<ListingExtras seatType={null} description={xss} />);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=&quot;alert(2)&quot;&gt;");
  });

  it("clamps the description to two lines when compact", () => {
    const html = renderToStaticMarkup(<ListingExtras description="Aisle seats" compact />);
    expect(html).toContain("line-clamp-2");
  });
});

describe("ListingResults card", () => {
  const base: ListingSearchResult = {
    id: "l1",
    movieName: "Jawan",
    theaterName: "PVR Phoenix",
    showtime: "2026-11-01T19:30:00.000Z",
    availableSeats: 2,
    pricePerSeat: 300,
    distanceKm: 1.2,
    locationPrecision: "EXACT",
    cityName: "Bengaluru",
    seatType: "TOP_ROW",
    description: "Seats together <b>near</b> the aisle",
  };
  const render = (listing: ListingSearchResult) =>
    renderToStaticMarkup(
      <ListingResults
        listings={[listing]}
        isLoading={false}
        error={null}
        coords={null}
        activeCategory="ALL"
        cityName={null}
      />,
    );

  it("shows seat type and (escaped) description on the card", () => {
    const html = render(base);
    expect(html).toContain("Top row");
    expect(html).toContain("Seats together &lt;b&gt;near&lt;/b&gt; the aisle");
  });

  it("an old listing renders as before", () => {
    const html = render({ ...base, seatType: null, description: null });
    expect(html).not.toContain("Seat type");
    expect(html).toContain("Jawan");
  });
});

describe("ListingDetailsFields", () => {
  const render = (category: Category, description = "") =>
    renderToStaticMarkup(
      <ListingDetailsFields
        category={category}
        seatType=""
        onSeatTypeChange={() => {}}
        description={description}
        onDescriptionChange={() => {}}
      />,
    );

  it("offers the seat type dropdown for Movies, with skip first", () => {
    const html = render("MOVIE");
    expect(html).toContain("Seat type (optional)");
    const options = Array.from(html.matchAll(/<option[^>]*>([^<]*)<\/option>/g), (m) => m[1]);
    expect(options).toEqual(["Not sure / skip", "Recliner", "Top row", "Middle row", "Bottom row"]);
  });

  it("has no seat type dropdown for Events and Sports", () => {
    for (const category of ["EVENT", "SPORT"] as const) {
      const html = render(category);
      expect(html).not.toContain("Seat type");
      expect(html).toContain("Description (optional)");
    }
  });

  it("caps the description at 300 and shows the character counter", () => {
    const html = render("EVENT", "Aisle seats");
    expect(html).toContain('maxLength="300"');
    expect(html).toContain("11/300");
  });
});
