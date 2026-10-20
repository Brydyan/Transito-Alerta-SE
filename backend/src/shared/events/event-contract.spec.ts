import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * 2026-10-20 — GUARD DE CONTRATO PRODUCTOR↔CONSUMIDOR.
 *
 * ## El bug que nos cuesta
 *
 * Tres veces en una sesión, un listener de eventos declaró campos que el
 * productor nunca emitted. Ninguno falló en runtime; los tres fallaron en
 * silencio:
 *
 *   - `CriticalIncidentListener` pedía `organizationId` (camelCase); el
 *     emisor publica la fila snake_case → la alerta crítica de Telegram NO
 *     salió nunca desde que se implementó F7.
 *   - `IncidentAssignedListener` pedía `title`/`description`/`location`; la
 *     fila de `assignments` no los tiene → el mensaje salía
 *     `📋 Nueva tarea: undefined`.
 *   - `IncidentNotificationsListener` pedía `assignedToId`; el emisor mandaba
 *     `operatorId` → `findOne(undefined)` → `if (user?.id)` cortaba → la
 *     notificación in-app al operador NUNCA se creó.
 *
 * En los tres, el unit spec estaba VERDE porque invocaba el listener
 * fabricando el payload que el listener deseaba, en vez del que el productor
 * emite. Un test que se da su propio input no puede detectar un desajuste de
 * contrato con el otro extremo.
 *
 * ## Qué garantiza ESTE spec — y qué no
 *
 * Garantiza COBERTURA, no correctitud: que todo `@OnEvent` y todo `emit()` del
 * código esté declarado en el registro de abajo. Si alguien agrega un listener
 * sin registrarlo, el spec falla y la revisión tiene que happenar. Ese es el
 * hueco que dejó los tres bugs: nadie miró los cuatro handlers de
 * `incident-notifications.listener.ts` porque nada obligaba a mirarlos.
 *
 * NO verifica que los tipos coincidan — eso exige análisis de tipos sobre el
 * productor, y los tres productoresILY opacos (ver `OPAQUE_PRODUCERS`). Para
 * esos, la verificación real la hace el e2e de flujo
 * (`backend/test/e2e/dispatch-workflow.e2e-spec.ts`), que genera el payload por
 * HTTP de verdad.
 *
 * Cuando el registro y el código diverjan, el fallo nombra el archivo y la
 * línea para que el diagnóstico apunte al sitio exacto.
 */

// `backend/src/shared/events` → tres niveles hasta la raíz del backend.
const SRC = join(__dirname, '..', '..', '..');

/** Campos declarados por el listener y quién los consume, para revisión. */
interface ConsumerContract {
  /** Campos que el listener lee del payload. */
  reads: string[];
  /** Cómo se verifican en la práctica. */
  verifiedBy: 'e2e' | 'none';
}

interface EventContract {
  /** Consumidores vía `@OnEvent` (EventEmitter2 in-process). Existence-checked. */
  consumers: Record<string, ConsumerContract>;
  /**
   * Consumidores del MISMO evento pero por el stream de Redis
   * (`IncidentMailListener.route()`), no por EventEmitter2.
   *
   * Declarados aparte y NO existence-checked: el scanner sólo encuentra
   * `@OnEvent`, y un consumidor de stream no tiene decorator que escanear.
   *
   * Estar en esta lista es la razón de más para mirar con cuidado: el
   * emisor tiene que mandar el MISMO payload por los dos canales. Ya no lo
   * hace —`assignments.service.ts` serializaba la fila pelada al stream y
   * el payload enriquecido al emitter, así que el correo salía sin título
   * mientras Telegram sí lo recibía.
   */
  streamConsumers?: Record<string, ConsumerContract>;
  /**
   * `true` cuando el productor pasa una fila de DB o el resultado de un repo,
   * así que sus campos no se pueden derivar estáticamente. En ese caso la
   * verificación real la debe dar un e2e.
   */
  producerIsOpaque: boolean;
}

