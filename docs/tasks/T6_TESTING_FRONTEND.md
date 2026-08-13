# T6: Testing Frontend (Jest + Karma/Jasmine)

**Responsable:** Frontend Developer  
**Duración:** 1 semana  
**Prioridad:** 🟡 MEDIA  
**Dependencia:** T2 (Angular Services)

---

## 📝 Descripción

Tests unitarios para servicios y componentes Angular.

---

## 🛠️ Pasos Detallados

### Paso 1: Setup

```bash
cd frontend
ng generate @schematics/angular:remove-e2e  # Si es necesario
ng generate module test --module=app
```

### Paso 2: Service Tests

**File: `src/app/core/services/__tests__/incident.service.spec.ts`**
```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { IncidentService } from '../incident.service';
import { Incident } from '../../models/incident.model';

describe('IncidentService', () => {
  let service: IncidentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [IncidentService],
    });

    service = TestBed.inject(IncidentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create incident', (done) => {
    const dto = { title: 'Test', description: 'Desc', latitude: -2.0, longitude: -80.5 };
    
    service.createIncident(dto).subscribe(result => {
      expect(result.title).toBe('Test');
      done();
    });

    const req = httpMock.expectOne('http://localhost:3001/api/incidents');
    expect(req.request.method).toBe('POST');
    req.flush({ id: '123', ...dto });
  });

  it('should get all incidents', (done) => {
    const incidents: Incident[] = [
      { id: '1', title: 'Test1', status: 'pending', priority: 'high' } as any,
    ];

    service.getIncidents().subscribe(result => {
      expect(result.length).toBe(1);
      done();
    });

    const req = httpMock.expectOne('http://localhost:3001/api/incidents');
    expect(req.request.method).toBe('GET');
    req.flush(incidents);
  });

  it('should update incident status', (done) => {
    service.updateIncidentStatus('123', 'in_progress').subscribe(result => {
      expect(result.status).toBe('in_progress');
      done();
    });

    const req = httpMock.expectOne('http://localhost:3001/api/incidents/123/status');
    expect(req.request.method).toBe('PATCH');
    req.flush({ id: '123', status: 'in_progress' } as any);
  });
});
```

**File: `src/app/core/services/__tests__/geolocation.service.spec.ts`**
```typescript
import { TestBed } from '@angular/core/testing';
import { GeolocationService, Coordinates } from '../geolocation.service';

describe('GeolocationService', () => {
  let service: GeolocationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GeolocationService],
    });

    service = TestBed.inject(GeolocationService);
  });

  it('should get current location', (done) => {
    const mockPosition = {
      coords: {
        latitude: -1.95,
        longitude: -80.45,
        accuracy: 10,
      },
      timestamp: Date.now(),
    };

    const geolocationSpy = jest.spyOn(navigator.geolocation, 'getCurrentPosition')
      .mockImplementation((success) => {
        success(mockPosition as any);
      });

    service.getCurrentLocation().subscribe(coords => {
      expect(coords.latitude).toBe(-1.95);
      expect(coords.longitude).toBe(-80.45);
      geolocationSpy.mockRestore();
      done();
    });
  });

  it('should handle geolocation error', (done) => {
    const geolocationSpy = jest.spyOn(navigator.geolocation, 'getCurrentPosition')
      .mockImplementation((success, error) => {
        error({ code: 1, message: 'Permission denied' } as any);
      });

    service.getCurrentLocation().subscribe(
      () => fail('should have failed'),
      (error) => {
        expect(error).toBeDefined();
        geolocationSpy.mockRestore();
        done();
      }
    );
  });
});
```

