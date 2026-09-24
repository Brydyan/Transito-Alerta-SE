export interface StorageConfig {
    provider: 'supabase' | 'noop';
    supabaseUrl: string | undefined;
    supabaseServiceKey: string | undefined;
    supabaseBucket: string;
}
declare const _default: (() => StorageConfig) & import("@nestjs/config").ConfigFactoryKeyHost<StorageConfig>;
export default _default;
