import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ProfileActionCardsComponent } from './profile-action-cards.component';
import { UserService, UserProfile } from '../../../core/services/user.service';
import { ToastService } from '../../../shared/components/toast/toast.service';

const baseUser: UserProfile = {
  id: 'u1',
  first_name: 'Ana',
  last_name: 'García',
  phone: null,
  email: 'ana@test.com',
  avatar_url: null,
  updated_at: '2026-10-11T00:00:00.000Z',
};

/**
 * Helper: configures a fresh TestBed with the given user fixture.
 * Each describe block that needs a specific user state creates its own
 * TestBed — Angular requires `configureTestingModule` before instantiation.
 */
async function createComponent(userOverride: Partial<UserProfile> = {}): Promise<{
  fixture: ComponentFixture<ProfileActionCardsComponent>;
  component: ProfileActionCardsComponent;
  mockUserService: { getCurrentUser: jest.Mock; generateTelegramLink: jest.Mock };
  mockToastService: { success: jest.Mock; error: jest.Mock; warning: jest.Mock };
}> {
  const mockUserService = {
    getCurrentUser: jest.fn().mockReturnValue(of({ ...baseUser, ...userOverride })),
    generateTelegramLink: jest.fn(),
  };
  const mockToastService = { success: jest.fn(), error: jest.fn(), warning: jest.fn() };

  await TestBed.configureTestingModule({
    imports: [ProfileActionCardsComponent],
    providers: [
      provideRouter([]),
      { provide: UserService, useValue: mockUserService },
      { provide: ToastService, useValue: mockToastService },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ProfileActionCardsComponent);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  return { fixture, component, mockUserService, mockToastService };
}

describe('ProfileActionCardsComponent (F6 rediseño) — layout', () => {
  let fixture: ComponentFixture<ProfileActionCardsComponent>;
  let component: ProfileActionCardsComponent;

  beforeEach(async () => {
    ({ fixture, component } = await createComponent());
  });

  it('se crea y renderiza 4 tarjetas', () => {
    expect(component).toBeTruthy();
    const cards = fixture.nativeElement.querySelectorAll('.action-card');
    expect(cards.length).toBe(4);
  });

  it('cada tarjeta tiene title + descripción', () => {
    const titles = fixture.nativeElement.querySelectorAll('.card-title');
    const descs = fixture.nativeElement.querySelectorAll('.card-desc');
    expect(titles.length).toBe(4);
    expect(descs.length).toBe(4);
  });

  it('las 3 secciones del mock 10-01 están presentes', () => {
    const titles = Array.from(
      fixture.nativeElement.querySelectorAll('.card-title') as NodeListOf<Element>,
    ).map((t) => t.textContent?.trim().toLowerCase() ?? '');
    expect(titles.some((t) => t.includes('contraseña'))).toBe(true);
    expect(titles.some((t) => t.includes('zona'))).toBe(true);
    expect(titles.some((t) => t.includes('soporte'))).toBe(true);
  });

  it('la 4ta tarjeta es "Notificaciones Telegram"', () => {
    const titles = Array.from(
      fixture.nativeElement.querySelectorAll('.card-title') as NodeListOf<Element>,
    ).map((t) => t.textContent?.trim().toLowerCase() ?? '');
    expect(titles.some((t) => t.includes('telegram'))).toBe(true);
  });

  it('soporte usa mailto:, contraseña y zona usan routerLink', () => {
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('a.card-link'),
    ) as HTMLAnchorElement[];
    const hrefs = links.map((l) => l.getAttribute('href') ?? '');
    const routerLinks = hrefs.filter((h) => h.startsWith('/'));
    const mailtos = hrefs.filter((h) => h.startsWith('mailto:'));
    expect(routerLinks.length).toBe(2);
    expect(mailtos.length).toBe(1);
  });
});

describe('ProfileActionCardsComponent (F6 rediseño) — D4 Telegram card: usuario sin vincular', () => {
  let fixture: ComponentFixture<ProfileActionCardsComponent>;

  beforeEach(async () => {
    ({ fixture } = await createComponent({ telegram_chat_id: null }));
  });

  it('muestra badge "No configurado" cuando telegram_chat_id es null', () => {
    const badge = fixture.nativeElement.querySelector('[data-testid="telegram-status"]');
    expect(badge).not.toBeNull();
    expect(badge.textContent?.trim().toLowerCase()).toContain('no configurado');
  });

  it('muestra botón con texto "Vincular" cuando no está vinculado', () => {
    const btn = fixture.nativeElement.querySelector('[data-testid="telegram-link-btn"]');
    expect(btn).not.toBeNull();
    expect(btn.textContent?.trim().toLowerCase()).toContain('vincular');
  });
});

describe('ProfileActionCardsComponent (F6 rediseño) — D4 Telegram card: usuario vinculado', () => {
  let fixture: ComponentFixture<ProfileActionCardsComponent>;

  beforeEach(async () => {
    ({ fixture } = await createComponent({ telegram_chat_id: 'chat-999' }));
  });

  it('muestra badge "Vinculado" cuando telegram_chat_id existe', () => {
    const badge = fixture.nativeElement.querySelector('[data-testid="telegram-status"]');
    expect(badge).not.toBeNull();
    expect(badge.textContent?.trim().toLowerCase()).toContain('vinculado');
  });

  it('muestra botón "Re-vincular" cuando ya está vinculado', () => {
    const btn = fixture.nativeElement.querySelector('[data-testid="telegram-link-btn"]');
    expect(btn).not.toBeNull();
    expect(btn.textContent?.trim().toLowerCase()).toContain('re-vincular');
  });
});

describe('ProfileActionCardsComponent (F6 rediseño) — D4 Telegram card: click handler', () => {
  let fixture: ComponentFixture<ProfileActionCardsComponent>;
  let mockUserService: { getCurrentUser: jest.Mock; generateTelegramLink: jest.Mock };
  let mockToastService: { success: jest.Mock; error: jest.Mock; warning: jest.Mock };

  beforeEach(async () => {
    ({ fixture, mockUserService, mockToastService } = await createComponent({ telegram_chat_id: null }));
  });

  it('generateTelegramLink — llama al servicio y abre la URL en nueva pestaña', () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    mockUserService.generateTelegramLink.mockReturnValue(
      of({ telegram_link: 'https://t.me/bot?start=tok123' }),
    );
    const btn = fixture.nativeElement.querySelector('[data-testid="telegram-link-btn"]');
    btn.click();
    fixture.detectChanges();
    expect(mockUserService.generateTelegramLink).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith('https://t.me/bot?start=tok123', '_blank');
    openSpy.mockRestore();
  });

  it('generateTelegramLink — error muestra toast de error', () => {
    mockUserService.generateTelegramLink.mockReturnValue(
      throwError(() => new Error('network error')),
    );
    const btn = fixture.nativeElement.querySelector('[data-testid="telegram-link-btn"]');
    btn.click();
    fixture.detectChanges();
    expect(mockToastService.error).toHaveBeenCalled();
  });

  it('generateTelegramLink — null link muestra warning toast (bot no configurado)', () => {
    mockUserService.generateTelegramLink.mockReturnValue(
      of({ telegram_link: null }),
    );
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    const btn = fixture.nativeElement.querySelector('[data-testid="telegram-link-btn"]');
    btn.click();
    fixture.detectChanges();
    expect(mockToastService.warning).toHaveBeenCalledWith(
      expect.stringContaining('bot de Telegram no está configurado'),
      'Sin enlace',
    );
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});
