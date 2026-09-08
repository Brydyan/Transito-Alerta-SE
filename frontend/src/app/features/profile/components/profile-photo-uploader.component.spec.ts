import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProfilePhotoUploaderComponent } from './profile-photo-uploader.component';

describe('ProfilePhotoUploaderComponent (F6 rediseño)', () => {
  let fixture: ComponentFixture<ProfilePhotoUploaderComponent>;
  let component: ProfilePhotoUploaderComponent;

  function makeFile(name: string, type: string, sizeBytes: number): File {
    return new File([new Uint8Array(sizeBytes)], name, { type, lastModified: Date.now() });
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfilePhotoUploaderComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(ProfilePhotoUploaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('se crea sin preview', () => {
    expect(component).toBeTruthy();
    expect(component.previewUrl()).toBeNull();
  });

  it('setInitial acepta una url sin emitir fileSelected', () => {
    const emitted: File[] = [];
    component.fileSelected.subscribe((f) => emitted.push(f));
    component.setInitial('https://cdn.example.com/avatar.jpg');
    expect(component.previewUrl()).toBe('https://cdn.example.com/avatar.jpg');
    expect(emitted.length).toBe(0);
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
    // Constante del componente, expuesta como static. La
    // verificación del tamaño sucede en onFileChange (que el
    // evento del file picker provee) — acá verificamos sólo el
    // valor declarado.
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
    // viewChild devuelve el ElementRef; con el componente
    // todavía sin DOM estabilizado, podemos sobrescribir el
    // método click del nativeElement.
    component['fileInput'] = () => ({
      nativeElement: { click: clickSpy },
    }) as unknown as ReturnType<typeof component.fileInput>;
    component.triggerPicker();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
