import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexto por petición, sostenido con `AsyncLocalStorage`.
 *
 * El punto es que el id sobreviva a los `await`. Una variable de módulo
 * NO sirve: Node atiende varias peticiones a la vez sobre el mismo hilo,
 * así que la segunda pisaría a la primera en cuanto la primera cediera
 * el control en un `await` — y el log terminaría atribuyendo líneas de
 * una petición a otra, que es peor que no tener id.
 *
 * `AsyncLocalStorage` es de `node:async_hooks`, no una dependencia nueva.
 */
interface RequestStore {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestStore>();

/** Corre `callback` con `requestId` visible para todo lo que dispare dentro. */
export function runWithRequestId<T>(requestId: string, callback: () => T): T {
  return storage.run({ requestId }, callback);
}

/**
 * El id de la petición en curso, o `undefined` fuera de toda petición
 * (arranque, tareas de `@nestjs/schedule`, consumidores de eventos).
 * Devolver `undefined` y no una cadena vacía deja que quien loguea
 * decida cómo representar la ausencia.
 */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
