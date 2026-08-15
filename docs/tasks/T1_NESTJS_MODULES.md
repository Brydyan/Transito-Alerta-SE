# T1: Backend NestJS Modules

> ⚠️ **Documento histórico — no usar como referencia de la API.**
>
> Este archivo es el borrador de planificación previo a la implementación.
> El código real difiere en varios puntos importantes:
>
> - `synchronize: true` fue **rechazado** — las migraciones son SQL manual en
>   `database/migrations/`, ejecutadas a mano en Supabase.
> - La ubicación se guarda como `geometry(Point, 4326)` de PostGIS, no como
>   dos columnas `decimal`.
> - La API usa `lat` / `lng`, no `latitude` / `longitude`.
> - Las rutas y las formas de request/response cambiaron.
>
> **El contrato vigente está en [`docs/API_CONTRACT.md`](../API_CONTRACT.md)**,
> verificado contra la aplicación corriendo.

**Responsable:** Backend Developer  
**Duración:** 2 semanas  
**Prioridad:** 🔴 CRÍTICA  
**Dependencia:** T3 (DB Schema) debe estar terminada

---

## 📝 Descripción

Crear estructura modular de NestJS adaptando Controllers/Services de GeoReporta (Laravel). Mantener lógica de negocio, cambiar solo implementación a TypeScript + NestJS.

---

## 🛠️ Pasos Detallados

### Paso 1: Setup Base NestJS

```bash
# Verificar que existe carpeta backend
ls -la backend/

# Inicializar si es nuevo proyecto
# npm install -g @nestjs/cli
# nest new backend

# Navegar a backend
cd backend

# Instalar dependencias principales
npm install @nestjs/common @nestjs/core @nestjs/platform-express
npm install @nestjs/jwt @nestjs/passport passport passport-jwt
npm install @nestjs/typeorm typeorm pg postgis
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
npm install @nestjs/cache-manager cache-manager redis
npm install class-validator class-transformer
npm install axios dotenv
npm install @sentry/node

# Dev dependencies
npm install -D @nestjs/cli @types/node typescript
npm install -D jest @nestjs/testing @types/jest
npm install -D supertest @types/supertest
```

### Paso 2: Configuración Base (main.ts)

Crear `backend/src/main.ts`:
```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global API prefix
  app.setGlobalPrefix('api');

  // Validación global
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  // CORS
  app.enableCors();

  // Sentry
  Sentry.init({ dsn: process.env.SENTRY_DSN });

  await app.listen(3001);
  console.log('🚀 API running on http://localhost:3001/api');
}
bootstrap();
```

### Paso 3: Crear Módulo Incidents

```bash
cd backend/src

# Crear estructura de carpetas
mkdir -p modules/incidents/{entities,dto,services,controllers}
mkdir -p modules/incidents/__tests__

# Crear archivos
touch modules/incidents/incidents.module.ts
touch modules/incidents/incidents.service.ts
touch modules/incidents/incidents.controller.ts
touch modules/incidents/entities/incident.entity.ts
touch modules/incidents/dto/create-incident.dto.ts
touch modules/incidents/dto/update-incident.dto.ts
```

**File: `modules/incidents/entities/incident.entity.ts`**
```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('incidents')
export class Incident {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column()
  description: string;

  @Column('decimal', { precision: 10, scale: 8 })
  latitude: number;

  @Column('decimal', { precision: 11, scale: 8 })
  longitude: number;

  @Column({ default: 'pending' })
  status: 'pending' | 'in_progress' | 'resolved';

  @Column({ default: 'medium' })
  priority: 'low' | 'medium' | 'high';

  @Column()
  citizen_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column({ nullable: true })
  resolved_at: Date;
}
```

**File: `modules/incidents/dto/create-incident.dto.ts`**
```typescript
import { IsString, IsNumber, IsOptional, Min, Max, IsEnum } from 'class-validator';

export class CreateIncidentDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsEnum(['low', 'medium', 'high'])
  @IsOptional()
  priority: string = 'medium';

  @IsString({ each: true })
  @IsOptional()
  category_ids: string[];
}
```

