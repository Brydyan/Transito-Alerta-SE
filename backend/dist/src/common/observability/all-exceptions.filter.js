"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllExceptionsFilter = void 0;
const common_1 = require("@nestjs/common");
const request_context_1 = require("./request-context");
const MAX_URL = 200;
const MAX_CODE = 60;
let AllExceptionsFilter = class AllExceptionsFilter {
    constructor() {
        this.logger = new common_1.Logger('HttpException');
    }
    catch(exception, host) {
        const http = host.switchToHttp();
        const req = http.getRequest();
        const res = http.getResponse();
        const isHttp = exception instanceof common_1.HttpException;
        const status = isHttp ? exception.getStatus() : common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        const body = isHttp
            ? exception.getResponse()
            :
                { statusCode: common_1.HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
        const line = this.describe(req, status, exception);
        if (status >= common_1.HttpStatus.INTERNAL_SERVER_ERROR) {
            this.logger.error(line, exception instanceof Error ? exception.stack : String(exception));
        }
        else {
            this.logger.warn(line);
        }
        res.status(status).json(body);
    }
    describe(req, status, exception) {
        const method = req.method ?? '-';
        const url = truncate(req.originalUrl ?? req.url ?? '-', MAX_URL);
        const user = req.user?.userId ?? 'anon';
        const requestId = (0, request_context_1.getRequestId)() ?? 'sin-req-id';
        const code = this.domainCode(exception);
        return `${status} ${method} ${url} user=${user} req=${requestId}${code ? ` code=${code}` : ''}`;
    }
    domainCode(exception) {
        if (!(exception instanceof common_1.HttpException))
            return null;
        const payload = exception.getResponse();
        if (typeof payload !== 'object' || payload === null)
            return null;
        const code = payload.code;
        return typeof code === 'string' ? truncate(code, MAX_CODE) : null;
    }
};
exports.AllExceptionsFilter = AllExceptionsFilter;
exports.AllExceptionsFilter = AllExceptionsFilter = __decorate([
    (0, common_1.Catch)()
], AllExceptionsFilter);
function truncate(value, max) {
    return value.length > max ? `${value.slice(0, max)}…` : value;
}
//# sourceMappingURL=all-exceptions.filter.js.map