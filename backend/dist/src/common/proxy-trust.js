"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRUSTED_PROXY_NETWORKS = void 0;
exports.ipToLong = ipToLong;
exports.isTrustedProxyAddress = isTrustedProxyAddress;
exports.TRUSTED_PROXY_NETWORKS = [
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '127.0.0.1/32',
];
function ipToLong(ip) {
    const parts = ip.split('.');
    if (parts.length !== 4)
        return 0;
    return (((Number(parts[0]) << 24) |
        (Number(parts[1]) << 16) |
        (Number(parts[2]) << 8) |
        Number(parts[3])) >>>
        0);
}
function isTrustedProxyAddress(addr) {
    if (!addr)
        return false;
    const ipv4 = addr.startsWith('::ffff:') ? addr.slice(7) : addr;
    for (const cidr of exports.TRUSTED_PROXY_NETWORKS) {
        const [net, bits = '32'] = cidr.split('/');
        const network = ipToLong(net);
        const mask = bits === '32' ? -1 : ~((1 << (32 - Number(bits))) - 1);
        const addrLong = ipToLong(ipv4);
        if (((addrLong & mask) >>> 0) === ((network & mask) >>> 0)) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=proxy-trust.js.map