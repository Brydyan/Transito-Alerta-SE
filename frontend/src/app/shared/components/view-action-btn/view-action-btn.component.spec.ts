import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewActionBtnComponent } from './view-action-btn.component';

describe('ViewActionBtnComponent', () => {
  let fixture: ComponentFixture<ViewActionBtnComponent>;
  let component: ViewActionBtnComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViewActionBtnComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(ViewActionBtnComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('emite view al hacer click en el ojo', () => {
    let emitted = 0;
    component.view.subscribe(() => emitted++);
    const eyeBtn = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    eyeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(emitted).toBe(1);
  });

  it('usa el ariaLabel provisto por el consumidor', () => {
    fixture.componentRef.setInput('ariaLabel', 'Ver detalle de Choque en Av. Luis María Campos');
    fixture.detectChanges();
    const eyeBtn = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(eyeBtn.getAttribute('aria-label')).toBe('Ver detalle de Choque en Av. Luis María Campos');
  });

  it('no renderiza menú ni acciones extra (solo el ojo)', () => {
    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons.length).toBe(1);
    expect(fixture.nativeElement.querySelector('.menu')).toBeNull();
  });
});