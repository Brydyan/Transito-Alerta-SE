import { Injectable } from '@angular/core';
import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface PendingIncident extends DBSchema {
  pending_incidents: {
    key: string;
    value: {
      id: string;
      title: string;
      description: string;
      latitude: number;
      longitude: number;
      photo?: Blob;
      imageUrl?: string;
      status: 'pending' | 'synced' | 'failed';
      attempts: number;
      createdAt: Date;
      error?: string;
    };
    indexes: {
      'by-status': string;
      'by-created': Date;
    };
  };
}

@Injectable({
  providedIn: 'root',
})
export class IndexedDbService {
  private db!: IDBPDatabase<PendingIncident>;

  async init() {
    this.db = await openDB<PendingIncident>('transito-alerta-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('pending_incidents')) {
          const store = db.createObjectStore('pending_incidents', { keyPath: 'id' });
          store.createIndex('by-status', 'status');
          store.createIndex('by-created', 'createdAt');
        }
      },
    });
  }

  async addPendingIncident(incident: any): Promise<string> {
    const id = incident.id || crypto.randomUUID();
    await this.db.add('pending_incidents', {
      ...incident,
      id,
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
    });
    return id;
  }

  async getPendingIncidents(): Promise<any[]> {
    return this.db.getAll('pending_incidents');
  }

  async getPendingByStatus(status: 'pending' | 'synced' | 'failed'): Promise<any[]> {
    return this.db.getAllFromIndex('pending_incidents', 'by-status', status);
  }

  async updateIncidentStatus(id: string, status: 'pending' | 'synced' | 'failed', error?: string): Promise<void> {
    const incident = await this.db.get('pending_incidents', id);
    if (incident) {
      incident.status = status;
      if (error) incident.error = error;
      incident.attempts = (incident.attempts || 0) + 1;
      await this.db.put('pending_incidents', incident);
    }
  }

  async deleteIncident(id: string): Promise<void> {
    await this.db.delete('pending_incidents', id);
  }

  async clearAll(): Promise<void> {
    await this.db.clear('pending_incidents');
  }
}
