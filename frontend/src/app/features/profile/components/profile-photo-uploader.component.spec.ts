import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { ProfilePhotoUploaderComponent } from './profile-photo-uploader.component';
import { UserService, UserProfile } from '../../../core/services/user.service';
import { ToastService } from '../../../shared/components/toast/toast.service';

/**
 * F6 perfil-redesign fix (`fixes-required.md` C.3) — el componente
 * ahora sube el archivo directamente vía
 * `UserService.uploadProfileImage()` (`POST /users/me/avatar`, campo
 * `avatar`) al seleccionarlo, en vez de sólo emitir el `File` crudo
 * para que el padre lo suba junto al submit del formulario.
 */
describe('ProfilePhotoUploaderComponent (F6 rediseño — fix C.3)', () => {
  let fixture: ComponentFixture<ProfilePhotoUploaderComponent>;
  let component: ProfilePhotoUploaderComponent;
  let mockUserService: { uploadProfileImage: jest.Mock };
  let mockToast: { success: jest.Mock; error: jest.Mock };

  const fixtureUser: UserProfile = {
    id: 'c3b1a2d4-0000-4000-8000-000000000001',
    first_name: 'Juan',
    last_name: 'Pérez',
    email: 'juan@test.com',
    phone: '+593991234567',
    avatar_url: 'https://cdn.example.com/new-avatar.jpg',
    updated_at: '2026-09-08T12:00:00.000Z',
  };

  function makeFile(name: string, type: string, sizeBytes: number): File {
    return new File([new Uint8Array(sizeBytes)], name, { type, lastModified: Date.now() });
  }

  function fileChangeEvent(file: File | null): Event {
    const input = { files: file ? [file] : [], value: '' } as unknown as HTMLInputElement;
    return { target: input } as unknown as Event;
  }

  beforeEach(async () => {
    mockUserService = { uploadProfileImage: jest.fn().mockReturnValue(of(fixtureUser)) };
    mockToast = { success: jest.fn(), error: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [ProfilePhotoUploaderComponent],
      providers: [
        { provide: UserService, useValue: mockUserService },
        { provide: ToastService, useValue: mockToast },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProfilePhotoUploaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('se crea sin preview', () => {
    expect(component).toBeTruthy();
    expect(component.previewUrl()).toBeNull();
  });

  it('setInitial acepta una url sin subir ni emitir photoUploaded', () => {
    const emitted: string[] = [];
    component.photoUploaded.subscribe((url) => emitted.push(url));
    component.setInitial('https://cdn.example.com/avatar.jpg');
    expect(component.previewUrl()).toBe('https://cdn.example.com/avatar.jpg');
    expect(emitted.length).toBe(0);
    expect(mockUserService.uploadProfileImage).not.toHaveBeenCalled();
  });

  it('rechaza tipos no permitidos (text/plain, application/pdf)', () => {
    expect(component.isValidType(makeFile('test.txt', 'text/plain', 100))).toBe(false);
    expect(component.isValidType(makeFile('test.pdf', 'application/pdf', 100))).toBe(false);
  });

  it('acepta tipos JPG, PNG, WEBP per spec P.3.1', () => {
    expect(component.isValidType(makeFile('a.jpg', 'image/jpeg', 100))).toBe(true);
    expect(component.isValidType(makeFile('a.png', 'image/png', 100))).toBe(true);
    expect(component.isValidType(makeFile('a.webp', 'image/webp', 100))).toBe(true);
  });

  it('MAX_BYTES = 800_000 (≈ 0.78 MB per spec P.3.1)', () => {
    expect(ProfilePhotoUploaderComponent.MAX_BYTES).toBe(800_000);
  });

  it('ALLOWED_TYPES incluye exactamente JPG, PNG, WEBP', () => {
    expect(ProfilePhotoUploaderComponent.ALLOWED_TYPES).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
  });

  it('triggerPicker clickea el input file oculto', () => {
    const clickSpy = jest.fn();
    (component as any)['fileInput'] = () => ({
      nativeElement: { click: clickSpy },
    });
    component.triggerPicker();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('onFileChange: archivo válido llama uploadProfileImage con campo "avatar" y emite photoUploaded con la url del servidor', () => {
    // `UserService.uploadProfileImage` mock devuelve `of(...)`, que
    // emite síncronamente — no hace falta `done()`.
    const emitted: string[] = [];
    component.photoUploaded.subscribe((url) => emitted.push(url));
    const file = makeFile('avatar.jpg', 'image/jpeg', 1000);
    component.onFileChange(fileChangeEvent(file));
    expect(mockUserService.uploadProfileImage).toHaveBeenCalledWith(file);
    expect(emitted).toEqual(['https://cdn.example.com/new-avatar.jpg']);
    expect(component.isUploading()).toBe(false);
    expect(mockToast.success).toHaveBeenCalled();
  });

  it('onFileChange: tipo inválido no sube ni emite, muestra toast de error', () => {
    const emitted: string[] = [];
    component.photoUploaded.subscribe((url) => emitted.push(url));
    const file = makeFile('doc.pdf', 'application/pdf', 100);
    component.onFileChange(fileChangeEvent(file));
    expect(mockUserService.uploadProfileImage).not.toHaveBeenCalled();
    expect(emitted.length).toBe(0);
    expect(mockToast.error).toHaveBeenCalledWith('Formato no soportado. Use JPG, PNG o WEBP.');
  });

  it('onFileChange: archivo > 0.78 MB no sube ni emite, muestra toast de error', () => {
    const emitted: string[] = [];
    component.photoUploaded.subscribe((url) => emitted.push(url));
    const file = makeFile('big.jpg', 'image/jpeg', 900_000);
    component.onFileChange(fileChangeEvent(file));
    expect(mockUserService.uploadProfileImage).not.toHaveBeenCalled();
    expect(emitted.length).toBe(0);
    expect(mockToast.error).toHaveBeenCalledWith('La foto no puede superar 0.78 MB.');
  });

  it('onFileChange: error del servidor muestra toast y apaga isUploading sin emitir', () => {
    mockUserService.uploadProfileImage.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    const emitted: string[] = [];
    component.photoUploaded.subscribe((url) => emitted.push(url));
    const file = makeFile('avatar.jpg', 'image/jpeg', 1000);
    component.onFileChange(fileChangeEvent(file));
    expect(component.isUploading()).toBe(false);
    expect(emitted.length).toBe(0);
    expect(mockToast.error).toHaveBeenCalledWith('Error al subir la foto de perfil.');
  });

  it('onFileChange: sin archivo no hace nada', () => {
    component.onFileChange(fileChangeEvent(null));
    expect(mockUserService.uploadProfileImage).not.toHaveBeenCalled();
  });
});
