export declare const MIGRATIONS_DIR: string;
export declare const ROLLBACK_DIR: string;
export interface MigrationFile {
    version: string;
    name: string;
    fileName: string;
    path: string;
}
export declare function listMigrations(dir?: string): MigrationFile[];
export declare function rollbackPathFor(migration: MigrationFile, dir?: string): string | null;
export declare function checksumOf(migration: MigrationFile): string;
export declare function readSql(migration: MigrationFile): string;
