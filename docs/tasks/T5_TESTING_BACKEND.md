# T5: Testing Backend (Jest + Supertest)

**Responsable:** Backend Developer  
**Duración:** 1 semana  
**Prioridad:** 🟡 MEDIA  
**Dependencia:** T1 (NestJS Modules)

---

## 📝 Descripción

Tests unitarios e integración para módulos NestJS con Jest + Supertest.

---

## 🛠️ Pasos Detallados

### Paso 1: Setup Jest

```bash
cd backend

npm install -D @nestjs/testing jest @types/jest supertest @types/supertest ts-jest
```

**File: `jest.config.js`**
```javascript
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  roots: ['<rootDir>', '<rootDir>/../test'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/$1',
  },
};
```

**File: `package.json`** (agregar scripts):
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage"
  }
}
```

### Paso 2: Unit Tests - Incidents Service

**File: `src/modules/incidents/__tests__/incidents.service.spec.ts`**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IncidentsService } from '../incidents.service';
import { Incident } from '../entities/incident.entity';
import { BadRequestException } from '@nestjs/common';

describe('IncidentsService', () => {
  let service: IncidentsService;
  let mockRepo: any;

  beforeEach(async () => {
    mockRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOneBy: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
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

  describe('create', () => {
    it('should create incident with valid location', async () => {
      const dto = {
        title: 'Accident',
        description: 'Car crash',
        latitude: -1.95,
        longitude: -80.45,
        priority: 'high',
      };

      mockRepo.create.mockReturnValue(dto);
      mockRepo.save.mockResolvedValue({ id: '123', ...dto });

      const result = await service.create(dto, 'user-1');
      expect(result.title).toBe('Accident');
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('should reject location outside canton', async () => {
      const dto = {
        title: 'Test',
        latitude: 0, // Outside canton
        longitude: 0,
      };

      jest.spyOn(service as any, 'validateLocation').mockResolvedValue(false);

      expect(service.create(dto, 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return all incidents', async () => {
      const incidents = [{ id: '1' }, { id: '2' }];
      mockRepo.find.mockResolvedValue(incidents);

      const result = await service.findAll();
      expect(result).toEqual(incidents);
    });

    it('should filter by status', async () => {
      const incidents = [{ id: '1', status: 'pending' }];
      mockRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(incidents),
      });

      const result = await service.findAll({ status: 'pending' });
      expect(result).toEqual(incidents);
    });
  });

  describe('updateStatus', () => {
    it('should update incident status', async () => {
      mockRepo.findOneBy.mockResolvedValue({ id: '123', status: 'pending' });
      mockRepo.update.mockResolvedValue({});

      const result = await service.updateStatus('123', 'in_progress');
      expect(mockRepo.update).toHaveBeenCalledWith('123', expect.objectContaining({ status: 'in_progress' }));
    });

    it('should set resolved_at when status is resolved', async () => {
      const resolved = { id: '123', status: 'resolved', resolved_at: new Date() };
      mockRepo.findOneBy.mockResolvedValue(resolved);
      mockRepo.update.mockResolvedValue({});

      await service.updateStatus('123', 'resolved');
      expect(mockRepo.update).toHaveBeenCalledWith('123', expect.objectContaining({ status: 'resolved' }));
    });
  });
});
```

### Paso 3: Unit Tests - Comments Service

**File: `src/modules/comments/__tests__/comments.service.spec.ts`**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CommentsService } from '../comments.service';
import { Comment } from '../entities/comment.entity';

