import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * F6 (`2026-09-08-f6-new-user-form`) — verificación por mutación
 * del wiring de la ruta `app/admin/users/new`.
 *
 * El bug más común con rutas nuevas:
 *   1. La ruta se declara como `:id/edit` ANTES de `new` y
 *      Angular matchea `new` como `:id` (orden importa).
 *   2. El loadComponent apunta a `UserFormComponent` viejo
 *      en vez del nuevo `NewUserFormComponent`.
 *   3. La ruta queda en `''` (vacía) en vez de `new` literal.
 *   4. El routerLink del botón apunta a `'nuevo'` (español) en
 *      vez de `'new'` (inglés) y la ruta no existe.
 *
 * Cada uno de estos tests cae si el bug se reintroduce.
 */
describe('app.routes.ts (F6 — new user form wiring)', () => {
  const routesSrc = readFileSync(join(__dirname, 'app.routes.ts'), 'utf8');
  const usersListSrc = readFileSync(
    join(__dirname, 'features/admin/users/users-list/users-list.component.html'),
    'utf8',
  );

  it("la ruta `path: 'new'` literal existe dentro de `users` (no se matchea como `:id`)", () => {
    // El orden importa: 'new' debe estar ANTES de ':id/edit'
    // dentro del children de 'users'. Esta regex captura la
    // estructura con un lookbehind para asegurar que 'new' está
    // dentro de un bloque children de 'users'.
    const usersBlock = routesSrc.match(
      /path:\s*['"]users['"][\s\S]*?children:\s*\[([\s\S]*?)\][\s\S]*?\],/,
    );
    expect(usersBlock).not.toBeNull();
    const children = usersBlock![1];
    const newIdx = children.search(/path:\s*['"]new['"]/);
    const idEditIdx = children.search(/path:\s*['"]:id\/edit['"]/);
    expect(newIdx).toBeGreaterThan(-1);
    expect(idEditIdx).toBeGreaterThan(-1);
    expect(newIdx).toBeLessThan(idEditIdx);
  });

  it("el loadComponent de `new` apunta a `NewUserFormComponent`", () => {
    const newBlock = routesSrc.match(
      /path:\s*['"]new['"][\s\S]*?loadComponent:\s*[\s\S]*?\.then\(\(m\)\s*=>\s*m\.(\w+)\)/,
    );
    expect(newBlock).not.toBeNull();
    expect(newBlock![1]).toBe('NewUserFormComponent');
  });

  it("NO hay un loadComponent de `new` apuntando al viejo `UserFormComponent`", () => {
    const newBlock = routesSrc.match(
      /path:\s*['"]new['"][\s\S]*?loadComponent:\s*[\s\S]*?\.then\(\(m\)\s*=>\s*m\.(\w+)\)/,
    );
    if (newBlock) {
      expect(newBlock[1]).not.toBe('UserFormComponent');
    }
  });

  it("el routerLink del botón '+ Nuevo usuario' usa 'new' (no 'nuevo')", () => {
    // F6 fix batch (D-frontend-10) — el botón usaba 'nuevo' y la
    // ruta es 'new'. El routerLink debe coincidir con la ruta.
    expect(usersListSrc).toMatch(/\['\/app\/admin\/users',\s*'new'\]/);
    expect(usersListSrc).not.toMatch(/\['\/app\/admin\/users',\s*'nuevo'\]/);
  });

  it("el archivo `NewUserFormComponent` existe en disco", () => {
    const componentPath = join(
      __dirname,
      'features/admin/users/new-user-form/new-user-form.component.ts',
    );
    expect(() => readFileSync(componentPath, 'utf8')).not.toThrow();
  });
});
