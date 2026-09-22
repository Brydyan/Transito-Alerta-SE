import { CardField } from '../data-card/data-card.component';
import {
  INCIDENTS_CARD_FIELDS,
  USERS_CARD_FIELDS,
  ROLES_CARD_FIELDS,
  ORGANIZATIONS_CARD_FIELDS,
  CATEGORIES_CARD_FIELDS,
} from './card-fields';

/**
 * T-05 — RED: Failing tests for cardFields config contracts.
 *
 * S2.2: each table has exactly 3 fields.
 * S9.1–S9.5: field keys must match the corresponding model properties.
 * D3: CardField = {key, label, format?}.
 */
describe('cardFields configs (D3)', () => {
  it('INCIDENTS_CARD_FIELDS has exactly 3 entries', () => {
    expect(INCIDENTS_CARD_FIELDS).toHaveLength(3);
  });

  it('INCIDENTS fields: title (plain), status (badge), priority (priority-badge)', () => {
    const keys = INCIDENTS_CARD_FIELDS.map((f) => f.key);
    expect(keys).toEqual(['title', 'status', 'priority']);

    expect(INCIDENTS_CARD_FIELDS[0].format).toBeFalsy();
    expect(INCIDENTS_CARD_FIELDS[1].format).toBe('badge');
    expect(INCIDENTS_CARD_FIELDS[2].format).toBe('priority-badge');
  });

  it('USERS_CARD_FIELDS has exactly 3 entries', () => {
    expect(USERS_CARD_FIELDS).toHaveLength(3);
  });

  it('USERS fields: nombre, email, rol (S9.2)', () => {
    const keys = USERS_CARD_FIELDS.map((f) => f.key);
    expect(keys).toEqual(['nombre', 'email', 'rol']);
  });

  it('ROLES_CARD_FIELDS has exactly 3 entries', () => {
    expect(ROLES_CARD_FIELDS).toHaveLength(3);
  });

  it('ROLES fields: nombre, permisos count, usuarios count (S9.3)', () => {
    const keys = ROLES_CARD_FIELDS.map((f) => f.key);
    expect(keys).toEqual(['nombre', 'permisosCount', 'usuariosCount']);
  });

  it('ORGANIZATIONS_CARD_FIELDS has exactly 3 entries', () => {
    expect(ORGANIZATIONS_CARD_FIELDS).toHaveLength(3);
  });

  it('ORGANIZATIONS fields: nombre, zona, usuarios count (S9.4)', () => {
    const keys = ORGANIZATIONS_CARD_FIELDS.map((f) => f.key);
    expect(keys).toEqual(['nombre', 'zona', 'usuariosCount']);
  });

  it('CATEGORIES_CARD_FIELDS has exactly 3 entries', () => {
    expect(CATEGORIES_CARD_FIELDS).toHaveLength(3);
  });

  it('CATEGORIES fields: nombre, descripcion, icon (S9.5)', () => {
    const keys = CATEGORIES_CARD_FIELDS.map((f) => f.key);
    expect(keys).toEqual(['nombre', 'descripcion', 'icon']);
  });

  it('all configs are CardField arrays with valid shape', () => {
    const allConfigs = [
      INCIDENTS_CARD_FIELDS,
      USERS_CARD_FIELDS,
      ROLES_CARD_FIELDS,
      ORGANIZATIONS_CARD_FIELDS,
      CATEGORIES_CARD_FIELDS,
    ];

    for (const config of allConfigs) {
      for (const field of config) {
        expect(typeof field.key).toBe('string');
        expect(field.key.length).toBeGreaterThan(0);
        expect(typeof field.label).toBe('string');
        expect(field.label.length).toBeGreaterThan(0);
        // format is optional but if present must be valid
        if (field.format !== undefined && field.format !== null) {
          expect(['badge', 'priority-badge']).toContain(field.format);
        }
      }
    }
  });
});
