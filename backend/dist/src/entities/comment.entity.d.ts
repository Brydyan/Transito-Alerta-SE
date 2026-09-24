export declare class CommentEntity {
    id: string;
    content: string;
    incidentId: string;
    userId: string;
    parentId: string | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
