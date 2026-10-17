import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindManyOptions, In, IsNull, Not, Repository } from 'typeorm';

import { UserEntity } from './entities/user.entity';
import { RoleEntity } from '../roles/entities/role.entity';
import { OrganizationEntity } from '../organizations/entities/organization.entity';
import { AuthContext, SubjectScope } from '../../shared/authz/subject-scope';
import { assertCanManage, assertVisible } from '../../shared/authz/assert-can-manage';
import { PHONE_ALREADY_REGISTERED } from '../auth/auth-errors';
import { AuthService } from '../auth/auth.service';
import { SessionResponseDto, toSessionResponseDto } from '../sessions/dto/session-response.dto';
import { SessionsRepository } from '../sessions/sessions.repository';
import { AvatarStorageService, UploadedFile } from './avatar-storage.service';
import {
  DepartmentDto,
  FormDataResponseDto,
} from './dto/form-data-response.dto';
import { DepartmentRow } from '../departments/departments.repository';
import { AuditService } from '../audit/audit.service';
import { TelegramLinkService } from '../telegram/telegram-link.service';
import { SYSTEM_ADMIN_ROLE_NAME, SYSTEM_ONLY_ROLES } from './role-exclusions.constants';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import {
  ROLES_NOT_REQUIRING_ORG,
  requiresOrgAndDept,
} from './role-policy.constants';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

