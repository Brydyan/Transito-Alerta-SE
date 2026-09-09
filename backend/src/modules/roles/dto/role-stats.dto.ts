/**
 * T7+ — métricas agregadas para las 3 cards del pie de la pantalla
 * `/app/admin/roles` (mock 04-01). Devueltas por `GET /api/roles/stats`.
 *
 * - `totalPermissions`: cantidad de permission strings únicos
 *   concedidos entre los roles vivos (los duplicados entre roles
 *   colapsan vía `Set`).
 * - `protectedModules`: cantidad de recursos distintos protegidos
 *   (resource del string "ACTION resource", T3.1).
 * - `assignedUsers`: cantidad de users vivos con `roleId IS NOT NULL`.
 *
 * Sin `class-validator` — son read-only, no entran al DTO.
 */
export class RoleStatsDto {
  totalPermissions!: number;
  protectedModules!: number;
  assignedUsers!: number;
}
