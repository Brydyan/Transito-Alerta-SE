import { SubjectScope } from './subject-scope';
export interface ScopeSqlOptions {
    table: string;
    paramOffset: number;
}
export interface ScopeSqlResult {
    fragment: string;
    params: unknown[];
}
export declare function scopeToSql(scope: SubjectScope, opts: ScopeSqlOptions): ScopeSqlResult;
export declare function scopeCacheKey(scope: SubjectScope): string;
