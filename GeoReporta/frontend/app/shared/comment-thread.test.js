import { describe, expect, it } from 'vitest';
import { renderCommentThread } from './comment-thread.js';

function mountList() {
  document.body.innerHTML = `
    <ul id="list"></ul>
    <div id="empty" class="d-none"></div>
  `;
  return {
    listEl: document.getElementById('list'),
    emptyEl: document.getElementById('empty'),
  };
}

const comments = [
  {
    id: 1,
    message: 'root',
    depth: 0,
    user: { first_name: 'Ana', last_name: 'Pérez' },
    replies: [
      {
        id: 2,
        message: 'reply',
        depth: 1,
        user: { first_name: 'Luis', last_name: '' },
        replies: [],
      },
    ],
  },
];

describe('renderCommentThread', () => {
  it('renders the items and indexes every comment (including replies) by id', () => {
    const { listEl, emptyEl } = mountList();

    const byId = renderCommentThread({
      items: comments,
      listEl,
      emptyEl,
      currentUserId: 9,
      canDelete: true,
    });

    expect(listEl.children.length).toBeGreaterThan(0);
    expect(byId.get(1)?.message).toBe('root');
    expect(byId.get(2)?.message).toBe('reply');
    expect(emptyEl.classList.contains('d-none')).toBe(true);
  });

  it('clears the list and shows the empty state without items', () => {
    const { listEl, emptyEl } = mountList();
    listEl.innerHTML = '<li>old</li>';

    const byId = renderCommentThread({
      items: [],
      listEl,
      emptyEl,
      currentUserId: 9,
      canDelete: false,
    });

    expect(listEl.children.length).toBe(0);
    expect(emptyEl.classList.contains('d-none')).toBe(false);
    expect(byId.size).toBe(0);
  });

  it('uses the provided getUserName resolver', () => {
    const { listEl, emptyEl } = mountList();

    renderCommentThread({
      items: comments,
      listEl,
      emptyEl,
      currentUserId: 9,
      canDelete: false,
      getUserName: () => 'Nombre Custom',
    });

    expect(listEl.textContent).toContain('Nombre Custom');
  });
});
