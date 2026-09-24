import { AuthContext } from './subject-scope';
export interface ManageableTarget {
    id: string;
    organizationId: string | null;
    roleName: string | null;
}
export declare function assertCanManage(actor: AuthContext, target: ManageableTarget): void;
export declare function assertVisible(actor: AuthContext, target: ManageableTarget): void;
export declare function assertCanGrantRole(actor: AuthContext, grantedRoleName: string | null): void;
