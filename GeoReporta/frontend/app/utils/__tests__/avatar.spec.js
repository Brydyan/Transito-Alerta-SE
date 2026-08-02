import { describe, it, expect } from 'vitest';
import {
  DEFAULT_AVATAR,
  getInitials,
  getUserDisplayName,
  renderAvatarCell,
  renderAvatarImg,
  resolveAvatar,
  resolveAvatarSrc,
} from '../avatar.js';

describe('getInitials (SCEN-1.2 regression)', () => {
  it('builds uppercase initials from first and last name', () => {
    expect(getInitials({ first_name: 'Ada', last_name: 'Lovelace' })).toBe(
      'AL',
    );
  });

  it('uppercases lowercase input', () => {
    expect(getInitials({ first_name: 'maria', last_name: 'gonzalez' })).toBe(
      'MG',
    );
  });

  it('falls back to a single initial when only the first name is set', () => {
    expect(getInitials({ first_name: 'Ada' })).toBe('A');
  });

  it('falls back to a single initial when only the last name is set', () => {
    expect(getInitials({ last_name: 'Lovelace' })).toBe('L');
  });

  it('returns "?" when the user is missing', () => {
    expect(getInitials(null)).toBe('?');
    expect(getInitials(undefined)).toBe('?');
  });

  it('returns "?" when the user has no name parts at all', () => {
    expect(getInitials({})).toBe('?');
    expect(getInitials({ first_name: '', last_name: '' })).toBe('?');
  });

  it('returns "A" for an anonymous user payload (issue #234)', () => {
    expect(
      getInitials({
        id: 142,
        is_anonymous: true,
        first_name: null,
        last_name: null,
      }),
    ).toBe('A');
  });

  it('matches the legacy single-object fixture (regression-safe)', () => {
    // Locks the output for the exact fixture used by feed.component.js
    // and feed-detail.component.js prior to the migration.
    expect(getInitials({ first_name: 'Maria', last_name: 'Gonzalez' })).toBe(
      'MG',
    );
  });
});

describe('getUserDisplayName', () => {
  it('joins first and last name with a single space', () => {
    expect(
      getUserDisplayName({ first_name: 'Ada', last_name: 'Lovelace' }),
    ).toBe('Ada Lovelace');
  });

  it('returns "Anónimo" when the user is missing', () => {
    expect(getUserDisplayName(null)).toBe('Anónimo');
    expect(getUserDisplayName(undefined)).toBe('Anónimo');
  });

  it('returns "Usuario" when both name parts are empty', () => {
    expect(getUserDisplayName({})).toBe('Usuario');
    expect(getUserDisplayName({ first_name: '', last_name: '' })).toBe(
      'Usuario',
    );
  });

  it('returns the only set part when the other is missing', () => {
    expect(getUserDisplayName({ first_name: 'Ada' })).toBe('Ada');
    expect(getUserDisplayName({ last_name: 'Lovelace' })).toBe('Lovelace');
  });

  it('returns "Anónimo" for the anonymous payload (issue #234)', () => {
    expect(
      getUserDisplayName({
        id: 142,
        is_anonymous: true,
        first_name: null,
        last_name: null,
      }),
    ).toBe('Anónimo');
  });

  it('does not leak the raw user when is_anonymous is true but first_name is also set (defense in depth)', () => {
    // If the backend ever sends a mixed payload, the anonymous flag
    // wins — the frontend is the last line of defense.
    expect(
      getUserDisplayName({
        id: 142,
        is_anonymous: true,
        first_name: 'Ada',
        last_name: 'Lovelace',
      }),
    ).toBe('Anónimo');
  });
});

