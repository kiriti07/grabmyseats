import type { Category } from "./listing";
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
export interface CreateTicketAlertInput {
    titleQuery: string;
    cityId?: string;
    lat: number;
    lng: number;
    radiusKm?: number;
    category?: Category;
}
