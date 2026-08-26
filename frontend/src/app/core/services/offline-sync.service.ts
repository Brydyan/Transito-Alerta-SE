import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval, lastValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { IndexedDbService } from '../db/indexed-db.service';
import { IncidentService } from './incident.service';
import { ConnectionService } from './connection.service';

export interface SyncResult {
  synced: number;
  failed: number;
  total: number;
}

@Injectable({
  providedIn: 'root',
})
export class OfflineSyncService {
  private syncInProgress$ = new BehaviorSubject<boolean>(false);
  private syncResult$ = new BehaviorSubject<SyncResult>({ synced: 0, failed: 0, total: 0 });

  constructor(
    private indexedDb: IndexedDbService,
    private incidentService: IncidentService,
    private connectionService: ConnectionService,
  ) {
    this.initOfflineSync();
  }

  async queueIncident(incident: any, photo?: File): Promise<string> {
    let photoBlob: Blob | undefined;

    if (photo) {
      photoBlob = await this.compressPhoto(photo);
    }

    const queuedIncident = {
      ...incident,
      photo: photoBlob,
      imageUrl: photoBlob ? URL.createObjectURL(photoBlob) : undefined,
    };

    return this.indexedDb.addPendingIncident(queuedIncident);
  }

  async syncPendingIncidents(): Promise<SyncResult> {
    this.syncInProgress$.next(true);

    const pending = await this.indexedDb.getPendingByStatus('pending');
    let synced = 0;
    let failed = 0;

    for (const incident of pending) {
      try {
        const createdIncident = await lastValueFrom(this.incidentService.createIncident({
          title: incident.title,
          description: incident.description,
          latitude: incident.latitude,
          longitude: incident.longitude,
          priority: incident.priority,
        }));

        // Si hay foto, subirla
        if (incident.photo) {
          // TODO: Implementar upload de foto a Storage
        }

        await this.indexedDb.updateIncidentStatus(incident.id, 'synced');
        synced++;
      } catch (error: any) {
        await this.indexedDb.updateIncidentStatus(
          incident.id,
          incident.attempts >= 3 ? 'failed' : 'pending',
          error.message,
        );
        failed++;
      }
    }

    const result: SyncResult = {
      synced,
      failed,
      total: pending.length,
    };

    this.syncResult$.next(result);
    this.syncInProgress$.next(false);

    return result;
  }

  async getPendingIncidents(): Promise<any[]> {
    return this.indexedDb.getPendingIncidents();
  }

  getPendingIncidents$(): Observable<any[]> {
    return new Observable(observer => {
      this.getPendingIncidents().then(incidents => {
        observer.next(incidents);
        observer.complete();
      });
    });
  }

  getSyncInProgress$(): Observable<boolean> {
    return this.syncInProgress$.asObservable();
  }

  getSyncResult$(): Observable<SyncResult> {
    return this.syncResult$.asObservable();
  }

  private initOfflineSync(): void {
    // Sincronizar cada 30 segundos si hay conexión
    interval(30000)
      .pipe(
        switchMap(() => this.connectionService.getConnectionStatus$()),
      )
      .subscribe(isOnline => {
        if (isOnline && !this.syncInProgress$.value) {
          this.syncPendingIncidents();
        }
      });

    // Sincronizar cuando se recupera la conexión
    this.connectionService.getConnectionStatus$().subscribe(isOnline => {
      if (isOnline && !this.syncInProgress$.value) {
        this.syncPendingIncidents();
      }
    });
  }

  private async compressPhoto(file: File): Promise<Blob> {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = img.width;
          canvas.height = img.height;
          ctx?.drawImage(img, 0, 0);
          canvas.toBlob(blob => resolve(blob!), 'image/webp', 0.7);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
}