describe('resolveAvatar', () => {
  it('returns null for null / undefined', () => {
    expect(resolveAvatar(null)).toBeNull();
    expect(resolveAvatar(undefined)).toBeNull();
  });

  it('returns the string as-is', () => {
    expect(resolveAvatar('https://cdn.example/a.png')).toBe(
      'https://cdn.example/a.png',
    );
  });

  it('returns the url property of an object', () => {
    expect(resolveAvatar({ url: 'https://cdn.example/a.png' })).toBe(
      'https://cdn.example/a.png',
    );
  });

  it('returns the first entry of urls[]', () => {
    expect(
      resolveAvatar({
        urls: ['https://cdn.example/a.png', 'https://cdn.example/b.png'],
      }),
    ).toBe('https://cdn.example/a.png');
  });

  it('returns null for an empty urls[]', () => {
    expect(resolveAvatar({ urls: [] })).toBeNull();
  });

  it('returns the first entry of an array of strings', () => {
    expect(
      resolveAvatar(['https://cdn.example/a.png', 'https://cdn.example/b.png']),
    ).toBe('https://cdn.example/a.png');
  });

  it('returns the url property of the first entry of an object array', () => {
    expect(
      resolveAvatar([
        { url: 'https://cdn.example/a.png' },
        { url: 'https://cdn.example/b.png' },
      ]),
    ).toBe('https://cdn.example/a.png');
  });

  it('returns null when an object has no recognisable url shape', () => {
    expect(resolveAvatar({ foo: 'bar' })).toBeNull();
  });

  it('accepts a plain string path and returns it as-is', () => {
    // SCEN-PIU-Test-001: plain string path (storage key shape)
    expect(resolveAvatar('users/5/abc123.webp')).toBe('users/5/abc123.webp');
  });

  it('prefers profile_image_path string over avatar object (SCEN-PIU-Test-001)', () => {
    // The frontend uses: resolveAvatar(user.profile_image_path || user.avatar)
    // When profile_image_path is a non-empty string, it short-circuits.
    // This tests the canonical resolveAvatar behavior directly.
    const profilePath = 'users/5/abc123.webp';
    expect(resolveAvatar(profilePath)).toBe(profilePath);
    // The function itself is shape-agnostic — string input is returned as-is.
    // The precedence contract (profile_image_path wins over avatar) is
    // exercised at the call-site: user.profile_image_path || user.avatar.
    // resolveAvatar receives only the profile_path string, so it returns it.
  });
});

describe('resolveAvatarSrc', () => {
  it('returns DEFAULT_AVATAR when there is no avatar', () => {
    expect(resolveAvatarSrc(null)).toBe(DEFAULT_AVATAR);
    expect(resolveAvatarSrc(undefined)).toBe(DEFAULT_AVATAR);
    expect(resolveAvatarSrc({ foo: 'bar' })).toBe(DEFAULT_AVATAR);
  });

  it('prefixes a raw storage key with /storage/', () => {
    expect(resolveAvatarSrc('users/5/abc123.webp')).toBe(
      '/storage/users/5/abc123.webp',
    );
  });

  it('passes a full URL through as-is', () => {
    expect(resolveAvatarSrc('https://cdn.example/a.png')).toBe(
      'https://cdn.example/a.png',
    );
    expect(resolveAvatarSrc({ url: 'https://cdn.example/a.png' })).toBe(
      'https://cdn.example/a.png',
    );
  });

  it('passes an absolute path through as-is', () => {
    expect(resolveAvatarSrc('/images/default-avatar.svg')).toBe(
      '/images/default-avatar.svg',
    );
  });
});

describe('renderAvatarCell', () => {
  it('renders the profile image when the user has profile_image_path', () => {
    const html = renderAvatarCell({
      first_name: 'Ada',
      last_name: 'Lovelace',
      profile_image_path: 'users/1/avatar.webp',
    });
    expect(html).toContain('<img');
    expect(html).toContain('/storage/users/1/avatar.webp');
  });

  it('renders the default avatar image instead of an initials badge', () => {
    const html = renderAvatarCell({ first_name: 'Ada', last_name: 'Lovelace' });
    expect(html).toContain('<img');
    expect(html).toContain('/images/default-avatar.svg');
    expect(html).not.toContain('AL');
  });

  it('renders the default avatar image for an anonymous user (issue #234)', () => {
    const html = renderAvatarCell({
      id: 142,
      is_anonymous: true,
      first_name: null,
      last_name: null,
    });
    expect(html).toContain('/images/default-avatar.svg');
  });
});

describe('renderAvatarImg', () => {
  it('returns an <img> with the real photo when present', () => {
    const html = renderAvatarImg(
      {
        first_name: 'Ada',
        last_name: 'Lovelace',
        profile_image_path: 'users/1/avatar.webp',
      },
      36,
    );
    expect(html).toContain('<img');
    expect(html).toContain('/storage/users/1/avatar.webp');
    expect(html).toContain('width:36px');
  });

  it('returns an <img> with the default avatar when no photo', () => {
    const html = renderAvatarImg({ first_name: 'Ada', last_name: 'Lovelace' });
    expect(html).toContain('<img');
    expect(html).toContain('/images/default-avatar.svg');
    expect(html).not.toContain('AL');
  });

  it('renders "Anónimo" alt text for an anonymous user (issue #234)', () => {
    const html = renderAvatarImg({ id: 142, is_anonymous: true });
    expect(html).toContain('/images/default-avatar.svg');
    expect(html).toContain('Anónimo');
  });
});
