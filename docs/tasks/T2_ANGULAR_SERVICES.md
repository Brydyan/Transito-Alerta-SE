# T2: Frontend Angular Services

**Responsable:** Frontend Developer  
**Duración:** 2 semanas  
**Prioridad:** 🔴 CRÍTICA  
**Dependencia:** T1 (Backend API) debe estar funcionando

---

## 📝 Descripción

Crear servicios Angular que consumen API NestJS. Implementar HTTP client wrapper, interceptores, guardias, y lógica de negocio reactiva con RxJS.

---

## 🛠️ Pasos Detallados

### Paso 1: Setup Angular Base

```bash
# Crear proyecto Angular (si no existe)
# ng new frontend --routing --style=css
# cd frontend

# Instalar dependencias principales
npm install @angular/common @angular/core @angular/forms @angular/router
npm install @angular/platform-browser @angular/platform-browser-dynamic
npm install rxjs
npm install leaflet
npm install tailwindcss postcss autoprefixer

# Inicializar Tailwind
npx tailwindcss init -p

# Dev dependencies
npm install -D @angular/cli typescript @types/node
npm install -D jest @types/jest ts-jest
npm install -D @angular/compiler-cli
```

### Paso 2: Crear Estructura de Carpetas

```bash
cd frontend/src/app

# Core (servicios singleton, guards, interceptores)
mkdir -p core/services
mkdir -p core/interceptors
mkdir -p core/guards
mkdir -p core/models

# Shared (componentes reutilizables)
mkdir -p shared/components
mkdir -p shared/pipes
mkdir -p shared/directives

# Features (módulos por dominio)
mkdir -p features/citizen-report
mkdir -p features/admin-dashboard
mkdir -p features/auth

# Models/Interfaces
mkdir -p models

# Styles
mkdir -p styles
```

### Paso 3: Crear Models/Interfaces

> **Contrato de la API:** todas las claves JSON son `snake_case`, en request y
> en response — lo garantiza `SnakeCaseResponseInterceptor` en el backend.
> Las coordenadas viajan como `lat`/`lng`, no `latitude`/`longitude`, para
> coincidir con Leaflet (`L.latLng`, `.lat`, `.lng`).

**File: `app/models/incident.model.ts`**
```typescript
export interface Incident {
  id: string;
  title: string;
  description: string;
  lat: number;
  lng: number;
  status: 'pending' | 'in_progress' | 'resolved';
  priority: 'low' | 'medium' | 'high';
  citizen_id: string;
  assigned_to: string | null;
  zone_id: string | null;
  // false cuando el reporte cae fuera de toda zona registrada.
  // El incidente se acepta igual (R2) — no se rechaza por jurisdicción.
  geofence_matched: boolean;
  created_at: Date;
  updated_at: Date;
  resolved_at?: Date;
}

export interface CreateIncidentDto {
  title: string;
  description: string;
  lat: number;
  lng: number;
  priority?: 'low' | 'medium' | 'high';
  category_ids?: string[];
}
```

**File: `app/models/comment.model.ts`**
```typescript
export interface Comment {
  id: string;
  content: string;
  incident_id: string;
  user_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCommentDto {
  content: string;
  incident_id: string;
}
```

**File: `app/models/auth.model.ts`**
```typescript
export interface AuthResponse {
  access_token: string;
  user?: User;
}

export interface User {
  id: string;
  email: string;
  role: 'citizen' | 'operator' | 'admin';
  device_uuid: string;
  created_at: Date;
}
```

### Paso 4: HTTP Client Wrapper

