import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AdminCreateUserDto } from './admin-create-user.dto';

/**
 * F6 / 2026-09-08-f6-new-user-form — D1: `AdminCreateUserDto` accepts
 * `phone?: string` (optional, `@MaxLength(30)`). The column already
 * exists in `users.phone` (migration 0035), so this only widens the
 * DTO contract. No format validation: the frontend enforces the
 * `+593…` / `09…` Ecuador pattern; the backend keeps the contract
 * lax to mirror `updateProfile` (T3.9) which already does the same.
 */
describe('AdminCreateUserDto (F6 D1 — phone field)', () => {
  async function validateDto(payload: Record<string, unknown>) {
    const dto = plainToInstance(AdminCreateUserDto, payload);
    const errors = await validate(dto);
    return errors;
  }

  it('accepts a valid phone (<= 30 chars)', async () => {
    const errors = await validateDto({
      email: 'juan@municipio.ec',
      phone: '+593 99 999 9999',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects phone longer than 30 characters with a MaxLength error', async () => {
    const errors = await validateDto({
      email: 'juan@municipio.ec',
      phone: 'x'.repeat(31),
    });
    expect(errors.length).toBeGreaterThan(0);
    const phoneError = errors.find((e) => e.property === 'phone');
    expect(phoneError).toBeDefined();
    expect(phoneError!.constraints).toHaveProperty('maxLength');
    expect(phoneError!.constraints!.maxLength).toMatch(/30/);
  });

  it('accepts the payload when phone is absent (backward compat with T5.6)', async () => {
    const errors = await validateDto({ email: 'juan@municipio.ec' });
    expect(errors).toHaveLength(0);
  });

  it('accepts a phone with non-numeric chars (no format validation on the backend)', async () => {
    const errors = await validateDto({
      email: 'juan@municipio.ec',
      phone: 'abc-123',
    });
    expect(errors).toHaveLength(0);
  });
});
