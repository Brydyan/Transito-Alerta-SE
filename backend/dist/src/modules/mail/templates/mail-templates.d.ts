export type TemplateName = 'incident.created' | 'incident.assigned' | 'incident.status_changed' | 'comment.created' | 'invitation' | 'password-reset' | 'email_verification' | 'existing_account_attempt';
export declare function renderMailTemplate(name: TemplateName, data: Record<string, unknown>): string;