**File: `app/core/services/http.service.ts`**
```typescript
import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class HttpService {
  private baseUrl = 'http://localhost:3001/api';

  constructor(private http: HttpClient) {}

  get<T>(endpoint: string, params?: any): Observable<T> {
    let httpParams = new HttpParams();
    if (params) {
      Object.keys(params).forEach(key => {
        httpParams = httpParams.set(key, params[key]);
      });
    }
    return this.http.get<T>(`${this.baseUrl}${endpoint}`, { params: httpParams });
  }

  post<T>(endpoint: string, body: any): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${endpoint}`, body);
  }

  patch<T>(endpoint: string, body: any): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}${endpoint}`, body);
  }

  delete<T>(endpoint: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${endpoint}`);
  }
}
```

### Paso 5: Auth Interceptor

**File: `app/core/interceptors/auth.interceptor.ts`**
```typescript
import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private authService: AuthService) {}

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler,
  ): Observable<HttpEvent<any>> {
    const token = this.authService.getToken();

    if (token) {
      req = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      });
    }

    return next.handle(req);
  }
}
```

**File: `app/core/interceptors/error.interceptor.ts`**
```typescript
import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  intercept(
    req: HttpRequest<any>,
    next: HttpHandler,
  ): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        console.error('HTTP Error:', error);

        if (error.status === 401) {
          // Redirigir a login
          window.location.href = '/auth/login';
        }

        return throwError(() => error);
      }),
    );
  }
}
```

### Paso 6: Auth Service

**File: `app/core/services/auth.service.ts`**
```typescript
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpService } from './http.service';
import { AuthResponse, User } from '../models/auth.model';
import { v4 as uuidv4 } from 'uuid';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private currentUser$ = new BehaviorSubject<User | null>(null);
  private token$ = new BehaviorSubject<string | null>(null);

  constructor(private httpService: HttpService) {
    this.initDeviceUuid();
    this.loadStoredToken();
  }

  login(email: string, password: string): Observable<AuthResponse> {
    const deviceUuid = this.getDeviceUuid();
    return new Observable(observer => {
      this.httpService
        .post<AuthResponse>('/auth/login', { email, password, device_uuid: deviceUuid })
        .subscribe({
          next: (response) => {
            localStorage.setItem('access_token', response.access_token);
            this.token$.next(response.access_token);
            observer.next(response);
            observer.complete();
          },
          error: (error) => observer.error(error),
        });
    });
  }

  logout(): void {
    localStorage.removeItem('access_token');
    this.token$.next(null);
    this.currentUser$.next(null);
  }

  getCurrentUser(): Observable<User> {
    return new Observable(observer => {
      this.httpService.get<User>('/auth/me').subscribe({
        next: (user) => {
          this.currentUser$.next(user);
          observer.next(user);
          observer.complete();
        },
        error: (error) => observer.error(error),
      });
    });
  }

  getToken(): string | null {
    return this.token$.value;
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getDeviceUuid(): string {
    let uuid = localStorage.getItem('device_uuid');
    if (!uuid) {
      uuid = uuidv4();
      localStorage.setItem('device_uuid', uuid);
    }
    return uuid;
  }

  private initDeviceUuid(): void {
    let uuid = localStorage.getItem('device_uuid');
    if (!uuid) {
      uuid = uuidv4();
      localStorage.setItem('device_uuid', uuid);
    }
  }

  private loadStoredToken(): void {
    const token = localStorage.getItem('access_token');
    if (token) {
      this.token$.next(token);
    }
  }
}
```

### Paso 7: Incident Service

**File: `app/core/services/incident.service.ts`**
```typescript
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpService } from './http.service';
import { Incident, CreateIncidentDto } from '../models/incident.model';

@Injectable({
  providedIn: 'root',
})
export class IncidentService {
  private incidents$ = new BehaviorSubject<Incident[]>([]);

  constructor(private httpService: HttpService) {}

  getIncidents(filters?: any): Observable<Incident[]> {
    return new Observable(observer => {
      this.httpService.get<Incident[]>('/incidents', filters).subscribe({
        next: (data) => {
          this.incidents$.next(data);
          observer.next(data);
          observer.complete();
        },
        error: (error) => observer.error(error),
      });
    });
  }

  getIncident(id: string): Observable<Incident> {
    return this.httpService.get<Incident>(`/incidents/${id}`);
  }

  createIncident(dto: CreateIncidentDto): Observable<Incident> {
    return new Observable(observer => {
      this.httpService.post<Incident>('/incidents', dto).subscribe({
        next: (incident) => {
          const current = this.incidents$.value;
          this.incidents$.next([incident, ...current]);
          observer.next(incident);
          observer.complete();
        },
        error: (error) => observer.error(error),
      });
    });
  }

  updateIncidentStatus(id: string, status: string): Observable<Incident> {
    return new Observable(observer => {
      this.httpService
        .patch<Incident>(`/incidents/${id}/status`, { status })
        .subscribe({
          next: (incident) => {
            const current = this.incidents$.value.map(inc =>
              inc.id === id ? incident : inc,
            );
            this.incidents$.next(current);
            observer.next(incident);
            observer.complete();
          },
          error: (error) => observer.error(error),
        });
    });
  }

