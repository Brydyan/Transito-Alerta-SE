export interface MailConfig {
    smtpHost: string | undefined;
    smtpPort: number;
    smtpUser: string | undefined;
    smtpPassword: string | undefined;
    smtpFrom: string;
    sweepIntervalMs: number;
    claimIdleMs: number;
    maxAttempts: number;
    appBaseUrl: string;
}
declare const _default: (() => MailConfig) & import("@nestjs/config").ConfigFactoryKeyHost<MailConfig>;
export default _default;
