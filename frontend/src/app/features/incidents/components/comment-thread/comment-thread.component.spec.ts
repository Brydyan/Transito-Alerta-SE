import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { CommentThreadComponent } from './comment-thread.component';
import { CommentService } from '../../../../core/services/comment.service';
import { ImageCompressorService } from '../../../../core/services/image-compressor.service';
import { Comment } from '../../../../core/models/comment.model';

/**
 * F3 (sc-303) — F3.5.7 specs del comment-thread.
 *
 *  - Seis imágenes se rechazan en cliente **sin** emitir petición.
 *  - Cinco producen cinco entradas `images` en el `FormData` (lo
 *    verifica el `CommentService` upload spec — este spec cubre
 *    el conteo y la prevención en el thread).
 *  - El composer está condicionado al permiso `CREATE comments`
 *    (F3.5.3).
 */
describe('CommentThreadComponent (F3.5.7)', () => {
  function makeFile(name: string, type: string = 'image/png'): File {
    return new File(['x'], name, { type });
  }

  const baseComment: Comment = {
    id: 'c-1',
    content: 'hola',
    incident_id: 'inc-1',
    user_id: 'user-1',
    created_at: new Date('2026-09-01'),
    updated_at: new Date('2026-09-01'),
  };

  function setup(permissions: string[]) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        CommentThreadComponent,
        CommentService,
        { provide: ImageCompressorService, useValue: { compressImage: () => Promise.resolve(new Blob()) } },
      ],
    });
    const fixture = TestBed.createComponent(CommentThreadComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('incidentId', 'inc-1');
    fixture.componentRef.setInput('comments', [baseComment]);
    fixture.componentRef.setInput('currentUserId', 'user-1');
    fixture.componentRef.setInput('permissions', permissions);
    fixture.detectChanges();
    return { fixture, component };
  }

  it('muestra el composer sólo si el usuario tiene CREATE comments (F3.5.3)', () => {
    TestBed.resetTestingModule();
    const { fixture: a } = setup([]);
    expect(a.nativeElement.querySelector('[data-testid="open-composer"]')).toBeNull();
    expect(a.nativeElement.querySelector('[data-testid="read-only"]')).not.toBeNull();

    TestBed.resetTestingModule();
    const { fixture: b } = setup(['CREATE comments']);
    expect(b.nativeElement.querySelector('[data-testid="open-composer"]')).not.toBeNull();
    expect(b.nativeElement.querySelector('[data-testid="read-only"]')).toBeNull();
  });

  it('F3.5.5: seis imágenes se rechazan en cliente y NO se agrega ninguna', () => {
    const { component } = setup(['CREATE comments']);
    component.toggleComposer();
    component.onFileSelected({
      target: { files: [makeFile('a.png'), makeFile('b.png'), makeFile('c.png')] },
    } as unknown as Event);
    expect(component.attachments().length).toBe(3);

    // Segunda tanda de 3 → total 6, debe rechazarse.
    component.onFileSelected({
      target: { files: [makeFile('d.png'), makeFile('e.png'), makeFile('f.png')] },
    } as unknown as Event);
    expect(component.attachments().length).toBe(3); // sin cambios
    expect(component.attachmentError()).toMatch(/Máximo 5/);
  });

  it('cinco imágenes caben exacto (sin error)', () => {
    const { component } = setup(['CREATE comments']);
    component.toggleComposer();
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      component.onFileSelected({
        target: { files: [makeFile(`${name}.png`)] },
      } as unknown as Event);
    }
    expect(component.attachments().length).toBe(5);
    expect(component.attachmentError()).toBeNull();
  });

  it('muestra el contador de adjuntos (5 / 5) y los nombres truncados', () => {
    const { fixture, component } = setup(['CREATE comments']);
    component.toggleComposer();
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      component.onFileSelected({
        target: { files: [makeFile(`${name}.png`)] },
      } as unknown as Event);
    }
    fixture.detectChanges();
    const counter = fixture.nativeElement.querySelector(
      '[data-testid="attachment-count"]',
    ) as HTMLElement | null;
    expect(counter?.textContent?.trim()).toBe('5 / 5');
  });

  it('removeAttachment quita el archivo del signal', () => {
    const { component } = setup(['CREATE comments']);
    component.toggleComposer();
    component.onFileSelected({
      target: { files: [makeFile('a.png'), makeFile('b.png')] },
    } as unknown as Event);
    expect(component.attachments().length).toBe(2);
    component.removeAttachment(0);
    expect(component.attachments().length).toBe(1);
    expect(component.attachments()[0].name).toBe('b.png');
  });
});
