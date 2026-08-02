import { describe, expect, it } from 'vitest';
import { buildCommentItem, formatCommentMessage } from './comment-item.js';

describe('formatCommentMessage', () => {
  it('formats blockquotes and newlines cleanly', () => {
    const raw = '> @User: Hola\nGracias por responder';
    const formatted = formatCommentMessage(raw);

    expect(formatted).toContain(
      '<blockquote class="comment-quote">@User: Hola</blockquote>',
    );
    expect(formatted).toContain('Gracias por responder');
  });

  it('returns empty string for null or empty input', () => {
    expect(formatCommentMessage('')).toBe('');
    expect(formatCommentMessage(null)).toBe('');
  });
});

describe('buildCommentItem', () => {
  it('renders a comment item with blockquotes and nested replies', () => {
    const comment = {
      id: 10,
      user_id: 5,
      depth: 0,
      message: '> @Admin: saludo\nHola todo bien',
      created_at: new Date().toISOString(),
      user: { first_name: 'Juan', last_name: 'Pérez' },
      replies: [
        {
          id: 11,
          user_id: 6,
          depth: 1,
          message: 'Todo bien!',
          created_at: new Date().toISOString(),
          user: { first_name: 'Maria', last_name: 'Gómez' },
          replies: [],
        },
      ],
    };

    const li = buildCommentItem(comment, { currentUserId: 5, canDelete: true });
    expect(li.querySelector('.comment-quote')).not.toBeNull();
    expect(li.querySelector('.comment-quote').textContent).toBe(
      '@Admin: saludo',
    );
    expect(li.querySelector('.comment-replies')).not.toBeNull();
  });

  it('keeps the headset icon for internal staff', () => {
    const li = buildCommentItem(
      {
        id: 20,
        user_id: 7,
        message: 'Hola',
        created_at: new Date().toISOString(),
        user: { first_name: 'Admin', last_name: 'Uno', role: 'operator' },
      },
      { currentUserId: 7 },
    );
    expect(li.querySelector('.comment-avatar i.fa-headset')).not.toBeNull();
    expect(li.querySelector('.comment-avatar img')).toBeNull();
  });

  it('renders the default avatar image for a citizen without a photo', () => {
    const li = buildCommentItem(
      {
        id: 21,
        user_id: 8,
        message: 'Hola',
        created_at: new Date().toISOString(),
        user: { first_name: 'Juan', last_name: 'Pérez' },
      },
      {},
    );
    const img = li.querySelector('.comment-avatar img');
    expect(img).not.toBeNull();
    expect(img.src).toContain('/images/default-avatar.svg');
  });

  it('renders the citizen photo when present', () => {
    const li = buildCommentItem(
      {
        id: 22,
        user_id: 9,
        message: 'Hola',
        created_at: new Date().toISOString(),
        user: {
          first_name: 'Juan',
          last_name: 'Pérez',
          profile_image_path: 'users/9/avatar.webp',
        },
      },
      {},
    );
    const img = li.querySelector('.comment-avatar img');
    expect(img).not.toBeNull();
    expect(img.src).toContain('/storage/users/9/avatar.webp');
  });
});
