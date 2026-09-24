import { ConfigService } from '@nestjs/config';
export declare const DUMMY_HASH: string;
export declare class PasswordHasher {
    private readonly configService;
    constructor(configService: ConfigService);
    private get cost();
    hash(password: string): Promise<string>;
    verify(password: string, hash: string): Promise<boolean>;
    assertStrongEnough(password: string): void;
}
