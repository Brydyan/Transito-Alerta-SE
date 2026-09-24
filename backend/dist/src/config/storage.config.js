"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("@nestjs/config");
exports.default = (0, config_1.registerAs)('storage', () => ({
    provider: process.env.STORAGE_PROVIDER === 'supabase' ? 'supabase' : 'noop',
    supabaseUrl: process.env.STORAGE_SUPABASE_URL || undefined,
    supabaseServiceKey: process.env.STORAGE_SUPABASE_SERVICE_KEY || undefined,
    supabaseBucket: process.env.STORAGE_SUPABASE_BUCKET || 'uploads',
}));
//# sourceMappingURL=storage.config.js.map