export interface GeocodePreview {
    found: boolean;
    lat: number | null;
    lng: number | null;
    displayName: string | null;
    cleanedName: string;
}
