export interface DecodedStreamEvent {
    type: string;
    data: Record<string, unknown>;
}
export declare function decodeStreamEntry(fields: string[]): DecodedStreamEvent | null;
