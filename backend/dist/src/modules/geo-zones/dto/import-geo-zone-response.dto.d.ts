export interface ImportGeoZoneResponse {
    imported: number;
    skipped: number;
    errors: Array<{
        index: number;
        name: string;
        reason: string;
    }>;
    warnings: string[];
}
