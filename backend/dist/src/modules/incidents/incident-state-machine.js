"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_STATUSES = exports.TRANSITIONS = void 0;
exports.canTransition = canTransition;
exports.TRANSITIONS = {
    pending: ['in_progress', 'closed'],
    in_progress: ['resolved', 'closed'],
    resolved: [],
    closed: [],
};
exports.ALLOWED_STATUSES = Object.freeze(Object.keys(exports.TRANSITIONS));
function canTransition(from, to) {
    return exports.TRANSITIONS[from].includes(to);
}
//# sourceMappingURL=incident-state-machine.js.map