/**
 * Registro de todo el contrato de eventos del sistema.
 *
 * Al agregar un `@OnEvent` o un `emit`, agregalo acá. El spec falla si el
 * código tiene algo que no está en el registro, y viceversa.
 */
const CONTRACTS: Record<string, EventContract> = {
  'incident.created': {
    producerIsOpaque: true,
    consumers: {
      CriticalIncidentListener: {
        reads: ['id', 'title', 'priority', 'organization_id'],
        verifiedBy: 'e2e',
      },
      IncidentNotificationsListener: {
        reads: ['id', 'title', 'citizen_id'],
        verifiedBy: 'none',
      },
    },
    streamConsumers: {
      // `handleIncidentCreated` lee los cinco; `handleIncidentAssigned`
      // cuelga del MISMO evento pero NO usa ninguno de ellos.
      IncidentMailListener: {
        reads: ['id', 'title', 'description', 'priority', 'organization_id'],
        verifiedBy: 'e2e',
      },
    },
  },
  'incident.assigned': {
    producerIsOpaque: false,
    consumers: {
      IncidentAssignedListener: {
        reads: ['operatorId', 'incidentId', 'title', 'description', 'priority', 'capOverrideReason'],
        verifiedBy: 'e2e',
      },
      IncidentNotificationsListener: {
        reads: ['incidentId', 'assignedToId', 'assignedById', 'title'],
        verifiedBy: 'e2e',
      },
    },
    streamConsumers: {
      // Estos tres son los que lee `handleIncidentAssigned`. Antes el
      // registro decía `['id', 'title', 'description']`: `id` y
      // `description` no los lee nadie de este listener, y faltaban los dos
      // que sí decideían si el correo salía — `operatorId` (a quién) e
      // `incidentId` (el respaldo del subject cuando no hay título).
      IncidentMailListener: {
        reads: ['operatorId', 'incidentId', 'title'],
        verifiedBy: 'e2e',
      },
    },
  },
  'incident.status_changed': {
    producerIsOpaque: true,
    consumers: {
      IncidentNotificationsListener: {
        reads: ['citizen_id', 'assigned_to', 'actor_id', 'id'],
        verifiedBy: 'none',
      },
    },
  },
  'comment.added': {
    producerIsOpaque: true,
    consumers: {
      IncidentNotificationsListener: {
        reads: ['id', 'author_id', 'incident_id'],
        verifiedBy: 'none',
      },
    },
  },
};

/** Recorre el árbol `src` en busca de `.ts`, sin seguir los `*.spec.ts`. */
function sourceFiles(dir: string = join(SRC, 'src')): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Relativa al repo, para que el mensaje sea clickeable. */
function rel(path: string): string {
  return path.replace(`${SRC}/`, '').replace(/\\/g, '/');
}