  deleteIncident(id: string): Observable<void> {
    return new Observable(observer => {
      this.httpService.delete<void>(`/incidents/${id}`).subscribe({
        next: () => {
          const current = this.incidents$.value.filter(inc => inc.id !== id);
          this.incidents$.next(current);
          observer.next();
          observer.complete();
        },
        error: (error) => observer.error(error),
      });
    });
  }

  getIncidents$(): Observable<Incident[]> {
    return this.incidents$.asObservable();
  }
}
```

### Paso 8: Comment Service

**File: `app/core/services/comment.service.ts`**
```typescript
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpService } from './http.service';
import { Comment, CreateCommentDto } from '../models/comment.model';

@Injectable({
  providedIn: 'root',
})
export class CommentService {
  constructor(private httpService: HttpService) {}

  getComments(incidentId: string): Observable<Comment[]> {
    return this.httpService.get<Comment[]>(`/incidents/${incidentId}/comments`);
  }

  createComment(incidentId: string, dto: CreateCommentDto): Observable<Comment> {
    return this.httpService.post<Comment>(`/incidents/${incidentId}/comments`, dto);
  }

  deleteComment(id: string): Observable<void> {
    return this.httpService.delete<void>(`/comments/${id}`);
  }
}
```

### Paso 9: Geolocation Service

**File: `app/core/services/geolocation.service.ts`**
```typescript
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

// Refleja `position.coords` del navegador, por eso usa latitude/longitude.
// OJO: la API espera lat/lng. Al enviar hay que mapear:
//   { lat: coords.latitude, lng: coords.longitude }
export interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root',
})
export class GeolocationService {
  private currentLocation$ = new BehaviorSubject<Coordinates | null>(null);
  private watching = false;

  getCurrentLocation(): Observable<Coordinates> {
    return new Observable(observer => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const coords: Coordinates = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: new Date(position.timestamp),
            };
            this.currentLocation$.next(coords);
            observer.next(coords);
            observer.complete();
          },
          (error) => {
            observer.error(`Geolocation error: ${error.message}`);
          },
        );
      } else {
        observer.error('Geolocation not supported');
      }
    });
  }

  watchLocation(): Observable<Coordinates> {
    return new Observable(observer => {
      if (navigator.geolocation) {
        const watchId = navigator.geolocation.watchPosition(
          (position) => {
            const coords: Coordinates = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: new Date(position.timestamp),
            };
            this.currentLocation$.next(coords);
            observer.next(coords);
          },
          (error) => {
            observer.error(`Geolocation error: ${error.message}`);
          },
        );

        return () => {
          navigator.geolocation.clearWatch(watchId);
        };
      } else {
        observer.error('Geolocation not supported');
      }
    });
  }

  getCurrentLocation$(): Observable<Coordinates | null> {
    return this.currentLocation$.asObservable();
  }
}
```

### Paso 10: Image Compressor Service

**File: `app/core/services/image-compressor.service.ts`**
```typescript
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ImageCompressorService {
  async compressImage(file: File, quality: number = 0.7): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event: any) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          canvas.width = img.width;
          canvas.height = img.height;

          ctx?.drawImage(img, 0, 0);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject('Failed to compress image');
              }
            },
            'image/webp',
            quality,
          );
        };

        img.onerror = () => reject('Failed to load image');
        img.src = event.target.result;
      };

      reader.onerror = () => reject('Failed to read file');
      reader.readAsDataURL(file);
    });
  }

  getFileSizeKB(blob: Blob): number {
    return blob.size / 1024;
  }
}
```

### Paso 11: Notification Service

**File: `app/core/services/notification.service.ts`**
```typescript
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpService } from './http.service';

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  related_incident_id: string;
  is_read: boolean;
  created_at: Date;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  constructor(private httpService: HttpService) {}

  getNotifications(): Observable<Notification[]> {
    return this.httpService.get<Notification[]>('/notifications');
  }

  markAsRead(id: string): Observable<Notification> {
    return this.httpService.patch<Notification>(`/notifications/${id}/read`, {});
  }
}
```

### Paso 12: Auth Guard

**File: `app/core/guards/auth.guard.ts`**
```typescript
import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ): boolean {
    if (this.authService.isAuthenticated()) {
      return true;
    }

    this.router.navigate(['/auth/login']);
    return false;
  }
}
```

### Paso 13: Configure App Module

**File: `app/app.module.ts`**
```typescript
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AuthInterceptor } from './core/interceptors/auth.interceptor';
import { ErrorInterceptor } from './core/interceptors/error.interceptor';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    HttpClientModule,
    AppRoutingModule,
  ],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true,
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ErrorInterceptor,
      multi: true,
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

