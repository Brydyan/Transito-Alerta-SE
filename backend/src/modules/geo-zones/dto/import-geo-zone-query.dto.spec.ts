import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ImportGeoZoneQueryDto } from './import-geo-zone-query.dto';

describe('ImportGeoZoneQueryDto', () => {
  async function validateDto(plain: Record<string, unknown>) {
    const dto = plainToInstance(ImportGeoZoneQueryDto, plain);
    return validate(dto);
  }

  describe('level (required)', () => {
    it('accepts all four valid levels', async () => {
      for (const level of ['provincia', 'canton', 'parroquia', 'zona']) {
        const errors = await validateDto({ level });
        expect(errors).toHaveLength(0);
      }
    });

    it('rejects an unknown level string', async () => {
      const errors = await validateDto({ level: 'municipio' });
      const levelErrors = errors.find((e) => e.property === 'level');
      expect(levelErrors).toBeDefined();
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects missing level', async () => {
      const errors = await validateDto({});
      const levelErrors = errors.find((e) => e.property === 'level');
      expect(levelErrors).toBeDefined();
    });
  });

  describe('auto_parent (optional boolean)', () => {
    it('accepts auto_parent="true" and transforms to boolean true', async () => {
      const dto = plainToInstance(ImportGeoZoneQueryDto, { level: 'canton', auto_parent: 'true' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.auto_parent).toBe(true);
    });

    it('accepts auto_parent="false" and transforms to boolean false', async () => {
      const dto = plainToInstance(ImportGeoZoneQueryDto, { level: 'canton', auto_parent: 'false' });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.auto_parent).toBe(false);
    });

    it('is optional — omitting it produces no error', async () => {
      const errors = await validateDto({ level: 'canton' });
      const apErrors = errors.find((e) => e.property === 'auto_parent');
      expect(apErrors).toBeUndefined();
    });
  });

  describe('name_column and code_column (optional strings)', () => {
    it('accepts name_column and code_column strings', async () => {
      const errors = await validateDto({
        level: 'parroquia',
        name_column: 'NOMBRE',
        code_column: 'CODIGO',
      });
      expect(errors).toHaveLength(0);
    });

    it('is optional — omitting both produces no error', async () => {
      const errors = await validateDto({ level: 'zona' });
      expect(errors).toHaveLength(0);
    });
  });
});
