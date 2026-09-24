"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeStreamEntry = decodeStreamEntry;
function decodeStreamEntry(fields) {
    const map = {};
    for (let i = 0; i < fields.length; i += 2) {
        map[fields[i]] = fields[i + 1];
    }
    if (!map.type || !map.data) {
        return null;
    }
    try {
        return { type: map.type, data: JSON.parse(map.data) };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=stream-event.util.js.map