import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { UiIconComponent } from '../../../shared/components/ui-icon/ui-icon.component';
import { UserService } from '../../../core/services/user.service';
import { ToastService } from '../../../shared/components/toast/toast.service';

/**
 * ProfilePhotoUploaderComponent — F6 (`2026-09-08-f6-perfil-redesign`).
 *
 * Avatar 128×128 con preview, file input oculto, validación de
 * tamaño (≤ 0.78 MB según spec P.3.1). Sube el archivo directamente
 * (`UserService.uploadProfileImage`) al seleccionarlo — el upload no
 * depende de `onSubmit()` del formulario padre (fix
 * `fixes-required.md` C.3: el endpoint real es `POST
 * /users/me/avatar` con campo `avatar`, no `POST /users/me` con
 * campo `file`). Emite `photoUploaded(url)` cuando el servidor
 * confirma el nuevo `avatar_url`.
 *
 * Decisiones:
 * - Spec dice "JPG, PNG, WEBP". El input `accept="image/jpeg,image/png,image/webp"`
 *   filtra el file picker del browser; `file.type` lo valida
 *   adicionalmente en runtime.
 * - Spec dice "tamaño máximo 0.78 MB" — `MAX_BYTES = 800_000`
 *   (≈ 0.78 MB). Si el file excede (o el tipo es inválido), se
 *   muestra un toast de error y se descarta — no se sube.
 * - El preview usa `FileReader.readAsDataURL` (síncrono al load) y
 *   se muestra de inmediato, en paralelo al upload al servidor.
 * - Errores de upload se muestran via `ToastService.error()` (C.5
 *   W.2 — antes se perdían silenciosamente).
 */
