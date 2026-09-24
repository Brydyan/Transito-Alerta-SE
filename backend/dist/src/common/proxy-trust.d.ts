export declare const TRUSTED_PROXY_NETWORKS: readonly ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.1/32"];
export declare function ipToLong(ip: string): number;
export declare function isTrustedProxyAddress(addr: string | undefined | null): boolean;
