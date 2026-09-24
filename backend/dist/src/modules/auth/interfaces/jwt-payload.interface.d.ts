export interface JwtPayload {
    sub: string;
    typ: 'access' | 'refresh';
    jti: string;
    pv: number;
    sid?: string;
}
