import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { LoginDto } from './login.dto';

async function errorsFor(body: Record<string, unknown>) {
  const dto = plainToInstance(LoginDto, body);
  return validate(dto);
}

describe('LoginDto (T3.6 design D2 — class-validator cross-field shape check)', () => {
  it('device_uuid alone is valid (122 pre-existing e2e tests send exactly this shape)', async () => {
    const errors = await errorsFor({ device_uuid: 'device-123' });
    expect(errors).toHaveLength(0);
  });

  it('email+password alone is valid', async () => {
    const errors = await errorsFor({ email: 'a@b.com', password: 'secret1234567' });
    expect(errors).toHaveLength(0);
  });

  it('neither present is invalid', async () => {
    const errors = await errorsFor({});
    expect(errors.length).toBeGreaterThan(0);
  });

  it('both device_uuid and email/password present is invalid', async () => {
    const errors = await errorsFor({
      device_uuid: 'device-123',
      email: 'a@b.com',
      password: 'secret1234567',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('email alone (no password) is invalid', async () => {
    const errors = await errorsFor({ email: 'a@b.com' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
