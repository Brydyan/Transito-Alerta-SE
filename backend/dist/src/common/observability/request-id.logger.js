"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestIdLogger = void 0;
const common_1 = require("@nestjs/common");
const request_context_1 = require("./request-context");
class RequestIdLogger extends common_1.ConsoleLogger {
    log(message, ...rest) {
        super.log(this.tag(message), ...rest);
    }
    warn(message, ...rest) {
        super.warn(this.tag(message), ...rest);
    }
    error(message, ...rest) {
        super.error(this.tag(message), ...rest);
    }
    debug(message, ...rest) {
        super.debug(this.tag(message), ...rest);
    }
    verbose(message, ...rest) {
        super.verbose(this.tag(message), ...rest);
    }
    tag(message) {
        const requestId = (0, request_context_1.getRequestId)();
        if (!requestId || typeof message !== 'string') {
            return message;
        }
        return `[req=${requestId}] ${message}`;
    }
}
exports.RequestIdLogger = RequestIdLogger;
//# sourceMappingURL=request-id.logger.js.map