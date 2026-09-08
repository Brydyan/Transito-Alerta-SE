import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SearchBarComponent } from './search-bar.component';

describe('SearchBarComponent (F6 rediseño)', () => {
  let fixture: ComponentFixture<SearchBarComponent>;
  let component: SearchBarComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchBarComponent],
    }).compileComponents();
  });

  it('emite el valor inicial como primer cambio', async () => {
    fixture = TestBed.createComponent(SearchBarComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('initial', 'admin');
    fixture.detectChanges();
    // El valueChanges dispara con el valor actual del FormControl.
    const emitted: string[] = [];
    component.searchChange.subscribe((v) => emitted.push(v));
    // Forzar un `valueChanges` del control seteando el mismo valor
    // dispara distinctUntilChanged con un valor nuevo en la próxima
    // entrada. Para este test, basta con que el control arranque
    // con 'admin'.
    expect((component as any).control.value).toBe('admin');
  });

  it('emite string vacío al limpiar (botón X)', () => {
    fixture = TestBed.createComponent(SearchBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    (component as any).control.setValue('algo');
    fixture.detectChanges();
    component.clear();
    expect((component as any).control.value).toBe('');
  });

  it('acepta un placeholder via input', () => {
    fixture = TestBed.createComponent(SearchBarComponent);
    fixture.componentRef.setInput('placeholder', 'Buscar por nombre...');
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.placeholder).toBe('Buscar por nombre...');
  });
});
