import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AuditService } from '../audit/audit.service';
import { IncidentsRepository, IncidentRow } from './incidents.repository';

/**
 * AUD (sc-327) D4 — `RevealService` cubre dos operaciones:
 *
 * - `reveal(...)` — `POST /incidents/:id/reveal-reporter`. Es
 *   una escritura, no una consulta (D4). Cada llamada produce
 *   un hecho nuevo: una fila en `audit_events` con la
 *   identidad del master que reveló, el motivo, y el
 *   `case_ref` opcional. La identidad del autor real se
 *   devuelve al master que la pide; la fila de auditoría
 *   registra que la vio.
 *
 * - `listReveals(...)` — `GET /incidents/:id/reveals`.
 *   Devuelve el historial de revelaciones de una incidencia:
 *   quién, cuándo, con qué motivo. NO devuelve la identidad
 *   del autor real — ésa sólo se entrega en el momento de
 *   revelar.
 *
 * Permiso: `REVEAL incidents` (D5, sólo `master`).
 */
@Injectable()
export class RevealService {
  private readonly logger = new Logger(RevealService.name);

  constructor(
    private readonly incidentsRepository: IncidentsRepository,
    private readonly auditService: AuditService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Revela la autoría sellada de una incidencia. Devuelve
   * el id, email y nombre del autor real (no público, sólo
   * para el master que la pide). Es `POST` porque cada
   * llamada produce un hecho nuevo —la fila de auditoría—
   * y eso es el punto del mecanismo (D4): modelarlo como
   * `GET` invitaría a que un proxy la cachee, un navegador
   * la repita, o alguien la considere idempotente.
   */
  async reveal(
    incidentId: string,
    masterId: string,
    input: { justification: string; caseRef?: string | null },
  ): Promise<{
    incident_id: string;
    reporter: { id: string; email: string | null; first_name: string | null };
  }> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Cargar la incidencia. Si no es anónima, no hay
      //    nada sellado que abrir: 404 (D4, escenario
      //    "Incidencia no anónima").
      const incidentRows: IncidentRow[] = await manager.query(
        `SELECT id, is_anonymous FROM incidents WHERE id = $1 AND deleted_at IS NULL`,
        [incidentId],
      );
      const incident = incidentRows[0];
      if (!incident) {
        throw new NotFoundException('Incident not found');
      }
      if (!incident.is_anonymous) {
        // 404 en vez de 400: el recurso "autoría sellada"
        // no existe para esta incidencia. La diferencia
        // entre "no existe" y "no es anónima" no la
        // distinguimos al cliente para no filtrar la
        // existencia de la incidencia.
        throw new NotFoundException('Incident is not anonymous; nothing to reveal');
      }

      // 2. Leer el autor real de incident_reporters.
      const reporterRows: Array<{
        id: string;
        email: string | null;
        first_name: string | null;
      }> = await manager.query(
        `SELECT u.id, u.email, u.first_name
           FROM incident_reporters r
           JOIN users u ON u.id = r.user_id
          WHERE r.incident_id = $1
          LIMIT 1`,
        [incidentId],
      );
      const reporter = reporterRows[0];
      if (!reporter) {
        // No debería pasar: una incidencia con is_anonymous=true
        // DEBE tener una fila en incident_reporters. Si no
        // la tiene, es una inconsistencia de datos.
        //
        // WARNING-4 (ronda 11): antes se lanzaba `new Error(...)`
        // que el filtro HTTP de NestJS no convierte en una
        // respuesta tipada — terminaba en 500 con un cuerpo
        // "Internal server error" plano. `InternalServerErrorException`
        // es la versión tipada: la respuesta mantiene el
        // shape `{ statusCode, message, code? }` del proyecto
        // y el cliente puede mostrar un mensaje accionable.
        throw new InternalServerErrorException({
          code: 'ANONYMOUS_AUTHORSHIP_MISSING',
          message:
            `Anonymous incident ${incidentId} has no entry in incident_reporters. ` +
            'Migrations 0001, 0046, 0048 must be applied and the incident must have a sealed author.',
        });
      }

      // 3. Escribir la auditoría. La justificación es
      //    OBLIGATORIA por acción (D3): el DTO ya validó
      //    MinLength(20).
      await this.auditService.record(
        {
          actorId: masterId,
          action: 'REVEAL',
          resourceType: 'incidents',
          resourceId: incidentId,
          justification: input.justification,
          metadata: input.caseRef
            ? { case_ref: input.caseRef }
            : {},
        },
        manager,
      );

      this.logger.log(
        `REVEAL: master=${masterId} revealed incident=${incidentId} reporter=${reporter.id}`,
      );

      return {
        incident_id: incidentId,
        reporter: {
          id: reporter.id,
          email: reporter.email,
          first_name: reporter.first_name,
        },
      };
    });
  }

  /**
   * Historial de revelaciones de una incidencia. Devuelve
   * quién, cuándo, con qué motivo. NO incluye la identidad
   * del autor real — eso se entrega sólo en el momento de
   * revelar (D4).
   */
  async listReveals(incidentId: string): Promise<
    Array<{
      revealed_by: string;
      revealed_at: Date;
      justification: string;
      case_ref: string | null;
    }>
  > {
    const rows: Array<{
      revealed_by: string;
      revealed_at: Date;
      justification: string;
      case_ref: string | null;
    }> = await this.dataSource.query(
      `SELECT actor_id AS revealed_by, created_at AS revealed_at, justification,
              metadata->>'case_ref' AS case_ref
         FROM audit_events
        WHERE action = 'REVEAL'
          AND resource_type = 'incidents'
          AND resource_id = $1
        ORDER BY created_at ASC`,
      [incidentId],
    );
    return rows;
  }
}
