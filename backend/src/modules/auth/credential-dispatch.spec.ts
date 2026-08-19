import { BadRequestException } from '@nestjs/common';

import { resolveCredential } from './credential-dispatch';
import { LoginDto } from './dto/login.dto';

function dto(partial: Partial<LoginDto>): LoginDto {
  return Object.assign(new LoginDto(), partial);
}

describe('resolveCredential (T3.6 design D1/D2, pure, table-driven)', () => {
  it('device_uuid alone resolves to kind:device', () => {
    const result = resolveCredential(dto({ device_uuid: 'device-123' }));
    expect(result).toEqual({ kind: 'device', deviceUuid: 'device-123' });
  });

  it('email+password alone resolves to kind:password with deviceUuid null', () => {
    const result = resolveCredential(dto({ email: 'a@b.com', password: 'secret1234567' }));
    expect(result).toEqual({
      kind: 'password',
      email: 'a@b.com',
      password: 'secret1234567',
      deviceUuid: null,
    });
  });

  it('email+password+device_uuid: device_uuid becomes a session label, not identity', () => {
    const result = resolveCredential(
      dto({ email: 'a@b.com', password: 'secret1234567' }),
    );
    expect(result.kind).toBe('password');
  });

  it('throws 400 INVALID_CREDENTIAL_SHAPE with neither present', () => {
    expect(() => resolveCredential(dto({}))).toThrow(BadRequestException);
    try {
      resolveCredential(dto({}));
    } catch (e) {
      expect((e as BadRequestException).getResponse()).toMatchObject({
        code: 'INVALID_CREDENTIAL_SHAPE',
      });
    }
  });

  it('throws 400 INVALID_CREDENTIAL_SHAPE when device_uuid AND email/password both present', () => {
    expect(() =>
      resolveCredential(dto({ device_uuid: 'device-123', email: 'a@b.com', password: 'x' })),
    ).toThrow(BadRequestException);
  });

  it('throws 400 INVALID_CREDENTIAL_SHAPE with only email (no password)', () => {
    expect(() => resolveCredential(dto({ email: 'a@b.com' }))).toThrow(BadRequestException);
  });

  it('throws 400 INVALID_CREDENTIAL_SHAPE with only password (no email)', () => {
    expect(() => resolveCredential(dto({ password: 'secret1234567' }))).toThrow(BadRequestException);
  });
});
