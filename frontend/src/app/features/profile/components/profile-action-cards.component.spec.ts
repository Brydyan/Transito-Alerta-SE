import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ProfileActionCardsComponent } from './profile-action-cards.component';

describe('ProfileActionCardsComponent (F6 rediseño)', () => {
  let fixture: ComponentFixture<ProfileActionCardsComponent>;
  let component: ProfileActionCardsComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileActionCardsComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(ProfileActionCardsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('se crea y renderiza 3 tarjetas', () => {
    expect(component).toBeTruthy();
    const cards = fixture.nativeElement.querySelectorAll('.action-card');
    expect(cards.length).toBe(3);
  });

  it('cada tarjeta tiene title + descripción + link', () => {
    const titles = fixture.nativeElement.querySelectorAll('.card-title');
    const descs = fixture.nativeElement.querySelectorAll('.card-desc');
    const links = fixture.nativeElement.querySelectorAll('.card-link');
    expect(titles.length).toBe(3);
    expect(descs.length).toBe(3);
    expect(links.length).toBe(3);
  });

  it('las 3 secciones del mock 10-01 están presentes', () => {
    const titles = Array.from(
      fixture.nativeElement.querySelectorAll('.card-title') as NodeListOf<Element>,
    ).map((t) => t.textContent?.trim().toLowerCase() ?? '');
    expect(titles.some((t) => t.includes('contraseña'))).toBe(true);
    expect(titles.some((t) => t.includes('zona'))).toBe(true);
    expect(titles.some((t) => t.includes('soporte'))).toBe(true);
  });

  it('soporte usa mailto:, las otras usan routerLink', () => {
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('.card-link'),
    ) as HTMLAnchorElement[];
    const hrefs = links.map((l) => l.getAttribute('href') ?? '');
    // 2 con routerLink, 1 con mailto
    const routerLinks = hrefs.filter((h) => h.startsWith('/'));
    const mailtos = hrefs.filter((h) => h.startsWith('mailto:'));
    expect(routerLinks.length).toBe(2);
    expect(mailtos.length).toBe(1);
  });
});
