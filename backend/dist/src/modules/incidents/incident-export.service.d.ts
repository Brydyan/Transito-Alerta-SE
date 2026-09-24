import { DataSource } from 'typeorm';
import { PassThrough, Readable } from 'stream';
import { AuthContext } from '../../common/authz/subject-scope';
import { ExportQueryDto } from './dto/export-query.dto';
export type ExportFormat = 'csv' | 'xlsx';
export interface ExportStreamResult {
    stream: Readable | PassThrough;
    contentType: string;
    filename: string;
}
export declare class IncidentExportService {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    private buildWhere;
    countFiltered(query: ExportQueryDto, user: AuthContext): Promise<number>;
    createCsvStream(query: ExportQueryDto, user: AuthContext, cap: number): Readable;
    createXlsxStream(query: ExportQueryDto, user: AuthContext, cap: number): PassThrough;
    createExportStream(query: ExportQueryDto, user: AuthContext, cap: number, format?: ExportFormat): Promise<ExportStreamResult>;
}