**File: `modules/incidents/incidents.service.ts`**
```typescript
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incident } from './entities/incident.entity';
import { CreateIncidentDto } from './dto/create-incident.dto';

@Injectable()
export class IncidentsService {
  constructor(
    @InjectRepository(Incident)
    private incidentsRepo: Repository<Incident>,
  ) {}

  async create(dto: CreateIncidentDto, citizenId: string) {
    // Validar geofencing (PostGIS)
    const isWithinCanton = await this.validateLocation(dto.latitude, dto.longitude);
    if (!isWithinCanton) {
      throw new BadRequestException('Location outside Santa Elena canton');
    }

    const incident = this.incidentsRepo.create({
      ...dto,
      citizen_id: citizenId,
    });

    return this.incidentsRepo.save(incident);
  }

  async findAll(filters?: any) {
    let query = this.incidentsRepo.createQueryBuilder('incident');

    if (filters?.status) {
      query = query.where('incident.status = :status', { status: filters.status });
    }

    if (filters?.priority) {
      query = query.andWhere('incident.priority = :priority', { priority: filters.priority });
    }

    return query.orderBy('incident.created_at', 'DESC').getMany();
  }

  async findOne(id: string) {
    return this.incidentsRepo.findOneBy({ id });
  }

  async updateStatus(id: string, status: string) {
    await this.incidentsRepo.update(id, {
      status,
      resolved_at: status === 'resolved' ? new Date() : null,
    });
    return this.findOne(id);
  }

  private async validateLocation(lat: number, lng: number): Promise<boolean> {
    // TODO: Implement PostGIS geofencing query
    // SELECT ST_Contains(bounds, ST_Point(lat, lng, 4326))
    return true; // Placeholder
  }
}
```

**File: `modules/incidents/incidents.controller.ts`**
```typescript
import { Controller, Post, Get, Patch, Param, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto } from './dto/create-incident.dto';

@Controller('incidents')
export class IncidentsController {
  constructor(private incidentsService: IncidentsService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Body() dto: CreateIncidentDto, @Request() req) {
    return this.incidentsService.create(dto, req.user.id);
  }

  @Get()
  findAll() {
    return this.incidentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.incidentsService.findOne(id);
  }

  @Patch(':id/status')
  @UseGuards(AuthGuard('jwt'))
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.incidentsService.updateStatus(id, status);
  }
}
```

**File: `modules/incidents/incidents.module.ts`**
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IncidentsService } from './incidents.service';
import { IncidentsController } from './incidents.controller';
import { Incident } from './entities/incident.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Incident])],
  controllers: [IncidentsController],
  providers: [IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
```

### Paso 4: Crear Módulo Comments

```bash
mkdir -p modules/comments/{entities,dto,services,controllers}
mkdir -p modules/comments/__tests__
```

**File: `modules/comments/entities/comment.entity.ts`**
```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  content: string;

  @Column()
  incident_id: string;

  @Column()
  user_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
```

**File: `modules/comments/comments.service.ts`**
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './entities/comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private commentsRepo: Repository<Comment>,
  ) {}

  async create(dto: CreateCommentDto, userId: string) {
    const comment = this.commentsRepo.create({
      ...dto,
      user_id: userId,
    });
    return this.commentsRepo.save(comment);
  }

  async findByIncident(incidentId: string) {
    return this.commentsRepo.find({
      where: { incident_id: incidentId },
      order: { created_at: 'ASC' },
    });
  }

  async delete(id: string, userId: string) {
    const comment = await this.commentsRepo.findOneBy({ id });
    if (comment.user_id !== userId) {
      throw new Error('Unauthorized');
    }
    return this.commentsRepo.remove(comment);
  }
}
```

### Paso 5: Crear Módulo Auth

```bash
mkdir -p modules/auth/{dto,services,controllers,guards}
```

**File: `modules/auth/auth.service.ts`**
```typescript
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async login(userId: string, deviceUuid: string) {
    const payload = { sub: userId, device_uuid: deviceUuid };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async validateToken(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      return null;
    }
  }
}
```

### Paso 6: Crear Módulo WebSockets

```bash
mkdir -p modules/websockets
```

**File: `modules/websockets/incidents.gateway.ts`**
```typescript
import { WebSocketGateway, WebSocketServer, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class IncidentsGateway implements OnGatewayInit {
  @WebSocketServer() server: Server;

  afterInit(server: Server) {
    console.log('✅ WebSocket initialized');
  }

  handleConnection(client: Socket) {
    console.log(`✅ Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`❌ Client disconnected: ${client.id}`);
  }

  // Emitir cambios de incidente
  emitIncidentUpdate(incident: any) {
    this.server.emit('incident:updated', incident);
  }

  emitIncidentCreated(incident: any) {
    this.server.emit('incident:created', incident);
  }
}
```

### Paso 7: Configurar AppModule

**File: `modules/app.module.ts`**
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { CommentsModule } from './modules/comments/comments.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'transito_alerta_se',
      entities: ['src/**/*.entity.ts'],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secret',
      signOptions: { expiresIn: '24h' },
    }),
    IncidentsModule,
    CommentsModule,
    AuthModule,
  ],
})
export class AppModule {}
```

