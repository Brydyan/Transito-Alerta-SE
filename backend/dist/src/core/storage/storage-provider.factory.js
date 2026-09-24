"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveStorageClient = resolveStorageClient;
const noop_storage_client_1 = require("./noop-storage.client");
const supabase_storage_client_1 = require("./supabase-storage.client");
function resolveStorageClient(conf) {
    return conf.provider === 'supabase' ? new supabase_storage_client_1.SupabaseStorageClient(conf) : new noop_storage_client_1.NoopStorageClient();
}
//# sourceMappingURL=storage-provider.factory.js.map