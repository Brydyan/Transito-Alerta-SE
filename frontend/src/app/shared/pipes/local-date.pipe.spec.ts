import { LocalDatePipe } from './local-date.pipe';

describe('LocalDatePipe', () => {
  let pipe: LocalDatePipe;

  beforeEach(() => {
    pipe = new LocalDatePipe();
  });

  it('should be created', () => {
    expect(pipe).toBeTruthy();
  });

  describe('null / undefined / empty inputs', () => {
    it('should return empty string for null', () => {
      expect(pipe.transform(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(pipe.transform(undefined)).toBe('');
    });

    it('should return empty string for empty string', () => {
      expect(pipe.transform('')).toBe('');
    });
  });

  describe('YYYY-MM-DD parsing (the whole point of this pipe)', () => {
    it('should parse YYYY-MM-DD as LOCAL date components (not UTC)', () => {
      // Without TZ awareness, new Date('2026-08-20') would be UTC midnight,
      // which in negative-UTC-offset zones (e.g. Argentina UTC-3) shows as
      // 19/08/2026 21:00. The pipe must avoid that by using local components.
      const result = pipe.transform('2026-08-20', 'dd/MM/yyyy');
      expect(result).toBe('20/08/2026');
    });

    it('should format with custom tokens', () => {
      expect(pipe.transform('2026-08-20', 'yyyy-MM-dd')).toBe('2026-08-20');
    });

    it('should return empty string for malformed date-only string', () => {
      expect(pipe.transform('2026-8-20', 'dd/MM/yyyy')).toBe('');
      expect(pipe.transform('not-a-date', 'dd/MM/yyyy')).toBe('');
    });
  });

  describe('ISO string with time', () => {
    it('should parse ISO with Z timezone', () => {
      // 2026-08-20T15:30:00.000Z — UTC 15:30. In UTC-3 the local time is 12:30.
      // The pipe formats using local components of the parsed Date.
      const result = pipe.transform('2026-08-20T15:30:00.000Z', 'dd/MM/yyyy');
      expect(result).toBe('20/08/2026');
    });

    it('should format time when included in the format string', () => {
      const result = pipe.transform('2026-08-20T15:30:00.000Z', 'dd/MM/yyyy HH:mm');
      // The hour depends on the runner's TZ (UTC=15, UTC-3=12, UTC-5=10).
      // The contract: the formatted minute is always 30 and the date is
      // always 20/08/2026 (no day shift regardless of TZ offset).
      expect(result).toMatch(/^20\/08\/2026 \d{2}:30$/);
      expect(result.endsWith(':30')).toBe(true);
    });
  });

  describe('Date object input', () => {
    it('should format Date objects using local components', () => {
      // Constructing a Date with year/month/day uses local components.
      const date = new Date(2026, 7, 20); // August 20, 2026 (month is 0-indexed)
      expect(pipe.transform(date, 'dd/MM/yyyy')).toBe('20/08/2026');
    });

    it('should return empty string for invalid Date object', () => {
      const invalid = new Date('invalid');
      expect(pipe.transform(invalid, 'dd/MM/yyyy')).toBe('');
    });
  });

  describe('default format', () => {
    it('should default to dd/MM/yyyy when no format provided', () => {
      expect(pipe.transform('2026-08-20')).toBe('20/08/2026');
    });
  });

  describe('zero-padding', () => {
    it('should zero-pad single-digit day and month', () => {
      expect(pipe.transform('2026-01-05')).toBe('05/01/2026');
    });
  });
});
