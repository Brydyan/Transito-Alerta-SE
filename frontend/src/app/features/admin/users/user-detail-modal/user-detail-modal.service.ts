import { Injectable, signal } from '@angular/core';

import { User } from '../models/user.interface';

/**
 * UserDetailModalService — F6 (`2026-09-08-f6-usuarios-redesign`).
 *
 * Signal-based state del modal de vista de detalle de usuario
 * (read-only, no edición). El ojo en la fila de la tabla emite
 * `view` con el `userId`; el componente padre llama a
 * `open(user, orgs)` y el modal aparece con los datos del user.
 *
 * Patrón espejo de `ConfirmDialogService` (mismo árbol):
 *   - `activeUser: signal<User | null>` — fuente de verdad única
 *   - `orgsById: signal<Map<string, string>>` — id → nombre para
 *     resolver la organización del user sin round-trip extra
 *   - `open(user, orgs)` / `close()` — controles imperativos
 *
 * Por qué service aparte del componente: el modal puede
 * dispararse desde el ojo de la tabla, desde un shortcut de
 * teclado (futuro), o desde una deep-link (`?view=:id`). Centralizar
 * el estado en un signal global evita que cada caller tenga
 * que pasar refs y simplifica la limpieza al cerrar.
 */
@Injectable({
  providedIn: 'root',
})
export class UserDetailModalService {
  /** Usuario activo en el modal. `null` = modal cerrado. */
  readonly activeUser = signal<User | null>(null);

  /**
   * Mapa id→nombre de las organizaciones que el padre ya cargó
   * (reutilizamos la lista que pobla la `users-list`, sin un
   * fetch extra). Se setea en `open()` para que el modal
   * tenga el contexto al renderizar.
   */
  readonly orgsById = signal<ReadonlyMap<string, string>>(new Map());

  /**
   * Abre el modal con los datos del user. La carga es inmediata
   * (sin fetch extra) porque el `users-list` ya tiene el user
   * completo en su signal `users()`. Si en el futuro se quiere
   * vista lazy (fetch al abrir), este es el lugar para añadir
   * el `tap` con `usersService.getUserById(...)`.
   */
  open(user: User, orgs: ReadonlyArray<{ id: string; nombre: string }> = []): void {
    this.activeUser.set(user);
    this.orgsById.set(new Map(orgs.map((o) => [o.id, o.nombre])));
  }

  /** Cierra el modal. Idempotente. */
  close(): void {
    this.activeUser.set(null);
    this.orgsById.set(new Map());
  }
}
