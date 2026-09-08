import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ActionMenuComponent } from './action-menu.component';

describe('ActionMenuComponent (F6 rediseño)', () => {
  let fixture: ComponentFixture<ActionMenuComponent>;
  let component: ActionMenuComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActionMenuComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(ActionMenuComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('userId', 42);
    fixture.detectChanges();
  });

  it('emite view con el userId al hacer click en el ojo', () => {
    const emitted: (string | number)[] = [];
    component.view.subscribe((id) => emitted.push(id));
    const eyeBtn = fixture.nativeElement.querySelectorAll('button')[0] as HTMLButtonElement;
    eyeBtn.click();
    expect(emitted).toEqual([42]);
  });

  it('abre y cierra el menú con el botón de tres puntos', () => {
    const trigger = fixture.nativeElement.querySelectorAll('button')[1] as HTMLButtonElement;
    expect(fixture.nativeElement.querySelector('.menu')).toBeNull();
    trigger.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.menu')).toBeTruthy();
    trigger.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.menu')).toBeNull();
  });

  it('emite edit al elegir Editar en el menú', () => {
    (component as any).open.set(true);
    fixture.detectChanges();
    const emitted: (string | number)[] = [];
    component.edit.subscribe((id) => emitted.push(id));
    const items = fixture.nativeElement.querySelectorAll('.menu-item') as NodeListOf<HTMLButtonElement>;
    items[0].click();
    expect(emitted).toEqual([42]);
    expect((component as any).open()).toBe(false);
  });

  it('emite delete al elegir Eliminar en el menú', () => {
    (component as any).open.set(true);
    fixture.detectChanges();
    const emitted: (string | number)[] = [];
    component.delete.subscribe((id) => emitted.push(id));
    const items = fixture.nativeElement.querySelectorAll('.menu-item') as NodeListOf<HTMLButtonElement>;
    items[1].click();
    expect(emitted).toEqual([42]);
    expect((component as any).open()).toBe(false);
  });
});