### Paso 14: Verificar que Compila

```bash
# Compilar Angular
ng build

# Verificar types
ng build --strict

# Ejecutar servidor de desarrollo
ng serve --port 4200

# Verificar que no hay errores
curl http://localhost:4200
```

---

## ✅ Criterios de Aceptación

- [ ] **Estructura**
  - [ ] Carpetas creadas: core/services, core/interceptors, core/guards, models, shared, features

- [ ] **Models**
  - [ ] Incident model con todos los campos
  - [ ] Comment model
  - [ ] User & AuthResponse models
  - [ ] Interfaces TypeScript bien tipadas

- [ ] **HTTP Client**
  - [ ] HttpService wrapper funcional
  - [ ] GET, POST, PATCH, DELETE métodos
  - [ ] Base URL configurable

- [ ] **Interceptores**
  - [ ] AuthInterceptor agrega JWT en headers
  - [ ] ErrorInterceptor maneja 401 (redirige a login)
  - [ ] Ambos registrados en AppModule

- [ ] **Auth Service**
  - [ ] login() retorna Observable<AuthResponse>
  - [ ] getToken() retorna token almacenado
  - [ ] isAuthenticated() retorna boolean
  - [ ] getDeviceUuid() crea/retorna UUID único
  - [ ] logout() limpia storage

- [ ] **Incident Service**
  - [ ] getIncidents(filters?) retorna Observable<Incident[]>
  - [ ] getIncident(id) retorna Observable<Incident>
  - [ ] createIncident() actualiza estado local
  - [ ] updateIncidentStatus() cambia status y notifica
  - [ ] deleteIncident() elimina del estado

- [ ] **Comment Service**
  - [ ] getComments(incidentId) retorna Observable<Comment[]>
  - [ ] createComment() POST a /incidents/:id/comments
  - [ ] deleteComment() DELETE /comments/:id

- [ ] **Geolocation Service**
  - [ ] getCurrentLocation() pide permiso y retorna Coordinates
  - [ ] watchLocation() monitorea cambios de ubicación
  - [ ] Maneja errores si GPS no disponible
  - [ ] currentLocation$ observable actualiza

- [ ] **Image Compressor Service**
  - [ ] compressImage() retorna Promise<Blob>
  - [ ] Comprime a WebP con quality parameter
  - [ ] getFileSizeKB() retorna tamaño en KB
  - [ ] Resultado < 200KB

- [ ] **Notification Service**
  - [ ] getNotifications() GET /notifications
  - [ ] markAsRead() PATCH /notifications/:id/read

- [ ] **Guards**
  - [ ] AuthGuard protege rutas (CanActivate)
  - [ ] Redirige a login si no autenticado

- [ ] **App Module**
  - [ ] HttpClientModule importado
  - [ ] Interceptores registrados (multi: true)
  - [ ] Providers configurados
  - [ ] AppComponent bootstrap

- [ ] **Compilación**
  - [ ] `ng build` sin errores
  - [ ] `ng build --strict` pasa validación TypeScript
  - [ ] `ng serve` inicia sin warnings

- [ ] **Testing**
  - [ ] Al menos 3 services testeados (Auth, Incident, Geolocation)
  - [ ] `ng test` ejecuta sin fallos
  - [ ] Coverage ≥ 60%

---

## 🔗 Referencias

- **Referencia:** `/GeoReporta/frontend/app/`
- **Angular Docs:** https://angular.io/docs
- **RxJS:** https://rxjs.dev/
- **HttpClient:** https://angular.io/guide/http

---

**Status:** ⏳ TODO  
**Assigned to:** Frontend Developer  
**Start date:** YYYY-MM-DD  
**End date:** YYYY-MM-DD
