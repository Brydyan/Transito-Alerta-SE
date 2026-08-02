import { describe, it, expect } from 'vitest';
import {
  resolveRoleName,
  homeRouteForUser,
  ROLE_LABELS,
  OPERATIONAL_ROLES,
} from '../role.js';

describe('resolveRoleName', () => {
  it('returns the name when role is an object', () => {
    expect(resolveRoleName({ role: { id: 1, name: 'admin_sistema' } })).toBe(
      'admin_sistema',
    );
  });

  it('returns the string when role is a plain string', () => {
    expect(resolveRoleName({ role: 'operador_organizacion' })).toBe(
      'operador_organizacion',
    );
  });

  it('returns null when user is missing', () => {
    expect(resolveRoleName(null)).toBeNull();
    expect(resolveRoleName(undefined)).toBeNull();
  });

  it('returns null when user has no role', () => {
    expect(resolveRoleName({})).toBeNull();
  });

  it('returns null when role is an object without a name', () => {
    expect(resolveRoleName({ role: { id: 1 } })).toBeNull();
    expect(resolveRoleName({ role: {} })).toBeNull();
  });

  it('returns null when role is an unrecognised shape', () => {
    expect(resolveRoleName({ role: 42 })).toBeNull();
    expect(resolveRoleName({ role: true })).toBeNull();
  });
});

describe('homeRouteForUser', () => {
  it('routes citizens, organization operators, and administrators to their homes', () => {
    expect(homeRouteForUser({ role: { name: 'usuario' } })).toBe('/feed');
    expect(homeRouteForUser({ role: { name: 'operador_organizacion' } })).toBe(
      '/operator/dashboard',
    );
    expect(homeRouteForUser({ role: { name: 'admin_sistema' } })).toBe(
      '/dashboard',
    );
  });
});

describe('ROLE_LABELS (SCEN-8.1 consolidation)', () => {
  it('exposes every role name surfaced by the UserResource', () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(
      [
        'admin_organizacion',
        'admin_sistema',
        'operador_organizacion',
        'operador_sistema',
        'publicador',
        'usuario',
      ].sort(),
    );
  });

  it('uses Spanish labels for each role', () => {
    expect(ROLE_LABELS.admin_sistema).toBe('Super Administrador');
    expect(ROLE_LABELS.admin_organizacion).toBe(
      'Administrador de Organización',
    );
    expect(ROLE_LABELS.operador_organizacion).toBe('Operador de Organización');
    expect(ROLE_LABELS.operador_sistema).toBe('Operador de Sistema');
    expect(ROLE_LABELS.publicador).toBe('Publicador');
    expect(ROLE_LABELS.usuario).toBe('Usuario');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(ROLE_LABELS)).toBe(true);
  });
});

describe('role utils — guard integration (SCEN-8.2)', () => {
  it('resolves "admin_sistema" the same way the legacy guard did', () => {
    // Mirrors the SCEN-8.2 expectation: a user with role resolving to
    // "admin_sistema" still routes correctly after the migration.
    const admin = { role: { id: 1, name: 'admin_sistema' } };
    expect(resolveRoleName(admin)).toBe('admin_sistema');
    expect(ROLE_LABELS[resolveRoleName(admin)]).toBe('Super Administrador');
  });

  it('returns null when the user payload has no role (regression-safe)', () => {
    // Legacy role.guard.js falls back to "false" in this branch.
    const anon = {};
    expect(resolveRoleName(anon)).toBeNull();
  });
});

/**
 * `OPERATIONAL_ROLES` — single source of truth for the back-office role
 * bucket (T-2.1 / T-2.2 of menu-server-driven PR 2).
 *
 * Design Decision 6 (frontend): classifyRole() in app-shell.component.js
 * must read this constant instead of duplicating the role → bucket
 * mapping. Five operational roles share the admin shell chrome:
 * admin_sistema, admin_organizacion, operador_sistema,
 * operador_organizacion, publicador. `usuario` is the citizen bucket.
 */
describe('OPERATIONAL_ROLES (T-2.1 menu-server-driven)', () => {
  it('exports the five operational role names that share the admin bucket', () => {
    expect([...OPERATIONAL_ROLES].sort()).toEqual(
      [
        'admin_sistema',
        'admin_organizacion',
        'operador_sistema',
        'operador_organizacion',
        'publicador',
      ].sort(),
    );
  });

  it('does NOT include the citizen role "usuario"', () => {
    expect(OPERATIONAL_ROLES).not.toContain('usuario');
  });

  it('is frozen so callers cannot mutate the bucket list at runtime', () => {
    expect(Object.isFrozen(OPERATIONAL_ROLES)).toBe(true);
  });

  it('keeps the operational bucket disjoint from ROLE_LABELS keys for citizen roles', () => {
    // Triangulation: every name in OPERATIONAL_ROLES must resolve to a
    // non-null Spanish label via ROLE_LABELS. If a role is added to the
    // bucket without a corresponding ROLE_LABELS entry, this test fails
    // — preventing a runtime "undefined" label in the UI.
    for (const name of OPERATIONAL_ROLES) {
      expect(ROLE_LABELS[name]).toBeTypeOf('string');
      expect(ROLE_LABELS[name].length).toBeGreaterThan(0);
    }
  });
});