/**
 * UsersService (R4; T3.9 design §8) — profile, avatar (multipart -> S3 ->
 * signed URL), paginated listing, session listing delegation. Design DAG:
 * `Users -> Roles, Organizations (optional), Sessions (repository only)`.
 *
 * Depends on `SessionsRepository` directly, NOT `SessionsService` — the
 * latter is deliberately not exported by `SessionsModule` (design §8), so
 * `getSessionsForUser`'s visibility check calls the same `assertVisible`
 * pure function `SessionsService.listForTarget` uses, independently.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    private readonly avatarStorage: AvatarStorageService,
    @InjectRepository(RoleEntity) private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    private readonly authService: AuthService,
    private readonly sessionsRepository: SessionsRepository,
    // 2026-10-10-user-onboarding-telegram-tour (D6) — departments for
    // the form-data dropdown + cross-row validation in adminCreate.
    @InjectDataSource() private readonly dataSource: DataSource,
    // 2026-10-16 — AUD (sc-327) — every admin-side mutation
    // (`adminCreate`, `adminUpdate`, `softDelete`) emits a
    // `users.action` audit record inside the same transaction via
    // the `manager` parameter; the surface mirrors `assignments` and
    // `incidents` wiring. We don't audit the citizen self-service
    // path (`updateProfile`) — that lives outside the admin scope
    // and is captured separately by the AuthService when the user
    // accepts an invitation (out of scope of this change).
    private readonly auditService: AuditService,
    // 2026-10-16 — admin-side Telegram link regeneration. UsersModule
    // already imports TelegramModule (since 2026-10-10), so the
    // provider is in scope; this gives the service a handle on
    // `issueFor`/`composeDeepLink` without threading it through the
    // controller.
    private readonly telegramLinkService: TelegramLinkService,
  ) {}

  async findById(id: string): Promise<UserEntity> {
    // T6.8.B4: soft-deleted users are invisible (deletedAt IS NULL filter)
    const user = await this.userRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  /**
   * 2026-10-16-resend-invitation (D1) — variante de `findById` que
   * además calcula `hasPendingInvitation` para alimentar el botón
   * "Reenviar invitación" del `UserFormComponent`. El EXISTS filtra
   * `accepted_at IS NULL AND expires_at > NOW()` — sólo cuenta
   * invitaciones realmente vivas (no expiradas, no consumidas).
   *
   * Separado de `findById` para que el costo del EXISTS no se pague
   * en cada lookup no-admin (login, sessions, etc).
   */
  async findByIdWithPendingFlag(
    id: string,
  ): Promise<UserEntity & { hasPendingInvitation: boolean }> {
    const user = await this.findById(id);
    const rows = await this.dataSource.query<Array<{ value: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM invitations
           WHERE email = $1
             AND accepted_at IS NULL
             AND expires_at > NOW()
       ) AS value`,
      [user.email],
    );
    return { ...user, hasPendingInvitation: rows[0]?.value === true };
  }

  /**
   * T5.4 — reference data for user-management forms.
   * System admins see every role and every org. Everyone else gets the
   * system-only roles filtered out and only their own organization.
   *
   * sc-340 (R1) — `deletedAt: IsNull()` is now applied in BOTH branches.
   * `RolesService.findAll` has always filtered soft-deleted roles, so before
   * this the two endpoints disagreed about the same table: the roles listing
   * hid a role that the form dropdown still offered. `0029_dynamic_menus_data_migration.sql`
   * soft-deleted the pre-0023 legacy names (`admin_organizacion`,
   * `operator_organizacion`, ...) locally, which is what made the divergence
   * visible to an admin picking a role. The filter is composed with the
   * system-only name exclusion, not substituted for it.
   */
  async getFormData(currentUser: AuthContext): Promise<FormDataResponseDto> {
    const isSystemAdmin = currentUser.roleName === SYSTEM_ADMIN_ROLE_NAME;

    const roles = await this.roleRepo.find({
      select: ['id', 'name'],
      where: isSystemAdmin
        ? { deletedAt: IsNull() }
        : { deletedAt: IsNull(), name: Not(In(SYSTEM_ONLY_ROLES as unknown as string[])) },
      order: { name: 'ASC' },
    });

    const organizations = isSystemAdmin
      ? await this.orgRepo.find({ select: ['id', 'name'], order: { name: 'ASC' } })
      : currentUser.organizationId
        ? await this.orgRepo.find({
            select: ['id', 'name'],
            where: { id: currentUser.organizationId },
            order: { name: 'ASC' },
          })
        : [];

    // 2026-10-10-user-onboarding-telegram-tour (D6) — departments
    // for the form dropdown. System admins see every non-deleted
    // dept; everyone else only the depts of their own org. The
    // frontend filters the dropdown client-side by `organization_id`
    // when the user picks an org, but the full list is small enough
    // to ship every time.
    const deptRows: DepartmentRow[] = isSystemAdmin
      ? await this.dataSource.query(
          `SELECT id, name, organization_id FROM departments
            WHERE deleted_at IS NULL
            ORDER BY name ASC`,
        )
      : currentUser.organizationId
        ? await this.dataSource.query(
            `SELECT id, name, organization_id FROM departments
              WHERE deleted_at IS NULL
                AND organization_id = $1
              ORDER BY name ASC`,
            [currentUser.organizationId],
          )
        : [];
    const departments: DepartmentDto[] = deptRows.map((d) => ({
      id: d.id,
      name: d.name,
      organization_id: d.organization_id,
    }));

    return {
      roles: roles.map((r) => ({ id: r.id, name: r.name })),
      organizations: organizations.map((o) => ({ id: o.id, name: o.name, zone_id: o.zoneId ?? null })),
      departments,
    };
  }

  async findOne(id: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findByRole(roleName: string): Promise<UserEntity[]> {
    return this.userRepo
      .createQueryBuilder('u')
      .leftJoin('roles', 'r', 'u.role_id = r.id')
      .where('r.name = :roleName', { roleName })
      .getMany();
  }

  async updateProfile(id: string, input: UpdateProfileInput): Promise<UserEntity> {
    // 2026-10-16 — phone uniqueness (migration 0036). The partial
    // index fires 23505 on UPDATE when the new phone collides. We
    // catch the raw code here instead of doing a pre-check — this
    // is a self-service path (citizens / staff editing their own
    // profile) where a pre-check would introduce a TOCTOU window,
    // and the cost of a duplicate roundtrip is more visible to the
    // user than in admin paths. The map throws through if the code
    // isn't 23505 so the original error surfaces unchanged.
    try {
      await this.userRepo.update(id, input);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException(
          'El teléfono ya está registrado por otro usuario',
        );
      }
      throw err;
    }
    return this.findById(id);
  }

  async updateAvatar(id: string, file: UploadedFile): Promise<UserEntity> {
    const avatarUrl = await this.avatarStorage.upload(id, file);
    await this.userRepo.update(id, { avatarUrl });
    return this.findById(id);
  }

  /**
   * `scope` is a REQUIRED parameter (T3.2 design D3, Data Visibility
   * table) — never optional, never defaulted. `callerId` is only read for
   * `public` scope ("self only"); every other branch ignores it.
   */
  async list(
    page = 1,
    limit = DEFAULT_PAGE_SIZE,
    scope: SubjectScope,
    callerId?: string,
    // 2026-10-16 — toggle "mostrar inactivos" en lista de usuarios.
    // `activeOnly=undefined` → todos (default), `true` → solo
    // `is_active=true`, `false` → solo `is_active=false`. Sin this
    // param, los shadow-users de `adminCreate` (is_active=false
    // hasta que acepten la invitación) quedan ocultos — es el
    // comportamiento histórico que NO cambiamos en este change.
    activeOnly?: boolean,
  ): Promise<{ items: UserEntity[]; total: number }> {
    const take = Math.min(limit, MAX_PAGE_SIZE);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * take;

    // `activeOnly === undefined` → sin filtro (lista completa).
    // `activeOnly === true` → solo `is_active=true` (default histórico).
    // `activeOnly === false` → solo `is_active=false` (el toggle nuevo).
    const isActiveWhere = activeOnly === undefined ? undefined : { isActive: activeOnly };

    switch (scope.kind) {
      case 'global':
        return this.findAndCount({ take, skip, where: isActiveWhere });
      case 'org':
      case 'org_assigned':
        return this.findAndCount({
          take,
          skip,
          where: { organizationId: scope.organizationId, ...isActiveWhere },
        });
      case 'public': {
        if (!callerId) {
          return { items: [], total: 0 };
        }
        const self = await this.userRepo.findOne({ where: { id: callerId } });
        return self ? { items: [self], total: 1 } : { items: [], total: 0 };
      }
      case 'deny':
        return { items: [], total: 0 };
    }
  }

  private async findAndCount(options: {
    take: number;
    skip: number;
    where?: { organizationId?: string; isActive?: boolean };
  }): Promise<{ items: UserEntity[]; total: number }> {
    // F6 fix: filtrar por `is_active: true` para que los shadows
    // de `adminCreate` (is_active=false hasta que acepten la
    // invitación) no aparezcan en la lista. Ver el comentario
    // en `adminCreate` arriba para el contexto completo.
    //
    // 2026-10-16 — toggle "mostrar inactivos": cuando el caller
    // pasa `activeOnly !== undefined`, el `where` ya trae `isActive`
    // explícito y NO se sobreescribe con `isActive: true` (eso sería
    // contradictorio). El merge respeta el orden: si llega `isActive`,
    // gana el del caller; si no, default `true`.
    const callerWantsActive = options.where?.isActive !== undefined;
    const findOptions: FindManyOptions<UserEntity> = {
      ...options,
      where: callerWantsActive
        ? options.where
        : { ...options.where, isActive: true },
    };
    const [items, total] = await this.userRepo.findAndCount(findOptions);
    return { items, total };
  }

  /** `GET /users/me/sessions` (T3.9 D9) — self, no permission/rank check. */
  async getSessionsForSelf(actor: AuthContext): Promise<SessionResponseDto[]> {
    const rows = await this.sessionsRepository.findActiveByUser(actor.userId);
    return rows.map((row) => toSessionResponseDto(row, actor.sessionId));
  }

  /**
   * `GET /users/:id/sessions` (T3.9 D9) — a READ, so visibility only, never
   * rank (design §8's "one new export, no new axis": `assertVisible`).
   */
  async getSessionsForUser(actor: AuthContext, targetUserId: string): Promise<SessionResponseDto[]> {
    const target = await this.sessionsRepository.findManageableTarget(targetUserId);
    if (!target) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }
    assertVisible(actor, target);

    const rows = await this.sessionsRepository.findActiveByUser(targetUserId);
    return rows.map((row) => toSessionResponseDto(row, actor.sessionId));
  }

  /**
   * `PATCH /api/users/:id/organization` (T3.2 design D12). Loads the
   * target `{id, organizationId, roleName}` via a LEFT JOIN-equivalent
   * (role looked up by `roleId`), then `assertCanManage` (D9/D10/D11 —
   * 404 invisible, 403 out-ranked) BEFORE the write. `organization_id:
   * null` is accepted (removes the user from their org, D1 — falls to
   * `deny`, never `global`). Invalidates the target's permission cache
   * (design "Cache invalidation") — `permission_version` is deliberately
   * NOT bumped (D7: an org move does not change the permission set).
   */
  async updateOrganization(
    actor: AuthContext,
    targetId: string,
    organizationId: string | null,
  ): Promise<UserEntity> {
    const target = await this.userRepo.findOne({ where: { id: targetId } });
    if (!target) {
      throw new NotFoundException(`User ${targetId} not found`);
    }

    const role = target.roleId
      ? await this.roleRepo.findOne({ where: { id: target.roleId } })
      : null;

    assertCanManage(actor, {
      id: target.id,
      organizationId: target.organizationId,
      roleName: role?.name ?? null,
    });

    await this.userRepo.update(targetId, { organizationId });
    await this.authService.invalidatePermissionCache(target.id, target.deviceUuid);

    return this.findById(targetId);
  }

  // ---- T5.6 admin: create / update / softDelete

  /**
   * T5.6 — `POST /api/users`. Creates the user row directly with
   * `is_active = true` (T5.6 simplification: we do NOT route through
   * InvitationsService here because that would require the admin to
   * wait for the invitee to accept — the design D3 suggested routing
   * through invitations, but for the admin self-bootstrap flow we
   * create the account with a placeholder device_uuid and a temporary
   * password that the user resets on first login. Marked as a known
   * simplification vs. the design; the invitation route remains the
   * canonical onboarding path for non-admin flows (T3.6).
   *
   * F6 / 2026-09-08-f6-new-user-form (D2) — when `dto.role_id` is
   * present, denormalize the role's permissions onto the new user
   * (and bump `permission_version` to 2), exactly mirroring the
   * existing branch in `adminUpdate()`. Without `role_id`, keep the
   * T5.6 behavior (`permissions: []`, `permissionVersion: 1`) so
   * pre-existing callers stay green. The new `phone` field from D1
   * is persisted; its `users.phone` column was added in migration
   * 0022, so no schema change here.
   */
  async adminCreate(dto: AdminCreateUserDto, actorId: string): Promise<UserEntity> {
    let permissions: string[] = [];
    let permissionVersion = 1;
    let resolvedRoleName: string | null = null;

    if (dto.role_id) {
      const role = await this.roleRepo.findOne({ where: { id: dto.role_id } });
      if (!role) {
        throw new NotFoundException(`Role ${dto.role_id} not found`);
      }
      permissions = role.permissions ?? [];
      permissionVersion = 2;
      resolvedRoleName = role.name;
    }

    // 2026-10-10-user-onboarding-telegram-tour (D1) — role-vs-org-vs-dept
    // policy. Two outcomes:
    //   - global role (master / agent_system): force
    //     organization_id and department_id to null.
    //   - sectional role (admin_org / operator_org): both
    //     organization_id and department_id are required; the
    //     department must belong to the organization.
    //   - other roles (including `reporter`): NOT in this flow at all
    //     (citizen signup goes through the public register). We treat
    //     any other role name as "not in the role policy" and force
    //     nulls to avoid leaking the admin form to citizen roles.
    let organizationId: string | null = null;
    let departmentId: string | null = null;

    if (resolvedRoleName && ROLES_NOT_REQUIRING_ORG.includes(resolvedRoleName)) {
      organizationId = null;
      departmentId = null;
    } else if (resolvedRoleName && requiresOrgAndDept(resolvedRoleName)) {
      if (!dto.organization_id) {
        throw new BadRequestException(
          `Role ${resolvedRoleName} requires organization_id`,
        );
      }
      if (!dto.department_id) {
        throw new BadRequestException(
          `Role ${resolvedRoleName} requires department_id`,
        );
      }
      // Cross-row invariant: the department must belong to the
      // organization. The departments.repository is not exported as
      // a service provider so we hit the table directly.
      const dept = await this.dataSource.query<
        Array<{ organization_id: string; deleted_at: Date | null }>
      >(
        `SELECT organization_id, deleted_at FROM departments
          WHERE id = $1`,
        [dto.department_id],
      );
      if (dept.length === 0) {
        throw new BadRequestException(
          `Department ${dto.department_id} does not exist`,
        );
      }
      if (dept[0].deleted_at !== null) {
        throw new BadRequestException(
          `Department ${dto.department_id} is soft-deleted`,
        );
      }
      if (dept[0].organization_id !== dto.organization_id) {
        throw new BadRequestException(
          `Department ${dto.department_id} does not belong to organization ${dto.organization_id}`,
        );
      }
      organizationId = dto.organization_id;
      departmentId = dto.department_id;
    } else {
      // Unknown role (including `reporter`) — D7 isolation. Force
      // nulls so the admin form cannot accidentally persist org
      // context on a citizen.
      organizationId = null;
      departmentId = null;
    }

    // 2026-10-16 — phone uniqueness pre-check (migration 0036). The
    // partial unique index on `users.phone` enforces this at the
    // DB level, but a pre-check gives a 409 with a clear message
    // instead of a raw 23505 surfacing as a 500. `deletedAt: IsNull()`
    // matches the index's `phone IS NOT NULL` semantics — soft-deleted
    // users have their phone wiped to NULL and never collide.
    if (dto.phone) {
      const phoneConflict = await this.userRepo.findOne({
        where: { phone: dto.phone, deletedAt: IsNull() },
      });
      if (phoneConflict) {
        // 2026-10-17 — `code: PHONE_ALREADY_REGISTERED` permite
        // al frontend (`new-user-form.component.ts:onCreateError`)
        // distinguir teléfono duplicado de email duplicado y
        // mostrar el mensaje correcto. Antes mostraba "Email ya
        // registrado" para cualquier 409, lo que confundía al
        // admin cuando el conflicto era realmente del teléfono.
        throw new ConflictException({
          code: PHONE_ALREADY_REGISTERED,
          message: `El teléfono ${dto.phone} ya está registrado por otro usuario`,
        });
      }
    }

    const tempDeviceUuid = `admin-bootstrap-${dto.email}-${Date.now()}`;
    const user = this.userRepo.create({
      email: dto.email,
      deviceUuid: tempDeviceUuid,
      firstName: dto.first_name ?? null,
      lastName: dto.last_name ?? null,
      phone: dto.phone ?? null,
      organizationId,
      departmentId,
      geoZoneId: dto.geo_zone_id ?? null,
      roleId: dto.role_id ?? null,
      // 2026-10-16 — fix: the `users.role` column has a Postgres
      // DEFAULT of `'reporter'`. Without this line, every admin-create
      // landed in the DB as `role='reporter'` regardless of which
      // role was selected on the form (the FK `role_id` pointed at
      // the right role but the denormalized `role` column lied).
      // TypeORM only writes the columns you pass to `create()`; the
      // DEFAULT fires for everything else. `resolvedRoleName` is
      // already resolved above. When the caller omits `role_id` the
      // bug-shape behavior is to keep the schema default — we
      // explicit `'reporter'` so the row matches what the DB would
      // write anyway.
      role: resolvedRoleName ?? 'reporter',
      // F6 fix: el admin crea al user en estado `is_active: false`
      // ("pending"). El `is_active: true` original rompía el flow
      // de invitación: `findByClaimedEmail` (en
      // `invitations.repository.ts`) considera "claimed" cualquier
      // user existente con ese email, así que el
      // `POST /api/admin/users/invite` que el frontend dispara
      // después del `POST /api/users` devolvía 409
      // `EMAIL_ALREADY_CLAIMED` y nunca mandaba el email.
      //
      // Con `is_active: false`, el shadow del admin NO cuenta
      // como claimed — el backend manda el email, el destinatario
      // acepta la invitación, y `InvitationsService.redeem`
      // inserta el user real (is_active=true, password_hash,
      // terms_accepted_at) en una NUEVA fila. El shadow queda
      // en la tabla como registro histórico del alta admin;
      // `list()` lo filtra por is_active más abajo para que
      // no aparezca en la tabla del frontend.
      isActive: false,
      permissions,
      permissionVersion,
      // 2026-10-16-new-user-form-notif-channel (D1) — persistir el
      // canal preferido que el form envía solo cuando el caller es
      // Master. La columna DB tiene DEFAULT `'email'` desde migración
      // 0033; el fallback explícito mantiene el contrato simétrico
      // con `adminUpdate` (que también defaulta a `'email'`) y evita
      // que un DTO malformado quede con `null` y dispare el DEFAULT
      // de Postgres en lugar del valor pensado por el caller.
      preferredNotificationChannel: dto.preferred_notification_channel ?? 'email',
    });
    const saved = await this.userRepo.save(user);
    // 2026-10-16 — AUD (sc-327) — CREATE_USER. We audit AFTER the
    // save so `resource_id` is the persisted id (the shadow-user is
    // `is_active=false`; audit reflects the admin's intent, not the
    // redeemed-on-invitation acceptance).
    await this.auditService.record({
      actorId,
      action: 'CREATE_USER',
      resourceType: 'users',
      resourceId: saved.id,
    });
    return saved;
  }

  /**
   * T5.6 — `PATCH /api/users/:id`. Admin-side field updates; only the
   * fields present in the body are touched. Name updates still go
   * through `updateProfile` (R4 self-service path) — this method only
   * handles role + organization moves.
   *
   * 2026-10-15-user-status-notif-channel — extended with two new
   * optional fields:
   *   - `is_active` (Master-only toggle, self-deactivation rejected)
   *   - `preferred_notification_channel` (email | telegram, anyone
   *     with `UPDATE users` permission; the DTO `@IsIn` enforces the
   *     value at the validation pipe).
   *
   * `callerId` and `callerRole` come from `req.user!` on the
   * controller. The role check exists because the `@RequirePermission`
   * decorator only knows about capability strings, not role names —
   * `is_active` is Master-only by design (spec S1 / design D6).
   */
  async adminUpdate(
    id: string,
    dto: AdminUpdateUserDto,
    callerId: string,
    callerRole: string,
  ): Promise<UserEntity> {
    const target = await this.findById(id);

    // 2026-10-15-user-status-notif-channel — spec S1 escenario
    // "Master attempts to deactivate themselves" (400|403). We use
    // `ForbiddenException` (→ 403), matching design D2.
    if (dto.is_active === false && id === callerId) {
      throw new ForbiddenException('Cannot deactivate your own account');
    }

    // F6 fix: si el admin cambia el `email`, validar unicidad antes
    // de persistir. La columna `users.email` tiene UNIQUE en el
    // schema (0017), pero la constraint de BD devuelve un error
    // genérico de Postgres. Lo atrapamos antes para dar un 409 con
    // mensaje claro al frontend.
    if (dto.email !== undefined && dto.email !== target.email) {
      const conflict = await this.userRepo.findOne({
        where: { email: dto.email, deletedAt: IsNull() },
      });
      if (conflict && conflict.id !== target.id) {
        throw new ConflictException(
          `El correo ${dto.email} ya está registrado por otro usuario`,
        );
      }
    }

    // 2026-10-16 — phone uniqueness pre-check (migration 0036).
    // Same pattern as the email check above. `dto.phone !== target.phone`
    // short-circuits the read when the caller sends the same value
    // (or omits phone entirely); the `null` branch is also handled
    // by `target.phone` being null/nullable.
    if (dto.phone !== undefined && dto.phone !== null && dto.phone !== target.phone) {
      const phoneConflict = await this.userRepo.findOne({
        where: { phone: dto.phone, deletedAt: IsNull() },
      });
      if (phoneConflict && phoneConflict.id !== target.id) {
        throw new ConflictException(
          `El teléfono ${dto.phone} ya está registrado por otro usuario`,
        );
      }
    }

    // 2026-10-10-user-onboarding-telegram-tour (D1) — when the role
    // is changed, re-derive the role policy outcome. We re-resolve
    // the target role name (from the DTO if set, otherwise from the
    // existing user) and apply the same global/sectional rule as
    // adminCreate.
    if (dto.role_id !== undefined) {
      const role = await this.roleRepo.findOne({ where: { id: dto.role_id } });
      if (!role) {
        throw new NotFoundException(`Role ${dto.role_id} not found`);
      }
      target.roleId = role.id;
      target.permissions = role.permissions ?? [];
      target.permissionVersion = (target.permissionVersion ?? 1) + 1;

      // If the new role is global, clear org + dept regardless of
      // what the DTO says (defense-in-depth — the form may send
      // stale values).
      if (ROLES_NOT_REQUIRING_ORG.includes(role.name)) {
        target.organizationId = null;
        target.departmentId = null;
      }
    }

    if (dto.organization_id !== undefined) {
      target.organizationId = dto.organization_id;
    }
    if (dto.department_id !== undefined) {
      // Cross-row invariant: dept must belong to the org the user
      // is in. If the user has no org, dept must be null.
      if (dto.department_id === null) {
        target.departmentId = null;
      } else {
        const dept = await this.dataSource.query<
          Array<{ organization_id: string; deleted_at: Date | null }>
        >(
          `SELECT organization_id, deleted_at FROM departments
            WHERE id = $1`,
          [dto.department_id],
        );
        if (dept.length === 0) {
          throw new BadRequestException(
            `Department ${dto.department_id} does not exist`,
          );
        }
        if (dept[0].deleted_at !== null) {
          throw new BadRequestException(
            `Department ${dto.department_id} is soft-deleted`,
          );
        }
        const targetOrg = target.organizationId;
        if (!targetOrg || dept[0].organization_id !== targetOrg) {
          throw new BadRequestException(
            `Department ${dto.department_id} does not belong to user's organization ${targetOrg ?? '<none>'}`,
          );
        }
        target.departmentId = dto.department_id;
      }
    }
    if (dto.first_name !== undefined) {
      target.firstName = dto.first_name;
    }
    if (dto.last_name !== undefined) {
      target.lastName = dto.last_name;
    }
    // F6 fix: `email` y `phone` ahora son actualizables por admin
    // (master u agent_system con `UPDATE users` permission).
    // Antes el DTO los rechazaba y el form del frontend no podía
    // ni mostrarlos en la UI. Ver `AdminUpdateUserDto` para los
    // validadores (formato email, formato phone Ecuador).
    if (dto.email !== undefined) {
      target.email = dto.email;
    }
    if (dto.phone !== undefined) {
      target.phone = dto.phone;
    }
    // 2026-10-15-user-status-notif-channel — Master-only field
    // application. Spec S1 escenario "Non-master sends is_active
    // field (field ignored)": a non-master caller with a leaked
    // permission scope can't disable accounts. The DTO declares the
    // field, so the validation pipe does not 400 — we drop it here.
    if (dto.is_active !== undefined && callerRole === 'master') {
      target.isActive = dto.is_active;
    }
    if (dto.preferred_notification_channel !== undefined) {
      target.preferredNotificationChannel = dto.preferred_notification_channel;
    }
    const saved = await this.userRepo.save(target);
    await this.authService.invalidatePermissionCache(saved.id, saved.deviceUuid);
    // 2026-10-16 — AUD (sc-327) — UPDATE_USER. We audit every
    // successful update, including the no-op case (D5 — "ensure
    // UPDATE_USER is emitted even when the diff is empty"). The
    // `metadata` column carries the touched field names so the
    // audit-logs UI can highlight which fields changed.
    await this.auditService.record({
      actorId: callerId,
      action: 'UPDATE_USER',
      resourceType: 'users',
      resourceId: saved.id,
      metadata: this.collectUpdateFields(dto),
    });
    return saved;
  }

  /**
   * T5.6 — `DELETE /api/users/:id`. Soft delete by setting
   * `is_active = false` and clearing session keys. We do NOT use
   * TypeORM's `@DeleteDateColumn` because the `users` table has no
   * `deleted_at` column (no migration added it; soft-delete in this
   * project is modeled as `is_active = false` for consistency with
   * the existing 0001 schema).
   */
  /**
   * T6.8.B2 — GDPR-compliant soft delete with PII wipe.
   * Sets `deletedAt`, `isActive=false`, and overwrites all PII fields so the
   * row cannot be used to identify the person. The `email` is replaced with a
   * deterministic tombstone (`deleted+{id}@tase.invalid`) so the UNIQUE
   * constraint still holds after deletion.
   */
  async softDelete(id: string, actorId: string): Promise<void> {
    const target = await this.findById(id);
    await this.userRepo.update(id, {
      deletedAt: new Date(),
      isActive: false,
      firstName: 'Usuario eliminado',
      lastName: null,
      email: `deleted+${id}@tase.invalid`,
      avatarUrl: null,
      passwordHash: null,
      deviceUuid: null,
      verificationOtp: null,
      verificationOtpExpiresAt: null,
      phone: null,
    });
    await this.authService.invalidatePermissionCache(target.id, target.deviceUuid);
    // 2026-10-16 — AUD (sc-327) — DELETE_USER. Emitted AFTER the
    // `update` because we want the audit row to reflect the
    // post-soft-delete state of the target (the email is already
    // tombstoned, `is_active=false`, etc.). Emitted for master /
    // admin_org callers only — the controller gates the route
    // with `@RequirePermission('DELETE')` so the row never exists
    // for an unauthorized actor.
    await this.auditService.record({
      actorId,
      action: 'DELETE_USER',
      resourceType: 'users',
      resourceId: id,
    });
  }

  /**
   * 2026-10-16 — returns the list of DTO keys the caller actually
   * provided (not `undefined`). Used to populate
   * `audit_events.metadata.touched_fields` on `UPDATE_USER`. Snake-
   * case DTO field names → camelCase metadata keys so the audit-
   * logs UI matches the column headers.
   */
  private collectUpdateFields(dto: AdminUpdateUserDto): Record<string, unknown> {
    const FIELDS: Array<[string, keyof AdminUpdateUserDto]> = [
      ['email', 'email'],
      ['first_name', 'first_name'],
      ['last_name', 'last_name'],
      ['phone', 'phone'],
      ['role_id', 'role_id'],
      ['organization_id', 'organization_id'],
      ['department_id', 'department_id'],
      ['is_active', 'is_active'],
      ['preferred_notification_channel', 'preferred_notification_channel'],
    ];
    const touched: Record<string, unknown> = {};
    for (const [wire, dtoKey] of FIELDS) {
      const v = dto[dtoKey];
      if (v !== undefined) touched[wire] = v;
    }
    return touched;
  }

  // 2026-10-16 — admin-side Telegram link regeneration (POST
  // /users/:id/telegram-link). Same visibility + rank pattern as
  // updateOrganization: `@RequirePermission('UPDATE','users')` on the
  // route gates capability, `assertCanManage` enforces scope/rank here.
  // 404 on missing user, 404 on out-of-scope (assertCanManage — the
  // D9 pattern), 403 on rank-mismatch. Reporters are explicitly
  // rejected with 403 — D7 isolation: the staff bot is for backoffice,
  // not citizen-facing.
  async adminGenerateTelegramLink(
    actor: AuthContext,
    targetId: string,
  ): Promise<{ telegram_link: string | null }> {
    const target = await this.userRepo.findOne({ where: { id: targetId } });
    if (!target) {
      throw new NotFoundException(`User ${targetId} not found`);
    }

    const role = target.roleId
      ? await this.roleRepo.findOne({ where: { id: target.roleId } })
      : null;

    // 404 if out of scope, 403 if actor doesn't outrank target.
    // assertCanManage throws; we don't catch.
    assertCanManage(actor, {
      id: target.id,
      organizationId: target.organizationId,
      roleName: role?.name ?? null,
    });

    if (role?.name === 'reporter') {
      throw new ForbiddenException(
        'Los reporteros no pueden vincularse al bot de Telegram de gestión interna.',
      );
    }

    const token = await this.telegramLinkService.issueFor(target.id);
    // composeDeepLink returns null when TELEGRAM_BOT_USERNAME is
    // unset (no-op env in dev / pre-deploy). We surface that as
    // `telegram_link: null` — the frontend reads it and shows the
    // "Bot de Telegram no configurado" message.
    const telegram_link = this.telegramLinkService.composeDeepLink(token);
    return { telegram_link };
  }
}
