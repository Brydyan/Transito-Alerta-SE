import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CommentService } from './comment.service';
import { HttpService } from './http.service';
import { Comment } from '../models/comment.model';
import { environment } from '../../../environments/environment';

/**
 * E2 — comment.service.spec.ts (full coverage).
 * Change `2026-08-28-sc-203-auth-comments-backend-integration`.
 *
 * Uses base URL from `environment.apiUrl` (from
 * `HttpService`) so the assertions match HttpService requests.
 */
describe('CommentService', () => {
  let service: CommentService;
  let http: HttpTestingController;
  const base = environment.apiUrl;

  const fixture: Comment = {
    id: 'c-1',
    content: 'Hello',
    incident_id: 'inc-1',
    user_id: 'u-1',
    created_at: new Date('2026-08-27'),
    updated_at: new Date('2026-08-27'),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [CommentService, HttpService],
    });
    service = TestBed.inject(CommentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ───── E2.2 getComments success + cache ─────
  it('getComments hits /comments/incident/:id and updates the cache', (done) => {
    service.getComments('inc-1').subscribe((result) => {
      expect(result).toEqual([fixture]);
      expect(service.getCurrentComments()).toEqual([fixture]);
      done();
    });
    const req = http.expectOne(`${base}/comments/incident/inc-1`);
    expect(req.request.method).toBe('GET');
    req.flush([fixture]);
  });

  // ───── E2.3 getComments 404 ─────
  it('getComments on 404 surfaces the error', (done) => {
    service.getComments('missing').subscribe({
      error: (err) => {
        expect(err.status).toBe(404);
        done();
      },
    });
    http.expectOne(`${base}/comments/incident/missing`).flush(
      { message: 'Not found' },
      { status: 404, statusText: 'Not Found' },
    );
  });

  // ───── E2.4 createComment success + cache prepend ─────
  it('createComment posts to /comments with incident_id in body and prepends cache', (done) => {
    const created: Comment = { ...fixture, id: 'c-2' };
    // Seed the cache via a getComments first.
    service.getComments('inc-1').subscribe();
    http.expectOne(`${base}/comments/incident/inc-1`).flush([fixture]);

    service.createComment('inc-1', { content: 'second' }).subscribe((c) => {
      expect(c.id).toBe('c-2');
      expect(service.getCurrentComments()[0]?.id).toBe('c-2');
      done();
    });
    const req = http.expectOne(`${base}/comments`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ content: 'second', incident_id: 'inc-1' });
    req.flush(created);
  });

  // ───── C.3 updateComment ─────
  it('updateComment PATCHes the comment and replaces the cache entry', (done) => {
    service.getComments('inc-1').subscribe();
    http.expectOne(`${base}/comments/incident/inc-1`).flush([fixture]);

    const updated: Comment = { ...fixture, content: 'edited' };
    service.updateComment('c-1', { content: 'edited' }).subscribe((c) => {
      expect(c.content).toBe('edited');
      expect(service.getCurrentComments()[0]?.content).toBe('edited');
      done();
    });
    const req = http.expectOne(`${base}/comments/c-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ content: 'edited' });
    req.flush(updated);
  });

  // ───── E2.5 deleteComment ─────
  it('deleteComment removes the entry from the cache', (done) => {
    service.getComments('inc-1').subscribe();
    http.expectOne(`${base}/comments/incident/inc-1`).flush([fixture, { ...fixture, id: 'c-2' }]);
    expect(service.getCurrentComments().length).toBe(2);

    service.deleteComment('c-1').subscribe(() => {
      expect(service.getCurrentComments().length).toBe(1);
      expect(service.getCurrentComments()[0]?.id).toBe('c-2');
      done();
    });
    http.expectOne(`${base}/comments/c-1`).flush(null);
  });

  // ───── D.1 uploadCommentImage stub ─────
  it('uploadCommentImage posts to /comments/:id/images', (done) => {
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    service.uploadCommentImage('c-1', file).subscribe(() => done());
    const req = http.expectOne(`${base}/comments/c-1/images`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'img-1', comment_id: 'c-1', url: 'http://x/a.png', size_bytes: 1, mime_type: 'image/png', created_at: '2026-08-27' });
  });

  // ───── C.4 getComments$ observable ─────
  it('getComments$() exposes the cache as an observable', (done) => {
    service.getComments$().subscribe((list) => {
      if (list.length === 1) {
        expect(list[0]?.id).toBe('c-1');
        done();
      }
    });
    service.getComments('inc-1').subscribe();
    http.expectOne(`${base}/comments/incident/inc-1`).flush([fixture]);
  });

  // ───── C.4 clearCache ─────
  it('clearCache() resets the cache', (done) => {
    service.getComments('inc-1').subscribe();
    http.expectOne(`${base}/comments/incident/inc-1`).flush([fixture]);
    service.clearCache();
    expect(service.getCurrentComments()).toEqual([]);
    done();
  });
});
