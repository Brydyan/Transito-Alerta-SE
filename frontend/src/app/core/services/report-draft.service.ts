import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';

export interface ReportDraft {
  id?: number; // Primary key, always 1 for the singleton draft
  step: number;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  categoryId: string;
  isAnonymous: boolean;
  latitude: number | null;
  longitude: number | null;
  files: Blob[];
  lastUpdated: Date;
}

class ReportDraftDb extends Dexie {
  drafts!: Table<ReportDraft, number>;

  constructor() {
    super('ReportDraftDb');
    this.version(1).stores({
      drafts: 'id',
    });
  }
}

@Injectable({
  providedIn: 'root'
})
export class ReportDraftService {
  private db: ReportDraftDb;

  constructor() {
    this.db = new ReportDraftDb();
  }

  async getDraft(): Promise<ReportDraft | undefined> {
    return this.db.drafts.get(1);
  }

  async saveDraft(draft: Partial<ReportDraft>): Promise<void> {
    const existing = await this.getDraft();
    const payload: ReportDraft = {
      id: 1,
      step: draft.step ?? existing?.step ?? 1,
      title: draft.title ?? existing?.title ?? '',
      description: draft.description ?? existing?.description ?? '',
      priority: draft.priority ?? existing?.priority ?? 'medium',
      categoryId: draft.categoryId ?? existing?.categoryId ?? '',
      isAnonymous: draft.isAnonymous ?? existing?.isAnonymous ?? false,
      latitude: draft.latitude !== undefined ? draft.latitude : (existing?.latitude ?? null),
      longitude: draft.longitude !== undefined ? draft.longitude : (existing?.longitude ?? null),
      files: draft.files ?? existing?.files ?? [],
      lastUpdated: new Date()
    };
    await this.db.drafts.put(payload);
  }

  async clearDraft(): Promise<void> {
    await this.db.drafts.delete(1);
  }
}
