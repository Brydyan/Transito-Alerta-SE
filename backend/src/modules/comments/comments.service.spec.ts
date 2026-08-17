import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
  });

  describe('findByIncident (T3.2 D3 — parent-incident scope check)', () => {
    it('returns comments when the parent incident is visible under scope', async () => {
      incidentsRepository.findOne.mockResolvedValue({ id: 'inc-1' });
      const rows: CommentEntity[] = [{ id: 'c-1' } as CommentEntity];
      repo.find.mockResolvedValue(rows);

      const result = await service.findByIncident('inc-1', GLOBAL_SCOPE);

      expect(incidentsRepository.findOne).toHaveBeenCalledWith('inc-1', GLOBAL_SCOPE);
      expect(repo.find).toHaveBeenCalledWith({
        where: { incidentId: 'inc-1' },
        order: { createdAt: 'ASC' },
      });
      expect(result).toEqual(rows);
    });

    it('throws 404 when the parent incident is invisible under scope (cross-org)', async () => {
      incidentsRepository.findOne.mockResolvedValue(null);

      await expect(service.findByIncident('inc-1', ORG_A_SCOPE)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.find).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('allows the owner to delete their own comment', async () => {
      repo.findOne.mockResolvedValue({ id: 'c-1', userId: 'user-1' });

      await service.delete('c-1', 'user-1');

      expect(repo.delete).toHaveBeenCalledWith('c-1');
    });

    it('rejects deletion by a non-owner with 403', async () => {
      repo.findOne.mockResolvedValue({ id: 'c-1', userId: 'user-1' });

      await expect(service.delete('c-1', 'user-2')).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the comment does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.delete('missing', 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
