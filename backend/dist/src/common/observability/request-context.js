"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runWithRequestId = runWithRequestId;
exports.getRequestId = getRequestId;
const node_async_hooks_1 = require("node:async_hooks");
const storage = new node_async_hooks_1.AsyncLocalStorage();
function runWithRequestId(requestId, callback) {
    return storage.run({ requestId }, callback);
}
function getRequestId() {
    return storage.getStore()?.requestId;
}
//# sourceMappingURL=request-context.js.map