import { formatPermissionString, inferResourceFromPath } from './require-permission.decorator';

describe('formatPermissionString (pure function)', () => {
  it('formats an action+resource pair as the canonical "ACTION resource" string', () => {
    expect(formatPermissionString('READ', 'incidents')).toBe('READ incidents');
  });

  it('produces a DIFFERENT string for a different action (triangulation)', () => {
    expect(formatPermissionString('DELETE', 'incidents')).toBe('DELETE incidents');
  });
});

describe('inferResourceFromPath (pure function)', () => {
  it('extracts the resource segment immediately after /api/', () => {
    expect(inferResourceFromPath('/api/incidents/123')).toBe('incidents');
  });

  it('extracts a DIFFERENT resource for a different route (triangulation)', () => {
    expect(inferResourceFromPath('/api/assignments')).toBe('assignments');
  });

  it('returns an empty string when the path has no segment after /api/', () => {
    expect(inferResourceFromPath('/api/')).toBe('');
  });
});