### Paso 8: Tests Unitarios

**File: `modules/incidents/__tests__/incidents.service.spec.ts`**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IncidentsService } from '../incidents.service';
import { Incident } from '../entities/incident.entity';

describe('IncidentsService', () => {
  let service: IncidentsService;
  let mockRepo;

  beforeEach(async () => {
    mockRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOneBy: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentsService,
        {
          provide: getRepositoryToken(Incident),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<IncidentsService>(IncidentsService);
  });

  it('should create incident', async () => {
    const dto = { title: 'Test', description: 'Desc', latitude: -2.0, longitude: -80.5, priority: 'medium' };
    mockRepo.create.mockReturnValue(dto);
    mockRepo.save.mockReturnValue({ id: '123', ...dto });

    const result = await service.create(dto, 'user-1');
    expect(result.title).toBe('Test');
  });
});
```

---

## 📦 Build y Deploy

```bash
# Compilar
npm run build

# Verificar que no hay errores TypeScript
npx tsc --noEmit

# Correr API
npm run start

# Verificar que API está corriendo
curl http://localhost:3001/api/health
```

---

## ✅ Criterios de Aceptación

- [ ] **Estructura**
  - [ ] Carpeta `backend/src/modules/` existe con: incidents, comments, assignments, auth, notifications, geofencing, websockets
  - [ ] Cada módulo tiene: `.module.ts`, `.service.ts`, `.controller.ts`, `entities/`, `dto/`
  - [ ] AppModule importa todos los módulos

- [ ] **Controllers**
  - [ ] Incidents: POST /incidents, GET /incidents, GET /incidents/:id, PATCH /incidents/:id/status
  - [ ] Comments: POST /incidents/:id/comments, GET /incidents/:id/comments, DELETE /comments/:id
  - [ ] Assignments: POST /incidents/:id/assign, GET /incidents/:id/assignments
  - [ ] Auth: POST /auth/login, POST /auth/refresh (tokens válidos)
  - [ ] Notifications: GET /notifications (solo del usuario autenticado)

- [ ] **Services**
  - [ ] IncidentsService.create() valida geofencing
  - [ ] IncidentsService.findAll() acepta filtros (status, priority)
  - [ ] IncidentsService.updateStatus() solo cambia status válidos
  - [ ] CommentsService.create() solo si incident existe
  - [ ] CommentsService.delete() solo owner o admin
  - [ ] AuthService.login() retorna access_token válido
  - [ ] AuthService.validateToken() verifica JWT

- [ ] **Entidades**
  - [ ] Incident entity tiene: id, title, description, latitude, longitude, status, priority, citizen_id, timestamps
  - [ ] Comment entity tiene: id, content, incident_id, user_id, timestamps
  - [ ] Assignment entity tiene: id, incident_id, user_id, role, created_at
  - [ ] Notification entity tiene: id, user_id, type, related_incident_id, is_read, created_at

- [ ] **DTOs**
  - [ ] CreateIncidentDto valida: title (string), description (string), lat/lng (numbers), priority (enum)
  - [ ] CreateCommentDto valida: content (string)
  - [ ] CreateAssignmentDto valida: user_id, role

- [ ] **Guards & Middleware**
  - [ ] AuthGuard en rutas protegidas (@UseGuards)
  - [ ] ValidationPipe en main.ts
  - [ ] CORS habilitado

- [ ] **WebSockets**
  - [ ] IncidentsGateway crea conexión Socket.io
  - [ ] Emite eventos: incident:created, incident:updated, incident:deleted

- [ ] **Compilación**
  - [ ] `npm run build` sin errores
  - [ ] `npx tsc --noEmit` pasa validación
  - [ ] `npm run start` inicia en puerto 3001

- [ ] **Testing**
  - [ ] Tests unitarios para al menos 3 servicios
  - [ ] `npm run test` ejecuta sin fallos
  - [ ] Coverage ≥ 60%

- [ ] **Documentación**
  - [ ] Cada servicio tiene JSDoc con ejemplos
  - [ ] README con: cómo instalar, cómo correr, endpoints disponibles
  - [ ] Archivo `.env.example` con variables requeridas

---

## 🔗 Referencias

- **Referencia:** `/GeoReporta/backend/app/Domains/`
- **NestJS Docs:** https://docs.nestjs.com/
- **TypeORM:** https://typeorm.io/
- **PostgreSQL:** https://www.postgresql.org/

---

**Status:** ⏳ TODO  
**Assigned to:** Backend Developer  
**Start date:** YYYY-MM-DD  
**End date:** YYYY-MM-DD
