"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { INPUT_CLASS } from "@/lib/styles";
import { ApiError, geocodeVenue } from "@/lib/api";

// Manual fallback for when automatic geocoding fails entirely: no Google
// Places key exists anywhere in this repo (see backend/src/lib/geocode.ts),
// so this uses Leaflet + OpenStreetMap tiles instead - also free, no API
// key. The seller can retry a text search here (still via our own
// Nominatim-backed /api/listings/geocode) or just drag the pin themselves.
export function VenuePicker({
  initialQuery,
  city,
  cityCenter,
  onConfirm,
}: {
  initialQuery: string;
  city: string;
  cityCenter: { lat: number; lng: number };
  onConfirm: (coords: { lat: number; lng: number }, label: string) => void;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [position, setPosition] = useState(cityCenter);
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !mapContainerRef.current) return;

      // Leaflet's default marker icon references image files via relative
      // paths that break under Next's bundler - point them at the same
      // CDN Leaflet itself is published from instead.
      delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapContainerRef.current).setView([position.lat, position.lng], 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([position.lat, position.lng], { draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLatLng();
        setPosition({ lat, lng });
        setLabel(null);
      });

      mapRef.current = map;
      markerRef.current = marker;
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function moveMarkerTo(next: { lat: number; lng: number }) {
    setPosition(next);
    mapRef.current?.setView([next.lat, next.lng], 16);
    markerRef.current?.setLatLng([next.lat, next.lng]);
  }

  async function handleSearch() {
    setSearchError(null);
    setIsSearching(true);
    try {
      const result = await geocodeVenue(searchQuery, city);
      if (result.found && result.lat !== null && result.lng !== null) {
        moveMarkerTo({ lat: result.lat, lng: result.lng });
        setLabel(result.displayName);
      } else {
        setSearchError("Still couldn't find that. Try adjusting the pin on the map below.");
      }
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : "Search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm font-medium text-foreground">
        We couldn&apos;t locate this venue automatically
      </p>
      <p className="mt-1 text-xs text-muted">
        Search again, or drag the pin to the exact spot.
      </p>

      <div className="mt-3 flex gap-2">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for the venue"
          className={INPUT_CLASS}
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={isSearching}
          className="shrink-0 rounded-lg bg-gold px-4 py-3 text-sm font-semibold text-[#1a1408] transition-colors hover:bg-gold-dim disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSearching ? "..." : "Search"}
        </button>
      </div>
      <ErrorText>{searchError}</ErrorText>

      <div
        ref={mapContainerRef}
        className="mt-3 h-56 w-full overflow-hidden rounded-lg border border-line"
      />

      <p className="mt-2 text-xs text-muted">
        {label ? `Selected: ${label}` : "Custom pinned location - drag to adjust"}
      </p>

      <div className="mt-3">
        <Button type="button" onClick={() => onConfirm(position, label ?? "Custom pinned location")}>
          Use this location
        </Button>
      </div>
    </div>
  );
}