@Component({
  selector: 'app-profile-photo-uploader',
  standalone: true,
  imports: [UiIconComponent],
  template: `
    <div class="photo-uploader">
      <div
        class="avatar-box"
        [class.is-uploading]="isUploading()"
        (click)="triggerPicker()"
        role="button"
        [attr.tabindex]="0"
        (keydown.enter)="triggerPicker()"
        (keydown.space)="$event.preventDefault(); triggerPicker()"
        [attr.aria-label]="
          previewUrl() ? 'Cambiar foto de perfil' : 'Subir foto de perfil'
        "
      >
        @if (isUploading()) {
          <div class="spinner" role="status" aria-label="Procesando imagen"></div>
        } @else if (previewUrl()) {
          <img
            class="avatar-img"
            [src]="previewUrl()!"
            alt="Foto de perfil"
          />
          <div class="avatar-overlay" aria-hidden="true">
            <ui-icon name="camera" [size]="22" [strokeWidth]="1.75" />
          </div>
        } @else {
          <span class="avatar-initials" aria-hidden="true">
            <ui-icon name="user" [size]="36" [strokeWidth]="1.5" />
          </span>
          <div class="avatar-overlay" aria-hidden="true">
            <ui-icon name="camera" [size]="22" [strokeWidth]="1.75" />
          </div>
        }
      </div>
      <p class="hint">JPG, PNG, WEBP. Máximo 0.78 MB. La imagen se recortará a 512×512 px.</p>
      <button type="button" class="btn-secondary" (click)="triggerPicker()">
        Subir nueva foto
      </button>
      <input
        #fileInput
        type="file"
        class="hidden-input"
        accept="image/jpeg,image/png,image/webp"
        (change)="onFileChange($event)"
        aria-label="Seleccionar archivo de imagen"
      />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .photo-uploader {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
      }
      .avatar-box {
        position: relative;
        width: 8rem;
        height: 8rem;
        border-radius: 9999px;
        background: var(--color-bg-primary, #f1f5f9);
        overflow: hidden;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid transparent;
        transition: border-color 0.15s ease;
      }
      .avatar-box:hover,
      .avatar-box:focus-visible {
        border-color: var(--color-brand-primary, #6d28d9);
        outline: none;
      }
      .avatar-box.is-uploading {
        opacity: 0.5;
        pointer-events: none;
      }
      .avatar-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .avatar-initials {
        color: var(--color-slate-400, #94a3b8);
      }
      .avatar-overlay {
        position: absolute;
        inset: 0;
        background: rgba(15, 23, 42, 0.4);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      .avatar-box:hover .avatar-overlay,
      .avatar-box:focus-within .avatar-overlay {
        opacity: 1;
      }
      .spinner {
        width: 1.5rem;
        height: 1.5rem;
        border: 2px solid var(--color-slate-300, #cbd5e1);
        border-top-color: var(--color-brand-primary, #6d28d9);
        border-radius: 9999px;
        animation: spin 0.7s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      .hint {
        font-size: 0.75rem;
        color: var(--color-slate-500, #64748b);
        text-align: center;
        margin: 0;
        max-width: 16rem;
      }
      .btn-secondary {
        padding: 0.5rem 0.875rem;
        background: transparent;
        color: var(--color-brand-primary, #6d28d9);
        border: 1px solid var(--color-border-subtle, #e2e8f0);
        border-radius: 0.5rem;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.15s ease;
      }
      .btn-secondary:hover {
        background: var(--color-bg-primary, #f1f5f9);
      }
      .hidden-input {
        display: none;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePhotoUploaderComponent {
  /** Máx 0.78 MB per spec P.3.1. */
  static readonly MAX_BYTES = 800_000;
  static readonly ALLOWED_TYPES: ReadonlyArray<string> = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ];

  /** Emite el nuevo `avatar_url` cuando el servidor confirma el upload. */
  readonly photoUploaded = output<string>();

  private readonly userService = inject(UserService);
  private readonly toastService = inject(ToastService);

  /** URL inicial del avatar (poblada por el padre con
   *  `user.avatar_url`). Después de la carga, se puede seguir
   *  actualizando vía `setInitial`. */
  readonly initialUrl = input<string | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly isUploading = signal(false);

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  constructor() {
    // El `effect` mantiene `previewUrl` sincronizado con
    // `initialUrl` (signal input). Cada vez que el padre actualice
    // el URL (p.ej. tras un `getUserById`), el preview se refresca.
    // Si el padre sube un file, `onFileChange` setea `previewUrl`
    // directamente a la data-URL; este effect re-evalúa en cada
    // cambio de `initialUrl` pero la `data-URL` local se preserva
    // — sólo se sobreescribe si `initialUrl` cambia explícitamente.
    effect(() => {
      const initial = this.initialUrl();
      if (initial !== null) {
        this.previewUrl.set(initial);
      }
    });
  }

  setInitial(url: string | null): void {
    this.previewUrl.set(url);
  }

  triggerPicker(): void {
    this.fileInput()?.nativeElement.click();
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // reset para permitir re-selección del mismo archivo
    if (!file) return;

    if (!this.isValidType(file)) {
      this.toastService.error('Formato no soportado. Use JPG, PNG o WEBP.');
      return;
    }
    if (file.size > ProfilePhotoUploaderComponent.MAX_BYTES) {
      this.toastService.error('La foto no puede superar 0.78 MB.');
      return;
    }

    // Preview local, inmediato (no depende del upload).
    const reader = new FileReader();
    reader.onload = () => {
      this.previewUrl.set(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload al servidor (C.3 — endpoint real: POST /users/me/avatar,
    // campo `avatar`).
    this.isUploading.set(true);
    this.userService.uploadProfileImage(file).subscribe({
      next: (user) => {
        this.isUploading.set(false);
        this.photoUploaded.emit(user.avatar_url ?? '');
        this.toastService.success('Foto de perfil actualizada.');
      },
      error: () => {
        this.isUploading.set(false);
        this.toastService.error('Error al subir la foto de perfil.');
      },
    });
  }

  isValidType(file: File): boolean {
    return (
      ProfilePhotoUploaderComponent.ALLOWED_TYPES as readonly string[]
    ).includes(file.type);
  }
}
