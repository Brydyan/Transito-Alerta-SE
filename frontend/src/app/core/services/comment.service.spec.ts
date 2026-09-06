import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CommentService } from './comment.service';
import { HttpService } from './http.service';
import { Comment } from '../models/comment.model';

/**
 * E2 — comment.service.spec.ts (full coverage).
 * Change `2026-08-28-sc-203-auth-comments-backend-integration`.
 *
 * Hard-codes the base URL `http://localhost:3001/api` (from
 * `HttpService`) so the assertions are stable regardless of
 * `environment.apiUrl`.
 */
describe('CommentService', () => {
  let service: CommentService;
  let http: HttpTestingController;
  const base = 'http://localhost:3001/api';

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

  // ───── D.1 + F3 (sc-303) C1 — multi-image upload, contrato real ─────
  //
  // El backend (`comment-images.controller.ts:21-30`) hace
  // `FilesInterceptor('images', 5, …)`: el campo es `images` (plural),
  // hasta 5 archivos por request, un único POST. La respuesta es un
  // array de `CommentImageDto`. El método viejo era un stub que
  // construía un FormData vacío — el bug quedó silenciado por un test
  // que sólo verificaba la URL.
  //
  // Estos tests reemplazan al "D.1 uploadCommentImage stub" del
  // cambio sc-203 y afirman sobre el BODY (no la URL), siguiendo el
  // principio F3.1.4.
  it('uploadCommentImages appends every file under the "images" field', (done) => {
    const files = [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
    ];
    service.uploadCommentImages('c-1', files).subscribe((result) => {
      // C2: la respuesta usa `file_size`, no `size_bytes`. `size_bytes`
      // no existe en el wire — el bug original de SC-209.
      expect(result).toHaveLength(2);
      expect((result[0] as unknown as { size_bytes?: number }).size_bytes).toBeUndefined();
      expect(result[0].file_size).toBe(1);
      expect(result[1].file_size).toBe(1);
      done();
    });

    const req = http.expectOne(`${base}/comments/c-1/images`);
    expect(req.request.method).toBe('POST');
    const body = req.request.body as FormData;
    // El body es FormData real; la aserción de F3.1.4 es sobre su
    // contenido (los `append`), no sobre la URL.
    const entries = body.getAll('images');
    expect(entries).toHaveLength(2);
    expect((entries[0] as File).name).toBe('a.png');
    expect((entries[1] as File).name).toBe('b.png');

    req.flush([
      { id: 'img-1', url: 'http://x/a.png', mime_type: 'image/png', file_size: 1, created_at: '2026-08-27' },
      { id: 'img-2', url: 'http://x/b.png', mime_type: 'image/png', file_size: 1, created_at: '2026-08-27' },
    ]);
  });

  it('uploadCommentImages with an empty array sends an empty FormData (no extra appends)', (done) => {
    // El interceptor del backend (FilesInterceptor) rechaza cero
    // archivos con 400. El frontend no debería llamar al endpoint
    // sin archivos, pero si lo hace, el método debe respetar el
    // input (no inventar un archivo). Esta es una salvaguarda para
    // que la regla de F3.5.5 ("≤5, en cliente") tenga un test que
    // pruebe el caso degenerado.
    service.uploadCommentImages('c-1', []).subscribe((result) => {
      expect(result).toEqual([]);
      done();
    });

    const req = http.expectOne(`${base}/comments/c-1/images`);
    const body = req.request.body as FormData;
    expect(body.getAll('images')).toHaveLength(0);
    req.flush([]);
  });

  it('uploadCommentImages response shape matches the wire (no comment_id, file_size not size_bytes)', (done) => {
    // Belt-and-suspenders sobre C2: el modelo `CommentImage` no debe
    // llevar `comment_id` ni `size_bytes`. Si alguien los re-agrega,
    // este test lo nombra explícitamente.
    service.uploadCommentImages('c-1', [new File(['x'], 'a.png')]).subscribe((result) => {
      expect(result).toHaveLength(1);
      const img = result[0] as unknown as Record<string, unknown>;
      expect(img['comment_id']).toBeUndefined();
      expect(img['size_bytes']).toBeUndefined();
      expect(img['file_size']).toBe(1);
      expect(img['id']).toBe('img-1');
      expect(img['url']).toBe('http://x/a.png');
      done();
    });
    const req = http.expectOne(`${base}/comments/c-1/images`);
    req.flush([{ id: 'img-1', url: 'http://x/a.png', mime_type: 'image/png', file_size: 1, created_at: '2026-08-27' }]);
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
