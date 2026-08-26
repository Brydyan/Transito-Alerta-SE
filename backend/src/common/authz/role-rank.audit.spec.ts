import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';

import { RoleEntity } from '../../entities/role.entity';
import { RoleRankAudit } from './role-rank.audit';

describe('RoleRankAudit', () => {
  it('logs an error naming any role missing from ROLE_RANK', async () => {
    const roleRepo = {
      find: jest.fn().mockResolvedValue([
        { name: 'master' },
        { name: 'a_future_role' },
      ]),
    };
    const audit = new RoleRankAudit(roleRepo as unknown as Repository<RoleEntity>);
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await audit.onApplicationBootstrap();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('a_future_role'));
    errorSpy.mockRestore();
  });

  it('does not log when every seeded role is known', async () => {
    const roleRepo = {
      find: jest.fn().mockResolvedValue([{ name: 'master' }, { name: 'reporter' }]),
    };
    const audit = new RoleRankAudit(roleRepo as unknown as Repository<RoleEntity>);
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await audit.onApplicationBootstrap();

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