**File: `src/app/core/services/__tests__/offline-sync.service.spec.ts`**
```typescript
import { TestBed } from '@angular/core/testing';
import { OfflineSyncService } from '../offline-sync.service';
import { IndexedDbService } from '../../db/indexed-db.service';
import { IncidentService } from '../incident.service';
import { ConnectionService } from '../connection.service';

describe('OfflineSyncService', () => {
  let service: OfflineSyncService;
  let mockIndexedDb: any;
  let mockIncidentService: any;

  beforeEach(async () => {
    mockIndexedDb = {
      addPendingIncident: jest.fn().mockResolvedValue('123'),
      getPendingByStatus: jest.fn().mockResolvedValue([]),
      updateIncidentStatus: jest.fn().mockResolvedValue(null),
    };

    mockIncidentService = {
      createIncident: jest.fn().mockReturnValue({ toPromise: () => Promise.resolve({ id: '1' }) }),
    };

    await TestBed.configureTestingModule({
      providers: [
        OfflineSyncService,
        { provide: IndexedDbService, useValue: mockIndexedDb },
        { provide: IncidentService, useValue: mockIncidentService },
        { provide: ConnectionService, useValue: { getConnectionStatus$: () => ({ subscribe: () => {} }) } },
      ],
    }).compileComponents();

    service = TestBed.inject(OfflineSyncService);
  });

  it('should queue incident', async () => {
    const incident = { title: 'Test', latitude: -2.0, longitude: -80.5 };
    const id = await service.queueIncident(incident);
    expect(id).toBe('123');
    expect(mockIndexedDb.addPendingIncident).toHaveBeenCalled();
  });

  it('should sync pending incidents', async () => {
    const pending = [{ id: '1', title: 'Test', status: 'pending', attempts: 0 }];
    mockIndexedDb.getPendingByStatus.mockResolvedValue(pending);

    const result = await service.syncPendingIncidents();
    expect(result.synced).toBeGreaterThan(0);
  });
});
```

### Paso 3: Component Tests

**File: `src/app/features/citizen-report/citizen-report.component.spec.ts`**
```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { CitizenReportComponent } from './citizen-report.component';
import { OfflineSyncService } from '../../core/services/offline-sync.service';
import { GeolocationService } from '../../core/services/geolocation.service';

describe('CitizenReportComponent', () => {
  let component: CitizenReportComponent;
  let fixture: ComponentFixture<CitizenReportComponent>;
  let mockOfflineSync: any;
  let mockGeolocation: any;

  beforeEach(async () => {
    mockOfflineSync = {
      queueIncident: jest.fn().mockResolvedValue('123'),
      getSyncInProgress$: jest.fn().mockReturnValue({ subscribe: () => {} }),
    };

    mockGeolocation = {
      getCurrentLocation: jest.fn().mockReturnValue({
        subscribe: (cb: any) => cb({ latitude: -1.95, longitude: -80.45 }),
      }),
    };

    await TestBed.configureTestingModule({
      declarations: [CitizenReportComponent],
      imports: [ReactiveFormsModule],
      providers: [
        { provide: OfflineSyncService, useValue: mockOfflineSync },
        { provide: GeolocationService, useValue: mockGeolocation },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CitizenReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should validate form', () => {
    expect(component.form.valid).toBeFalsy();
    
    component.form.patchValue({
      title: 'Test',
      description: 'Desc',
    });

    expect(component.form.valid).toBeTruthy();
  });

  it('should submit form', async () => {
    component.selectedPhoto = new File(['photo'], 'test.jpg');
    component.form.patchValue({
      title: 'Test',
      description: 'Desc',
    });

    await component.onSubmit();
    expect(mockOfflineSync.queueIncident).toHaveBeenCalled();
  });
});
```

### Paso 4: Ejecutar Tests

```bash
cd frontend

# Tests
ng test

# Con coverage
ng test --code-coverage

# Modo watch
ng test --watch=true
```

---

## ✅ Criterios de Aceptación

- [ ] **Service Tests**
  - [ ] IncidentService: create, getAll, getOne, updateStatus
  - [ ] GeolocationService: getCurrentLocation, error handling
  - [ ] OfflineSyncService: queue, sync, status update
  - [ ] AuthService: login, token validation
  - [ ] CommentService: create, delete, findByIncident
  - [ ] Mocking de HttpClient
  - [ ] Observables testeados correctamente

- [ ] **Component Tests**
  - [ ] CitizenReportComponent: form validation, photo upload, submit
  - [ ] AdminDashboardComponent: load incidents, filter, status update
  - [ ] AuthComponent: login flow, error display
  - [ ] Mocking de servicios inyectados
  - [ ] Change detection testeada

- [ ] **Coverage**
  - [ ] Coverage total ≥ 70%
  - [ ] Services ≥ 80%
  - [ ] Components ≥ 60%
  - [ ] Statements, branches, functions, lines ≥ 70%

- [ ] **Execution**
  - [ ] `ng test` ejecuta sin errores
  - [ ] `ng test --code-coverage` genera reporte
  - [ ] Todos los tests pasan
  - [ ] No hay warnings

---

## 🔗 Referencias

- **Angular Testing:** https://angular.io/guide/testing
- **Jasmine:** https://jasmine.github.io/
- **Karma:** https://karma-runner.github.io/

---

**Status:** ⏳ TODO  
**Assigned to:** Frontend Developer  
**Start date:** YYYY-MM-DD  
**End date:** YYYY-MM-DD