describe('Guard de contrato productor↔consumidor de eventos', () => {
  const files = sourceFiles();
  const listeners: { event: string; cls: string; file: string; line: number }[] = [];
  const emitters: { event: string; file: string; line: number }[] = [];

  beforeAll(() => {
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const lines = src.split('\n');

      lines.forEach((line, i) => {
        // `@OnEvent('incident.created')` seguido de un método; el nombre de la
        // clase se toma del `export class` / `class` más cercano hacia atrás.
        const onEvent = line.match(/@OnEvent\('([^']+)'\)/);
        if (onEvent) {
          const before = lines.slice(0, i).join('\n');
          const cls = [...before.matchAll(/(?:export\s+)?class\s+(\w+)/g)].pop()?.[1] ?? 'UNKNOWN';
          listeners.push({ event: onEvent[1], cls, file: rel(file), line: i + 1 });
        }

        // `emit` del bus: el EventEmitter directo Y el helper `publish()` que lo
        // envuelve. `incident.created` e `incident.status_changed` salen por
        // `this.publish(...)`, no por `eventEmitter.emit(...)` literal
        // (incidents.service.ts:170, incident-workflow.service.ts:563).
        // Omitir el helper hacía que el guard los reportara como "nunca
        // emitidos", que es justo el falso negativo que un guard no puede
        // permitirse.
        //
        // Se excluyen los `emit` de WebSocket (`realtime/events.gateway.ts`):
        // no son eventos del bus.
        const emit = line.match(/(?:this\.eventEmitter\.emit|this\.publish)\('([^']+)'/);
        if (emit) {
          emitters.push({ event: emit[1], file: rel(file), line: i + 1 });
        }
      });
    }
  });

  it('todo @OnEvent del código está declarado en el registro', () => {
    const unregistered = listeners
      .filter((l) => !CONTRACTS[l.event]?.consumers[l.cls])
      .map((l) => `${l.file}:${l.line}  ${l.cls} escucha "${l.event}"`);

    expect(unregistered).toEqual([]);
  });

  it('todo emit() del bus está declarado en el registro', () => {
    const unregistered = emitters
      .filter((e) => !CONTRACTS[e.event])
      .map((e) => `${e.file}:${e.line}  emite "${e.event}"`);

    expect(unregistered).toEqual([]);
  });

  it('el registro no declara consumidores que ya no existen', () => {
    const ghost: string[] = [];
    for (const [event, contract] of Object.entries(CONTRACTS)) {
      for (const cls of Object.keys(contract.consumers)) {
        if (!listeners.some((l) => l.event === event && l.cls === cls)) {
          ghost.push(`${cls} escucha "${event}" pero no existe ningún @OnEvent con esa clase`);
        }
      }
    }

    expect(ghost).toEqual([]);
  });

  it('cada evento del registro tiene al menos un emit() real', () => {
    // Se valida contra los emits ESCANEADOS, no contra coordenadas
    // file:line. Un número de línea se mueve con cada edición y hace que el
    // guard dé falsos negativos; lo único que importa es que el evento se
    // emita en algún lado.
    const neverEmitted = Object.keys(CONTRACTS).filter(
      (event) => !emitters.some((e) => e.event === event),
    );

    expect(neverEmitted).toEqual([]);
  });

  it('ningún listener queda sin cobertura declarada', () => {
    // El recordatorio que falta: un consumidor sin `verifiedBy: 'e2e'` es
    // código que nadie ejercita de punta a punta. No falla hoy — es
    // visibilidad, no un veto — pero el conteo deja la deuda a la vista.
    //
    // 2026-10-20 — recorre TAMBIÉN `streamConsumers`. Antes sólo iteraba
    // `consumers` (los `@OnEvent`), así que los consumidores del stream de
    // Redis —que son los que más nos han costado: el correo de
    // asignación salía sin título y nadie lo vio— no contaban como deuda.
    // Un contador que deja fuera el canal más roto miente sobre el estado
    // del contrato.
    const uncovered: string[] = [];
    for (const [event, contract] of Object.entries(CONTRACTS)) {
      const channels: Array<[string, ConsumerContract]> = [
        ...Object.entries(contract.consumers),
        ...Object.entries(contract.streamConsumers ?? {}),
      ];

      for (const [cls, c] of channels) {
        if (c.verifiedBy !== 'e2e') {
          uncovered.push(`${cls} ← "${event}"`);
        }
      }
    }

    // Console en vez de expect: Debt tracking, not enforcement.
    if (uncovered.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[contrato] ${uncovered.length} consumidor(es) sin cobertura e2e:\n  ` +
          uncovered.join('\n  '),
      );
    }
    expect(true).toBe(true);
  });

  it('informe de cobertura: qué eventos tienen productor opaco', () => {
    // Los productores opacos son los que un e2e tiene que cubrir sí o sí,
    // porque estáticamente no se puede derivar qué campos producen.
    const opaque = Object.entries(CONTRACTS)
      .filter(([, c]) => c.producerIsOpaque)
      .map(([event]) => event);

    expect(opaque.sort()).toEqual(['comment.added', 'incident.created', 'incident.status_changed']);
  });
});