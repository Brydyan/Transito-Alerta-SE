# T4: Offline-First (IndexedDB + Sync)

**Responsable:** Frontend Developer  
**Duración:** 1.5 semanas  
**Prioridad:** 🟡 ALTA  
**Dependencia:** T2 (Frontend Services)

---

## 📝 Descripción

Implementar cola de reportes offline con IndexedDB. Sincronización automática cuando hay conexión.

---

## 🛠️ Pasos Detallados

### Paso 1: Instalar Dependencias

```bash
cd frontend

npm install idb
npm install uuid
npm install -D @types/uuid
```

### Paso 2: IndexedDB Service

**File: `app/core/db/indexed-db.service.ts`**
```typescript
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
  private db: IDBPDatabase<PendingIncident>;

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

  async getPendingByStatus(status: string): Promise<any[]> {
    return this.db.getAllFromIndex('pending_incidents', 'by-status', status);
  }

  async updateIncidentStatus(id: string, status: string, error?: string): Promise<void> {
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
```

### Paso 3: Offline Sync Service

**File: `app/core/services/offline-sync.service.ts`**
```typescript
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval } from 'rxjs';
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
      imageUrl: photo ? URL.createObjectURL(photoBlob) : undefined,
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
        const createdIncident = await this.incidentService.createIncident({
          title: incident.title,
          description: incident.description,
          latitude: incident.latitude,
          longitude: incident.longitude,
          priority: incident.priority,
        }).toPromise();

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
```

### Paso 4: Connection Service

**File: `app/core/services/connection.service.ts`**
```typescript
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ConnectionService {
  private isOnline$ = new BehaviorSubject<boolean>(navigator.onLine);

  constructor() {
    window.addEventListener('online', () => this.isOnline$.next(true));
    window.addEventListener('offline', () => this.isOnline$.next(false));
  }

  getConnectionStatus$(): Observable<boolean> {
    return this.isOnline$.asObservable();
  }

  isOnline(): boolean {
    return this.isOnline$.value;
  }
}
```

### Paso 5: Service Worker (PWA)

**File: `ngsw-config.json`**
```json
{
  "$schema": "./node_modules/@angular/service-worker/config/schema.json",
  "index": "/index.html",
  "assetGroups": [
    {
      "name": "app",
      "installMode": "prefetch",
      "resources": {
        "files": ["/favicon.ico", "/index.html", "/*.css", "/*.js"]
      }
    },
    {
      "name": "assets",
      "installMode": "lazy",
      "updateMode": "lazy",
      "resources": {
        "files": ["/assets/**", "!**/.*"]
      }
    }
  ],
  "dataGroups": [
    {
      "name": "api-incidents",
      "urls": ["/api/incidents", "/api/incidents/*"],
      "cacheConfig": {
        "strategy": "performance",
        "maxSize": 100,
        "maxAge": "1h"
      }
    }
  ],
  "navigationUrls": [
    "!/assets/**",
    "!/**/*.json"
  ]
}
```

**File: `manifest.webmanifest`**
```json
{
  "name": "Tránsito Alerta SE",
  "short_name": "Tránsito Alerta",
  "theme_color": "#1976d2",
  "background_color": "#fafafa",
  "display": "standalone",
  "scope": "/",
  "start_url": "/",
  "icons": [
    {
      "src": "assets/icons/icon-72x72.png",
      "sizes": "72x72",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "assets/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "assets/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    }
  ]
}
```

### Paso 6: Actualizar AppModule

**File: `app/app.module.ts`** (agregar):
```typescript
import { ServiceWorkerModule } from '@angular/service-worker';
import { environment } from '../environments/environment';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    HttpClientModule,
    AppRoutingModule,
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: environment.production,
    }),
  ],
  // ... resto
})
export class AppModule {}
```

### Paso 7: Component Ejemplo (Citizen Report)

