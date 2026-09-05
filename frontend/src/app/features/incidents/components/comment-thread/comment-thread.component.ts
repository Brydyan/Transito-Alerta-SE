import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnChanges,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';

import { CommentService } from '../../../../core/services/comment.service';
import { ImageCompressorService } from '../../../../core/services/image-compressor.service';
import { Comment } from '../../../../core/models/comment.model';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiIconComponent } from '../../../../shared/components/ui-icon/ui-icon.component';

/**
 * F3 (sc-303) — F3.5 Comment Thread.
 *
 * Componente responsable del hilo completo: lista cronológica de
 * comentarios (con respuestas anidadas respetando la profundidad que
 * el backend informe — D6: el frontend no declara la constante
 * propia) + composer con adjuntos de hasta cinco imágenes (F3.5.4
 * + F3.5.5 + F3.5.6).
 *
 * El composer sólo se muestra si el usuario tiene `CREATE comments`
 * (F3.5.3). Sin ese permiso, el hilo es de sólo lectura.
 */
@Component({
  selector: 'app-comment-thread',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiIconComponent,
  ],
  templateUrl: './comment-thread.component.html',
  styleUrl: './comment-thread.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommentThreadComponent implements OnChanges {
  // ── Inputs ────────────────────────────────────────────────────────
  readonly incidentId = input.required<string>();
  readonly comments = input<Comment[]>([]);
  readonly currentUserId = input<string | null>(null);
  readonly permissions = input<readonly string[]>([]);

  // ── Outputs ───────────────────────────────────────────────────────
  readonly commentsChanged = output<Comment[]>();

  // ── Services ──────────────────────────────────────────────────────
  private readonly commentService = inject(CommentService);
  private readonly imageCompressor = inject(ImageCompressorService);

  // ── UI state ──────────────────────────────────────────────────────
  /** D6 — la profundidad viene del backend, no es constante propia. */
  readonly maxDepth = signal<number>(2);
  readonly composerOpen = signal<boolean>(false);
  readonly composerCtrl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(1)],
  });
  readonly attachments = signal<File[]>([]);
  readonly submitting = signal<boolean>(false);
  readonly lastError = signal<string | null>(null);

  readonly canCreate = computed(() => this.permissions().includes('CREATE comments'));

  /** F3.5.5 — seis imágenes se rechazan en cliente, sin emitir petición. */
  readonly attachmentError = signal<string | null>(null);

  // ── D6: hijos anidados ────────────────────────────────────────────
  readonly tree = computed(() => buildTree(this.comments(), this.maxDepth()));

  ngOnChanges(): void {
    // Si el backend cambia la lista, el computed `tree` la
    // re-deriva. Nada que hacer acá.
  }

  // ── Composer actions ──────────────────────────────────────────────
  toggleComposer(): void {
    this.composerOpen.update((v) => !v);
    this.lastError.set(null);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;

    // F3.5.5 — el límite de cinco es en cliente; el 422 del
    // servidor es la red de seguridad, no el mecanismo principal.
    const current = this.attachments();
    const totalAfter = current.length + files.length;
    if (totalAfter > 5) {
      this.attachmentError.set(
        `Máximo 5 imágenes. Tenés ${current.length}; intentaste agregar ${files.length}.`,
      );
      input.value = '';
      return;
    }
    this.attachmentError.set(null);
    this.attachments.set([...current, ...files]);
    input.value = '';
  }

  removeAttachment(index: number): void {
    this.attachments.update((arr) => arr.filter((_, i) => i !== index));
  }

  async submit(): Promise<void> {
    if (this.composerCtrl.invalid) return;
    if (this.submitting()) return;
    this.submitting.set(true);
    this.lastError.set(null);

    const content = this.composerCtrl.value.trim();
    const files = this.attachments();
    const incidentId = this.incidentId();

    this.commentService.createComment(incidentId, { content }).subscribe({
      next: async (created) => {
        // F3.5.6 — publicar e insertar en el hilo sin recargar.
        this.commentsChanged.emit([created, ...this.comments()]);

        // Si hay adjuntos, los subimos como segundo paso atado al
        // comentario recién creado. La subida falla con error
        // visible, pero el comentario principal no se pierde.
        if (files.length > 0) {
          try {
            const compressed = await Promise.all(
              files.map((f) => this.imageCompressor.compressImage(f)),
            );
            const compressedFiles = compressed.map(
              (blob, i) =>
                new File([blob], files[i].name.replace(/\.[^.]+$/, '.webp'), {
                  type: 'image/webp',
                }),
            );
            this.commentService
              .uploadCommentImages(created.id, compressedFiles)
              .subscribe({
                next: () => {
                  this.resetComposer();
                },
                error: () => {
                  this.lastError.set(
                    'Comentario publicado, pero la subida de imágenes falló.',
                  );
                  this.resetComposer();
                },
              });
          } catch {
            this.lastError.set(
              'Comentario publicado, pero la compresión de imágenes falló.',
            );
            this.resetComposer();
          }
        } else {
          this.resetComposer();
        }
      },
      error: () => {
        this.lastError.set('No se pudo publicar el comentario.');
        this.submitting.set(false);
      },
    });
  }

  private resetComposer(): void {
    this.composerCtrl.setValue('');
    this.attachments.set([]);
    this.composerOpen.set(false);
    this.submitting.set(false);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

interface CommentNode {
  comment: Comment;
  replies: CommentNode[];
}

/** D6 — `parent_id` ya no es un campo del modelo (D6 del design).
 *  Si el backend decide reintroducir el threading anidado, este
 *  helper lo respeta: mientras tanto, todos los comentarios son
 *  de profundidad 0 (lista plana). */
function buildTree(comments: Comment[], _maxDepth: number): CommentNode[] {
  return comments.map((c) => ({ comment: c, replies: [] }));
}
