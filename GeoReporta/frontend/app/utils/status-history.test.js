import { describe, expect, it } from 'vitest';
import { sortStatusHistoryDesc, statusHistoryEntry } from './status-history.js';

const items = [
  {
    previous_status: 'pending',
    new_status: 'in_progress',
    created_at: '2026-07-01T10:00:00Z',
    user: { first_name: 'Ana', last_name: 'Pérez' },
  },
  {
    previous_status: 'in_progress',
    new_status: 'resolved',
    created_at: '2026-07-02T10:00:00Z',
    user: null,
  },
];

describe('sortStatusHistoryDesc', () => {
  it('sorts most recent first without mutating the input', () => {
    const sorted = sortStatusHistoryDesc(items);

    expect(sorted[0].new_status).toBe('resolved');
    expect(items[0].new_status).toBe('in_progress');
  });
});

describe('statusHistoryEntry', () => {
  it('maps statuses to labels and joins the user name', () => {
    const entry = statusHistoryEntry(items[0]);

    expect(entry.prev).toBe('Pendiente');
    expect(entry.next).toBe('En proceso');
    expect(entry.userName).toBe('Ana Pérez');
  });

  it('falls back to Sistema without user and to the raw status without label', () => {
    const entry = statusHistoryEntry({
      previous_status: null,
      new_status: 'weird_status',
      user: null,
    });

    expect(entry.prev).toBe('—');
    expect(entry.next).toBe('weird_status');
    expect(entry.userName).toBe('Sistema');
  });
});
