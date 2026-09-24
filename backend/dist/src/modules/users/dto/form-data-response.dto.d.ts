export interface RoleDto {
    id: string;
    name: string;
}
export interface OrganizationDto {
    id: string;
    name: string;
}
export declare class FormDataResponseDto {
    roles: RoleDto[];
    organizations: OrganizationDto[];
}
