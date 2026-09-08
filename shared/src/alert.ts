import type { Category } from "./listing";

// "Notify me" saved search - see POST /api/alerts. jobs/matchAlerts.ts (backend)
// scans recently-created listings against active, non-expired alerts and
// texts a match once.
export interface TicketAlert {
  id: string;
  titleQuery: string;
  cityId: string | null;
  lat: number;
  lng: number;
  radiusKm: number;
  category: Category;
  isActive: boolean;
  createdAt: string;
  expiresAt: string;
}

// POST /api/alerts request body. radiusKm/category default server-side
// (7km/MOVIE) when omitted, same defaults GET /api/listings/search uses -
// see backend/src/routes/listings.ts.
export interface CreateTicketAlertInput {
  titleQuery: string;
  cityId?: string;
  lat: number;
  lng: number;
  radiusKm?: number;
  category?: Category;
}
