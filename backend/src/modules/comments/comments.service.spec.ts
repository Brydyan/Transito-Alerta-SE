import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Repository } from 'typeorm';
import { CommentsService, sanitizeContent } from './comments.service';
import { CommentEntity } from '../../entities/comment.entity';
import { IncidentsRepository } from '../incidents/incidents.repository';
import { SubjectScope } from '../../common/authz/subject-scope';

const GLOBAL_SCOPE: SubjectScope = { kind: 'global' };
const ORG_A_SCOPE: SubjectScope = { kind: 'org', organizationId: 'org-A' };

describe('sanitizeContent', () => {
  it('strips <script> tags entirely, including their contents', () => {
    const result = sanitizeContent('hello <script>alert(1)</script> world');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert(1)');
    expect(result).toBe('hello  world');
  });

  it('strips script tags case-insensitively and with attributes', () => {
    const result = sanitizeContent('<SCRIPT src="evil.js">x</SCRIPT>ok');
    expect(result.toLowerCase()).not.toContain('<script');
    expect(result).toBe('ok');
  });

  it('escapes any remaining angle brackets (defense in depth beyond script tags)', () => {
    const result = sanitizeContent('<b>bold</b> & "quoted"');
    expect(result).not.toContain('<b>');
    expect(result).toContain('&lt;b&gt;');
  });

  it('leaves plain text untouched', () => {
    expect(sanitizeContent('just a normal comment')).toBe('just a normal comment');
  });
});

describe('CommentsService', () => {
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    delete: jest.Mock;
    manager: { query: jest.Mock };
  };
  let eventEmitter: { emit: jest.Mock };
  let incidentsRepository: { findOne: jest.Mock };
  let service: CommentsService;

  beforeEach(() => {
    repo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'c-1', ...x })),
      find: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
      manager: { query: jest.fn() },
    };
    eventEmitter = { emit: jest.fn() };
    incidentsRepository = { findOne: jest.fn() };
    service = new CommentsService(
      repo as unknown as jest.Mocked<Repository<CommentEntity>>,
      eventEmitter as unknown as jest.Mocked<EventEmitter2>,
      incidentsRepository as unknown as IncidentsRepository,
    );
  });

  describe('create', () => {
    it('sanitizes content before persisting — never stores raw script tags', async () => {
      const result = await service.create(
        { incident_id: 'inc-1', content: '<script>alert(1)</script>hi' },
        'user-1',
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'hi', incidentId: 'inc-1', userId: 'user-1' }),
      );
      expect(result.content).toBe('hi');
    });

    it('emits comment.added', async () => {
      await service.create({ incident_id: 'inc-1', content: 'hi' }, 'user-1');

      expect(eventEmitter.emit).toHaveBeenCalledWith('comment.added', expect.any(Object));
    });

    // ---- T7.4.A6 — threading validation (RED) --------------------------

    it('rejects a parent_id that belongs to a different incident (400)', async () => {
      repo.findOne.mockResolvedValue({
        id: 'root-1',
        incidentId: 'inc-OTHER',
        parentId: null,
      });

      await expect(
        service.create({ incident_id: 'inc-1', content: 'reply', parent_id: 'root-1' }, 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('accepts replying to a reply (resulting depth 2)', async () => {
      // parent ("reply-1") itself has a parent ("root-1") but its parent has
      // none — so reply-1 is depth 1, and a comment under it is depth 2.
      repo.findOne.mockImplementation(({ where: { id } }: { where: { id: string } }) => {
        if (id === 'reply-1') {
          return Promise.resolve({ id: 'reply-1', incidentId: 'inc-1', parentId: 'root-1' });
        }
        if (id === 'root-1') {
          return Promise.resolve({ id: 'root-1', incidentId: 'inc-1', parentId: null });
        }
        return Promise.resolve(null);
      });

      const result = await service.create(
        { incident_id: 'inc-1', content: 'grandchild', parent_id: 'reply-1' },
        'user-1',
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ parentId: 'reply-1' }),
      );
      expect(result.parentId).toBe('reply-1');
    });

    it('rejects replying to a depth-2 comment (would create depth 3) — 400', async () => {
      // "grandchild" is depth 2 (its parent "reply-1" has a parent "root-1").
      repo.findOne.mockImplementation(({ where: { id } }: { where: { id: string } }) => {
        if (id === 'grandchild-1') {
          return Promise.resolve({ id: 'grandchild-1', incidentId: 'inc-1', parentId: 'reply-1' });
        }
        if (id === 'reply-1') {
          return Promise.resolve({ id: 'reply-1', incidentId: 'inc-1', parentId: 'root-1' });
        }
        return Promise.resolve(null);
      });

      await expect(
        service.create(
          { incident_id: 'inc-1', content: 'too deep', parent_id: 'grandchild-1' },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rejects a parent_id that does not exist (400)', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.create({ incident_id: 'inc-1', content: 'x', parent_id: 'missing' }, 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findByIncident (T3.2 D3 — parent-incident scope check)', () => {
    it('returns comments when the parent incident is visible under scope', async () => {
      incidentsRepository.findOne.mockResolvedValue({ id: 'inc-1' });
      const rows: CommentEntity[] = [{ id: 'c-1', parentId: null } as CommentEntity];
      repo.find.mockResolvedValue(rows);

      const result = await service.findByIncident('inc-1', GLOBAL_SCOPE);

      expect(incidentsRepository.findOne).toHaveBeenCalledWith('inc-1', GLOBAL_SCOPE);
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ incidentId: 'inc-1' }),
          order: { createdAt: 'ASC' },
        }),
      );
      expect(result).toEqual([{ ...rows[0], depth: 0 }]);
    });

    it('throws 404 when the parent incident is invisible under scope (cross-org)', async () => {
      incidentsRepository.findOne.mockResolvedValue(null);

      await expect(service.findByIncident('inc-1', ORG_A_SCOPE)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.find).not.toHaveBeenCalled();
    });

    // ---- T7.4.A9 — depth calculated per comment (0/1/2) -----------------

    it('computes depth 0/1/2 for a root, a reply, and a reply-to-a-reply', async () => {
      incidentsRepository.findOne.mockResolvedValue({ id: 'inc-1' });
      const rows: CommentEntity[] = [
        { id: 'root-1', parentId: null } as CommentEntity,
        { id: 'reply-1', parentId: 'root-1' } as CommentEntity,
        { id: 'grandchild-1', parentId: 'reply-1' } as CommentEntity,
      ];
      repo.find.mockResolvedValue(rows);

      const result = await service.findByIncident('inc-1', GLOBAL_SCOPE);

      expect(result.map((c) => c.depth)).toEqual([0, 1, 2]);
    });
  });

  describe('delete (T7.4.A8 — cascading soft delete)', () => {
    it('soft-deletes the whole thread (root + descendants) via a single recursive statement', async () => {
      repo.findOne.mockResolvedValue({ id: 'c-1', userId: 'user-1' });

      await service.delete('c-1', 'user-1');

      expect(repo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('WITH RECURSIVE'),
        ['c-1'],
      );
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('rejects deletion by a non-owner with 403', async () => {
      repo.findOne.mockResolvedValue({ id: 'c-1', userId: 'user-1' });

      await expect(service.delete('c-1', 'user-2')).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.manager.query).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the comment does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.delete('missing', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
