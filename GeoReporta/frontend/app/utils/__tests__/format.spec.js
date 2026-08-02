import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  escapeHtml,
  timeAgo,
  STATUS_LABEL,
  PRIORITY_LABEL,
} from '../format.js';

describe('escapeHtml', () => {
  it('returns empty string for falsy input', () => {
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(0)).toBe('');
  });

  it('escapes ampersand, less-than, greater-than', () => {
    expect(escapeHtml('a & b')).toContain('&amp;');
    expect(escapeHtml('<script>')).toContain('&lt;script&gt;');
  });

  it('does not pass raw script tags through', () => {
    // The legacy implementation escapes only <, >, & via innerHTML.
    // We lock that behaviour: tags become text and cannot execute.
    expect(escapeHtml('<script>alert(1)</script>')).toContain('&lt;');
    expect(escapeHtml('<script>alert(1)</script>')).not.toContain('<script>');
  });

  it('passes plain text through verbatim', () => {
    expect(escapeHtml('Hola mundo')).toBe('Hola mundo');
  });
});

describe('timeAgo', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string for falsy input', () => {
    expect(timeAgo('')).toBe('');
    expect(timeAgo(null)).toBe('');
    expect(timeAgo(undefined)).toBe('');
  });

  it('returns "justo ahora" for under a minute', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:30Z'));
    expect(timeAgo('2026-01-15T12:00:00Z')).toBe('justo ahora');
  });

  it('returns "hace Xmin" for under an hour', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:05:00Z'));
    expect(timeAgo('2026-01-15T12:00:00Z')).toBe('hace 5min');
  });

  it('returns "hace Xh" for under a day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T15:00:00Z'));
    expect(timeAgo('2026-01-15T12:00:00Z')).toBe('hace 3h');
  });

  it('returns "hace Xd" for under a week', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-18T12:00:00Z'));
    expect(timeAgo('2026-01-15T12:00:00Z')).toBe('hace 3d');
  });
});

describe('STATUS_LABEL (SCEN-1.1 consolidation)', () => {
  it('exposes the expected status keys', () => {
    expect(Object.keys(STATUS_LABEL).sort()).toEqual(
      ['closed', 'in_progress', 'pending', 'resolved'].sort(),
    );
  });

  it('uses Spanish labels for each status', () => {
    expect(STATUS_LABEL.pending).toBe('Pendiente');
    expect(STATUS_LABEL.in_progress).toBe('En proceso');
    expect(STATUS_LABEL.resolved).toBe('Resuelto');
    expect(STATUS_LABEL.closed).toBe('Cerrada');
  });

  it('is frozen so accidental mutation throws in strict mode', () => {
    expect(Object.isFrozen(STATUS_LABEL)).toBe(true);
    expect(() => {
      'use strict';
      STATUS_LABEL.pending = 'Otro';
    }).toThrow();
  });
});

describe('PRIORITY_LABEL', () => {
  it('exposes the expected priority keys', () => {
    expect(Object.keys(PRIORITY_LABEL).sort()).toEqual(
      ['high', 'low', 'medium'].sort(),
    );
  });

  it('uses Spanish labels for each priority', () => {
    expect(PRIORITY_LABEL.high).toBe('Alta');
    expect(PRIORITY_LABEL.medium).toBe('Media');
    expect(PRIORITY_LABEL.low).toBe('Baja');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(PRIORITY_LABEL)).toBe(true);
  });
});

describe('getCommentImageUrl', () => {
  it('returns empty string for empty input', () => {
    const { getCommentImageUrl } = require('../format.js');
    expect(getCommentImageUrl('')).toBe('');
    expect(getCommentImageUrl(null)).toBe('');
  });

  it('normalizes relative storage paths to /storage/...', () => {
    const { getCommentImageUrl } = require('../format.js');
    expect(getCommentImageUrl('comments/123.jpg')).toBe(
      '/storage/comments/123.jpg',
    );
    expect(getCommentImageUrl('storage/comments/123.jpg')).toBe(
      '/storage/comments/123.jpg',
    );
    expect(getCommentImageUrl('/storage/comments/123.jpg')).toBe(
      '/storage/comments/123.jpg',
    );
  });

  it('preserves absolute URLs verbatim', () => {
    const { getCommentImageUrl } = require('../format.js');
    expect(getCommentImageUrl('http://example.com/img.jpg')).toBe(
      'http://example.com/img.jpg',
    );
    expect(getCommentImageUrl('https://example.com/img.jpg')).toBe(
      'https://example.com/img.jpg',
    );
  });
});
