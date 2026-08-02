import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openInlineReplyForm } from './comment-reply.js';
import { commentService } from './comment.service.js';

vi.mock('./comment.service.js', () => ({
  commentService: {
    create: vi.fn().mockResolvedValue({ id: 99 }),
  },
}));

function mountCommentLi() {
  document.body.innerHTML = `
    <li>
      <div class="comment-body"></div>
    </li>
  `;
  return document.querySelector('li');
}

const baseComment = {
  id: 7,
  depth: 0,
  user: { first_name: 'Ana', last_name: 'Pérez' },
};

describe('openInlineReplyForm', () => {
  beforeEach(() => {
    commentService.create.mockClear();
    commentService.create.mockResolvedValue({ id: 99 });
  });

  it('mounts a single inline form inside the comment body', () => {
    const li = mountCommentLi();
    openInlineReplyForm({ incidentId: 1, comment: baseComment, li });

    const forms = document.querySelectorAll('.fd-comment-inline-reply');
    expect(forms).toHaveLength(1);
    expect(li.querySelector('textarea')).not.toBeNull();
  });

  it('closes a previously open form when opening another', () => {
    const li = mountCommentLi();
    openInlineReplyForm({ incidentId: 1, comment: baseComment, li });
    openInlineReplyForm({
      incidentId: 1,
      comment: { ...baseComment, id: 8 },
      li,
    });

    const forms = document.querySelectorAll('.fd-comment-inline-reply');
    expect(forms).toHaveLength(1);
    expect(forms[0].dataset.parentId).toBe('8');
  });

  it('does not mount a form for a comment at max depth', () => {
    const li = mountCommentLi();
    openInlineReplyForm({
      incidentId: 1,
      comment: { ...baseComment, depth: 2 },
      li,
    });

    expect(document.querySelector('.fd-comment-inline-reply')).toBeNull();
  });

  it('removes the form on cancel', () => {
    const li = mountCommentLi();
    openInlineReplyForm({ incidentId: 1, comment: baseComment, li });

    document.querySelector('.fd-inline-reply-cancel').click();
    expect(document.querySelector('.fd-comment-inline-reply')).toBeNull();
  });

  it('posts the reply with the comment as parent and notifies onPosted', async () => {
    const li = mountCommentLi();
    const onPosted = vi.fn();
    openInlineReplyForm({ incidentId: 42, comment: baseComment, li, onPosted });

    const textarea = document.querySelector('textarea');
    textarea.value = 'Una respuesta';
    document
      .querySelector('.fd-comment-inline-reply')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(onPosted).toHaveBeenCalled());

    expect(commentService.create).toHaveBeenCalledWith(42, {
      message: 'Una respuesta',
      parentId: 7,
      imageIds: [],
    });
    expect(document.querySelector('.fd-comment-inline-reply')).toBeNull();
  });

  it('shows the backend error message when the post fails', async () => {
    commentService.create.mockRejectedValueOnce(
      Object.assign(new Error('boom'), {
        response: { data: { message: 'No se puede responder.' } },
      }),
    );

    const li = mountCommentLi();
    openInlineReplyForm({ incidentId: 1, comment: baseComment, li });

    const textarea = document.querySelector('textarea');
    textarea.value = 'Otra respuesta';
    document
      .querySelector('.fd-comment-inline-reply')
      .dispatchEvent(new Event('submit', { cancelable: true }));

    await vi.waitFor(() => {
      const errorBox = document.querySelector(
        '.fd-comment-inline-reply__error',
      );
      expect(errorBox.textContent).toBe('No se puede responder.');
      expect(errorBox.style.display).toBe('block');
    });
  });

  it('uses the provided getUserName for the placeholder', () => {
    const li = mountCommentLi();
    openInlineReplyForm({
      incidentId: 1,
      comment: baseComment,
      li,
      getUserName: () => 'Nombre Custom',
    });

    expect(document.querySelector('textarea').placeholder).toContain(
      '@Nombre Custom',
    );
  });
});