describe('CommentsService', () => {
  let service: CommentsService;
  let mockRepo: any;

  beforeEach(async () => {
    mockRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOneBy: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        {
          provide: getRepositoryToken(Comment),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
  });

  it('should create comment', async () => {
    const dto = { content: 'Test comment', incident_id: '123' };
    mockRepo.create.mockReturnValue(dto);
    mockRepo.save.mockResolvedValue({ id: 'comment-1', ...dto, user_id: 'user-1' });

    const result = await service.create(dto, 'user-1');
    expect(result.content).toBe('Test comment');
  });

  it('should get comments by incident', async () => {
    const comments = [{ id: '1', content: 'Comment 1' }];
    mockRepo.find.mockResolvedValue(comments);

    const result = await service.findByIncident('incident-1');
    expect(result).toEqual(comments);
  });

  it('should delete comment only if owner', async () => {
    const comment = { id: '1', user_id: 'user-1', content: 'Test' };
    mockRepo.findOneBy.mockResolvedValue(comment);
    mockRepo.remove.mockResolvedValue(comment);

    await service.delete('1', 'user-1');
    expect(mockRepo.remove).toHaveBeenCalled();
  });

  it('should reject delete if not owner', async () => {
    const comment = { id: '1', user_id: 'user-1' };
    mockRepo.findOneBy.mockResolvedValue(comment);

    expect(service.delete('1', 'user-2')).rejects.toThrow();
  });
});
```

### Paso 4: Unit Tests - Auth Service

**File: `src/modules/auth/__tests__/auth.service.spec.ts`**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let mockJwt: any;

  beforeEach(async () => {
    mockJwt = {
      sign: jest.fn().mockReturnValue('token-xyz'),
      verify: jest.fn().mockReturnValue({ sub: 'user-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwt },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should login and return token', async () => {
    const result = await service.login('user-1', 'device-uuid');
    expect(result.access_token).toBe('token-xyz');
    expect(mockJwt.sign).toHaveBeenCalled();
  });

  it('should validate valid token', async () => {
    const result = await service.validateToken('valid-token');
    expect(result.sub).toBe('user-1');
  });

  it('should return null for invalid token', async () => {
    mockJwt.verify.mockImplementation(() => {
      throw new Error('Invalid');
    });

    const result = await service.validateToken('invalid-token');
    expect(result).toBeNull();
  });
});
```

### Paso 5: Integration Tests

**File: `src/modules/incidents/__tests__/incidents.integration.spec.ts`**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { IncidentsModule } from '../incidents.module';
import { Incident } from '../entities/incident.entity';

describe('Incidents Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Incident],
          synchronize: true,
        }),
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1h' },
        }),
        IncidentsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  describe('POST /incidents', () => {
    it('should create incident with valid data', () => {
      return request(app.getHttpServer())
        .post('/incidents')
        .set('Authorization', 'Bearer token')
        .send({
          title: 'Accident',
          description: 'Test',
          latitude: -1.95,
          longitude: -80.45,
        })
        .expect(201)
        .expect(res => {
          expect(res.body.id).toBeDefined();
          expect(res.body.status).toBe('pending');
        });
    });

    it('should reject invalid latitude', () => {
      return request(app.getHttpServer())
        .post('/incidents')
        .set('Authorization', 'Bearer token')
        .send({
          title: 'Test',
          latitude: 999, // Invalid
          longitude: -80.45,
        })
        .expect(400);
    });
  });

  describe('GET /incidents/:id', () => {
    it('should get incident by id', () => {
      return request(app.getHttpServer())
        .get('/incidents/test-id')
        .expect(200);
    });
  });

  describe('PATCH /incidents/:id/status', () => {
    it('should update status to in_progress', () => {
      return request(app.getHttpServer())
        .patch('/incidents/test-id/status')
        .set('Authorization', 'Bearer token')
        .send({ status: 'in_progress' })
        .expect(200);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
```

### Paso 6: Ejecutar Tests

```bash
cd backend

# Ejecutar todos los tests
npm run test

# Ver coverage
npm run test:cov

# Watch mode
npm run test:watch

# Test específico
npm run test -- incidents.service
```

---

## ✅ Criterios de Aceptación

- [ ] **Setup**
  - [ ] jest.config.js configurado
  - [ ] `npm run test` ejecuta sin errores
  - [ ] `npm run test:cov` genera coverage report

- [ ] **Unit Tests - Incidents**
  - [ ] create() test con geofencing válido
  - [ ] create() test rechaza fuera de jurisdicción
  - [ ] findAll() retorna array
  - [ ] findAll() con filtros funciona
  - [ ] updateStatus() cambia status
  - [ ] updateStatus() setea resolved_at cuando es resolved
  - [ ] Coverage ≥ 80%

- [ ] **Unit Tests - Comments**
  - [ ] create() guarda comentario
  - [ ] findByIncident() retorna comentarios
  - [ ] delete() solo si owner
  - [ ] delete() rechaza si no owner
  - [ ] Coverage ≥ 80%

- [ ] **Unit Tests - Auth**
  - [ ] login() retorna token válido
  - [ ] validateToken() verifica JWT válido
  - [ ] validateToken() retorna null para inválido
  - [ ] Coverage ≥ 80%

- [ ] **Integration Tests**
  - [ ] POST /incidents (201 con data válida)
  - [ ] POST /incidents (400 con data inválida)
  - [ ] GET /incidents/:id (200 si existe)
  - [ ] GET /incidents (200 retorna array)
  - [ ] PATCH /incidents/:id/status (200)
  - [ ] Validación de DTO en controller
  - [ ] Autenticación requerida en rutas protegidas

- [ ] **Mocking**
  - [ ] Repositories mockeados
  - [ ] Services mockeados
  - [ ] Promises resueltas correctamente
  - [ ] Errores lanzados apropiadamente

- [ ] **Coverage**
  - [ ] Coverage total ≥ 70%
  - [ ] Statements ≥ 70%
  - [ ] Branches ≥ 60%
  - [ ] Functions ≥ 70%
  - [ ] Lines ≥ 70%

- [ ] **CI Integration**
  - [ ] Tests corren en GitHub Actions
  - [ ] Reporte de coverage generado
  - [ ] Falla si coverage < 60%

---

## 🔗 Referencias

- **Jest:** https://jestjs.io/
- **NestJS Testing:** https://docs.nestjs.com/fundamentals/testing
- **Supertest:** https://github.com/visionmedia/supertest

---

**Status:** ⏳ TODO  
**Assigned to:** Backend Developer  
**Start date:** YYYY-MM-DD  
**End date:** YYYY-MM-DD
