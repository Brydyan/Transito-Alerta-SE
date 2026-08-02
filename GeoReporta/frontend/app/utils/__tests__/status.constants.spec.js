import { describe, it, expect } from 'vitest';
import STATUS_LABEL from '../status.constants.js';

describe('status.constants.js (codegen determinism)', () => {
  it('is a non-empty exported object', () => {
    expect(STATUS_LABEL).toBeInstanceOf(Object);
    expect(Object.keys(STATUS_LABEL).length).toBeGreaterThan(0);
  });

  it('contains the canonical incident status keys', () => {
    expect(STATUS_LABEL).toHaveProperty('pending');
    expect(STATUS_LABEL).toHaveProperty('in_progress');
    expect(STATUS_LABEL).toHaveProperty('resolved');
  });

  it('maps each status to a Spanish display label', () => {
    expect(STATUS_LABEL.pending).toBe('Pendiente');
    expect(STATUS_LABEL.in_progress).toBe('En proceso');
    expect(STATUS_LABEL.resolved).toBe('Resuelto');
  });

  it('is frozen (immutable) to prevent accidental mutation', () => {
    expect(Object.isFrozen(STATUS_LABEL)).toBe(true);
  });
});
