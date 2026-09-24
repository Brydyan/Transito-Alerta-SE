import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
export declare class RedisIoAdapter extends IoAdapter {
    private readonly app;
    private pubClient?;
    private subClient?;
    constructor(app: INestApplicationContext);
    createIOServer(port: number, options?: ServerOptions): unknown;
    close(server: Parameters<IoAdapter['close']>[0]): Promise<void>;
}
