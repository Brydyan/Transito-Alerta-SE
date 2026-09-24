"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maskIp = maskIp;
exports.describeDevice = describeDevice;
exports.formatAttemptTime = formatAttemptTime;
function maskIp(raw) {
    if (!raw) {
        return 'desconocida';
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(raw)) {
        const octets = raw.split('.');
        return `${octets[0]}.${octets[1]}.x.x`;
    }
    if (raw.includes(':')) {
        const groups = raw.split(':');
        if (groups.length >= 4) {
            return `${groups[0]}:${groups[1]}:x:x`;
        }
    }
    return raw;
}
function describeDevice(userAgent) {
    if (!userAgent) {
        return 'desconocido';
    }
    const ua = userAgent.toLowerCase();
    let os = 'desconocido';
    if (ua.includes('windows nt'))
        os = 'Windows';
    else if (ua.includes('mac os x') || ua.includes('macintosh'))
        os = 'macOS';
    else if (ua.includes('android'))
        os = 'Android';
    else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios'))
        os = 'iOS';
    else if (ua.includes('linux'))
        os = 'Linux';
    let browser = 'desconocido';
    if (ua.includes('firefox/') || ua.includes('firefox '))
        browser = 'Firefox';
    else if (ua.includes('edg/') || ua.includes('edge/'))
        browser = 'Edge';
    else if (ua.includes('opr/') || ua.includes('opera'))
        browser = 'Opera';
    else if (ua.includes('chrome/') || ua.includes('chromium'))
        browser = 'Chrome';
    else if (ua.includes('safari/') && !ua.includes('chrome'))
        browser = 'Safari';
    return `${browser} en ${os}`;
}
function formatAttemptTime(date) {
    const ecuadorOffsetMinutes = 5 * 60;
    const ecuador = new Date(date.getTime() - ecuadorOffsetMinutes * 60 * 1000);
    const day = ecuador.getUTCDate();
    const month = ecuador.getUTCMonth() + 1;
    const year = ecuador.getUTCFullYear();
    const hour = ecuador.getUTCHours();
    const min = ecuador.getUTCMinutes();
    const months = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
    ];
    const mm = String(min).padStart(2, '0');
    return `${day} de ${months[month - 1]} de ${year}, ${hour}:${mm} (GMT-5)`;
}
//# sourceMappingURL=mail-template-helpers.js.map