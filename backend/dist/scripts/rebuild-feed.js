#!/usr/bin/env ts-node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const feed_recovery_service_1 = require("../src/modules/incidents/feed-recovery.service");
const guard_1 = require("../../database/seeds/lib/guard");
function parseArgs(argv) {
    let limit = 200;
    let force = false;
    for (const arg of argv) {
        if (arg === '--force') {
            force = true;
        }
        else if (arg.startsWith('--limit=')) {
            const value = Number.parseInt(arg.slice('--limit='.length), 10);
            if (Number.isInteger(value) && value > 0 && value <= 5000) {
                limit = value;
            }
            else {
                throw new Error(`rebuild-feed: --limit debe ser entero positivo ≤ 5000 (recibido: ${arg})`);
            }
        }
    }
    return { limit, force };
}
async function main() {
    const opts = parseArgs(process.argv.slice(2));
    (0, guard_1.enforce)({ scriptName: 'rebuild-feed.ts', argv: process.argv.slice(2) });
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule, {
        logger: ['error', 'warn', 'log'],
    });
    try {
        const feedRecovery = app.get(feed_recovery_service_1.FeedRecoveryService);
        const rebuilt = await feedRecovery.rebuildFeed(opts.limit);
        console.log(`rebuild-feed: limit=${opts.limit} force=${opts.force} rebuilt=${rebuilt}`);
        process.exitCode = 0;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`rebuild-feed: ${message}`);
        process.exitCode = 1;
    }
    finally {
        await app.close();
    }
}
main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`rebuild-feed: FATAL ${message}`);
    process.exit(1);
});
//# sourceMappingURL=rebuild-feed.js.map