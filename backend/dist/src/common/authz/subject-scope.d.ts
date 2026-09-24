export type SubjectScope = {
    kind: 'global';
} | {
    kind: 'org';
    organizationId: string;
} | {
    kind: 'org_assigned';
    organizationId: string;
    userId: string;
} | {
    kind: 'public';
} | {
    kind: 'deny';
    reason: 'staff_without_organization';
};
export interface AuthContext {
    userId: string;
    permissions: string[];
    organizationId: string | null;
    roleName: string | null;
    scope: SubjectScope;
    sessionId: string | null;
    isAnonymous: boolean;
}
