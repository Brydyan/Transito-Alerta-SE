import { LoginDto } from './dto/login.dto';
export type Credential = {
    kind: 'device';
    deviceUuid: string;
} | {
    kind: 'password';
    email: string;
    password: string;
    deviceUuid: string | null;
};
export declare function resolveCredential(dto: LoginDto): Credential;