**File: `app/features/citizen-report/citizen-report.component.ts`**
```typescript
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { GeolocationService } from '../../core/services/geolocation.service';
import { ConnectionService } from '../../core/services/connection.service';

@Component({
  selector: 'app-citizen-report',
  templateUrl: './citizen-report.component.html',
})
export class CitizenReportComponent implements OnInit {
  form: FormGroup;
  isOnline$ = this.connectionService.getConnectionStatus$();
  isSyncing$ = this.offlineSyncService.getSyncInProgress$();
  selectedPhoto: File | null = null;
  photoPreview: string | null = null;

  constructor(
    private fb: FormBuilder,
    private offlineSyncService: OfflineSyncService,
    private geolocationService: GeolocationService,
    private connectionService: ConnectionService,
  ) {
    this.form = this.fb.group({
      title: ['', Validators.required],
      description: ['', Validators.required],
      priority: ['medium'],
    });
  }

  ngOnInit() {
    this.geolocationService.getCurrentLocation().subscribe(coords => {
      console.log('GPS:', coords);
    });
  }

  onPhotoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedPhoto = file;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.photoPreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  async onSubmit() {
    if (!this.form.valid || !this.selectedPhoto) return;

    const coords = await this.geolocationService.getCurrentLocation().toPromise();

    const incident = {
      ...this.form.value,
      latitude: coords?.latitude,
      longitude: coords?.longitude,
    };

    const incidentId = await this.offlineSyncService.queueIncident(
      incident,
      this.selectedPhoto,
    );

    console.log('✅ Report queued:', incidentId);
    this.form.reset();
    this.selectedPhoto = null;
    this.photoPreview = null;
  }
}
```

### Paso 8: Testing

**File: `app/core/services/__tests__/offline-sync.service.spec.ts`**
```typescript
import { TestBed } from '@angular/core/testing';
import { OfflineSyncService } from '../offline-sync.service';
import { IndexedDbService } from '../../db/indexed-db.service';

describe('OfflineSyncService', () => {
  let service: OfflineSyncService;
  let mockIndexedDb: any;

  beforeEach(async () => {
    mockIndexedDb = {
      addPendingIncident: jest.fn().mockResolvedValue('123'),
      getPendingByStatus: jest.fn().mockResolvedValue([]),
    };

    await TestBed.configureTestingModule({
      providers: [
        OfflineSyncService,
        { provide: IndexedDbService, useValue: mockIndexedDb },
      ],
    }).compileComponents();

    service = TestBed.inject(OfflineSyncService);
  });

  it('should queue incident', async () => {
    const incident = { title: 'Test', latitude: -2.0, longitude: -80.5 };
    const id = await service.queueIncident(incident);
    expect(id).toBe('123');
  });
});
```

---

## ✅ Criterios de Aceptación

- [ ] **IndexedDB**
  - [ ] Tabla `pending_incidents` creada
  - [ ] Campos: id, title, description, lat/lng, photo, status, attempts, createdAt
  - [ ] Índices en status y createdAt
  - [ ] addPendingIncident() guarda datos
  - [ ] getPendingIncidents() retorna array

- [ ] **Offline Sync**
  - [ ] OfflineSyncService.queueIncident() funciona
  - [ ] syncPendingIncidents() envía a API
  - [ ] Retry logic (máx 3 intentos)
  - [ ] Sincronización automática cada 30s (si online)
  - [ ] Sincronización al detectar online

- [ ] **Photo Compression**
  - [ ] Compresión a WebP funciona
  - [ ] Resultado < 200KB
  - [ ] Stored en IndexedDB como Blob

- [ ] **Connection Detection**
  - [ ] ConnectionService monitorea conexión
  - [ ] Navigator.onLine events listener
  - [ ] Observable actualiza con cambios

- [ ] **Service Worker**
  - [ ] ngsw-config.json configurado
  - [ ] Assets en prefetch
  - [ ] API calls en cache strategy
  - [ ] Offline fallback funcionando

- [ ] **PWA Manifest**
  - [ ] manifest.webmanifest en public/
  - [ ] Iconos 72x72, 192x192, 512x512
  - [ ] `display: standalone`
  - [ ] Installable en home screen

- [ ] **Component**
  - [ ] Formulario con validación
  - [ ] Geolocation integration
  - [ ] Photo capture
  - [ ] Submit → queue (offline) o sync (online)
  - [ ] UI muestra estado offline/syncing

- [ ] **Testing**
  - [ ] Tests para IndexedDbService
  - [ ] Tests para OfflineSyncService
  - [ ] Tests para ConnectionService
  - [ ] Coverage ≥ 70%

---

## 🔗 Referencias

- **IDB:** https://github.com/jakearchibald/idb
- **Service Workers:** https://web.dev/service-workers-cache-storage/
- **PWA:** https://web.dev/progressive-web-apps/

---

**Status:** ⏳ TODO  
**Assigned to:** Frontend Developer  
**Start date:** YYYY-MM-DD  
**End date:** YYYY-MM-DD
