import { describe, expect, it } from 'vitest';
import { badgeEstado, badgePrioridad, formatearFecha } from './format.js';

describe('badgePrioridad', () => {
  it('renders the label with its color and falls back to secondary', () => {
    expect(badgePrioridad('high')).toContain('bg-danger');
    expect(badgePrioridad('high')).toContain('Alta');
    expect(badgePrioridad('unknown')).toContain('bg-secondary');
    expect(badgePrioridad('unknown')).toContain('—');
  });
});

describe('badgeEstado', () => {
  it('renders the status label with its color', () => {
    expect(badgeEstado('in_progress')).toContain('bg-primary');
    expect(badgeEstado('in_progress')).toContain('En proceso');
    expect(badgeEstado('raro')).toContain('bg-secondary');
    expect(badgeEstado('raro')).toContain('raro');
  });
});

describe('formatearFecha', () => {
  it('formats an ISO date and dashes out falsy input', () => {
    expect(formatearFecha('2026-07-15T12:00:00Z')).toMatch(
      /\d{2}\/\d{2}\/\d{4}/,
    );
    expect(formatearFecha(null)).toBe('—');
  });
});
