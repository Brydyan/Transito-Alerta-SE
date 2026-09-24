import { ConsoleLogger } from '@nestjs/common';
export declare class RequestIdLogger extends ConsoleLogger {
    log(message: unknown, ...rest: unknown[]): void;
    warn(message: unknown, ...rest: unknown[]): void;
    error(message: unknown, ...rest: unknown[]): void;
    debug(message: unknown, ...rest: unknown[]): void;
    verbose(message: unknown, ...rest: unknown[]): void;
    private tag;
}
