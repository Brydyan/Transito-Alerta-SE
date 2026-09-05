import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { HttpService } from './http.service';
import { Comment, CommentImage, CreateCommentDto, UpdateCommentDto } from '../models/comment.model';

/**
 * CommentService — wraps `/comments` REST endpoints.
 *
 * Change `2026-08-28-sc-203-auth-comments-backend-integration`:
 *   - Phase C.1: GET `/comments/incident/:incidentId` (was nested
 *     `/incidents/:id/comments` which the backend never wired).
 *   - Phase C.2: POST `/comments` with `{ incident_id, text, author_id }`
 *     in the body (the URL no longer carries the incident id).
 *   - Phase C.3: DELETE `/comments/:id` — already correct.
 *   - Phase C.4: in-memory `comments$` BehaviorSubject so templates
 *     can subscribe via the async pipe and we can optimistically
 *     append / remove entries.
 *   - Phase D.1: `uploadCommentImage` stub — full impl deferred to
 *     Priority 2 (image compression + chunked upload).
 */
@Injectable({
  providedIn: 'root',
})
export class CommentService {
  private readonly comments$ = new BehaviorSubject<Comment[]>([]);

  constructor(private httpService: HttpService) {}

  /** C.4 — observable of the in-memory cache. Templates use the async pipe. */
  getComments$(): Observable<Comment[]> {
    return this.comments$.asObservable();
  }

  /** Snapshot accessor for tests and code that doesn't want the async pipe. */
  getCurrentComments(): Comment[] {
    return this.comments$.value;
  }

  /** C.1 — list comments for an incident. Hits `/comments/incident/:id`. */
  getComments(incidentId: string): Observable<Comment[]> {
    return this.httpService
      .get<Comment[]>(`/comments/incident/${incidentId}`)
      .pipe(tap((comments) => this.comments$.next(comments)));
  }

  /** C.2 — create a comment. Body carries `incident_id`; the URL is just `/comments`. */
  createComment(incidentId: string, dto: { content: string }): Observable<Comment> {
    const body: CreateCommentDto = { content: dto.content, incident_id: incidentId };
    return this.httpService.post<Comment>(`/comments`, body).pipe(
      tap((created) => {
        // C.4.2 — append to cache, newest first
        this.comments$.next([created, ...this.comments$.value]);
      }),
    );
  }

  /** C.3 — update the content of a comment. Only `content` is editable from the client. */
  updateComment(id: string, dto: UpdateCommentDto): Observable<Comment> {
    return this.httpService.patch<Comment>(`/comments/${id}`, dto).pipe(
      tap((updated) => {
        this.comments$.next(
          this.comments$.value.map((c) => (c.id === id ? updated : c)),
        );
      }),
    );
  }

  /** C.3 — delete a comment. Idempotent on the server; cache drops it on success. */
  deleteComment(id: string): Observable<void> {
    return this.httpService.delete<void>(`/comments/${id}`).pipe(
      tap(() => {
        this.comments$.next(this.comments$.value.filter((c) => c.id !== id));
      }),
    );
  }

  /**
   * D.1 — POST /comments/:id/images with `images` (plural) field.
   *
   * F3 (sc-303) C1 (ronda 2): el método viejo era un stub que construía
   * un `FormData` vacío y nunca adjuntaba el archivo. La forma correcta
   * del wire (ver `comment-images.controller.ts:21-30`) es:
   *   - `FilesInterceptor('images', 5, …)` — campo `images`, hasta 5
   *   - un único POST con todos los archivos
   *   - respuesta: `CommentImageDto[]` (array, no objeto único)
   *
   * La compresión previa por archivo y la UI de selección quedan en
   * F3.5 (`image-compressor.service.ts` y `comment-thread`); este
   * método es el contrato de red correcto.
   */
  uploadCommentImages(commentId: string, files: File[]): Observable<CommentImage[]> {
    const formData = new FormData();
    for (const file of files) {
      // El backend hace `FilesInterceptor('images', 5, …)`: el nombre
      // de campo es `images` y acepta múltiples archivos. Repetir el
      // `append` con la misma clave es cómo FormData codifica
      // `multipart/form-data` con varios archivos bajo el mismo field.
      formData.append('images', file);
    }
    return this.httpService.post<CommentImage[]>(
      `/comments/${commentId}/images`,
      formData,
    );
  }

  /** C.4.3 — clear the cache (called on logout / route change if needed). */
  clearCache(): void {
    this.comments$.next([]);
  }
}
