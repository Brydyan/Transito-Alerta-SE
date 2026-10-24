/**
 * 2026-10-10-user-onboarding-telegram-tour (D5) — the per-role tour
 * text the bot sends right after a successful `/start` linking.
 *
 * The 4 roles are exactly the 4 internal staff roles. `reporter`
 * (citizen) is intentionally absent: citizens do not get Telegram
 * tours, do not get Telegram deep-links in their invitation
 * emails, and do not appear in `telegram:link:*` (D7 isolation).
 *
 * Each profile is a single multi-line string ready to send as a
 * Telegram message — no template engine, mirroring the mail
 * module's "no Mustache" stance (T3.6 §"No template engine").
 */
export interface TourProfile {
  /** Title line, e.g. "👋 Bienvenido, Administrador General del Sistema". */
  readonly welcome: string;
  /** Tour body explaining what the role does inside the platform. */
  readonly tour: string;
  /**
   * Internal note: which role the profile is for. The bot uses this
   * to refuse the tour to a `reporter` even if somehow a citizen
   * reached the `/start` handler.
   */
  readonly roleName: string;
}

export const TOUR_PROFILES: Readonly<Record<string, TourProfile>> = {
  master: {
    roleName: 'master',
    welcome: '👋 Bienvenido, Administrador General del Sistema',
    tour: [
      'Como master tienes control total del sistema:',
      '• Configuración global (parámetros, catálogos, permisos).',
      '• Creación y supervisión de organizaciones y departamentos.',
      '• Auditoría completa de la plataforma.',
      '• Gestión de usuarios staff (altas, bajas, cambios de rol).',
      '',
      'Para detalles consulta el manual de admin o escribe /help.',
    ].join('\n'),
  },
  agent_system: {
    roleName: 'agent_system',
    welcome: '👋 Bienvenido, Operador General del Sistema',
    tour: [
      'Como operador de sistema tu trabajo es transversal al país:',
      '• Monitoreo en tiempo real de las incidencias de TODAS las organizaciones.',
      '• Despacho general cuando una organización no puede responder.',
      '• Seguimiento multi-organización de eventos críticos.',
      '',
      'Recibirás avisos por Telegram cada vez que una emergencia crítica',
      'no sea asignada en 1 hora.',
    ].join('\n'),
  },
  admin_org: {
    roleName: 'admin_org',
    welcome: '👋 Bienvenido, Administrador de Organización',
    tour: [
      'Como Administrador de Organización tu foco es la operación de tu organización:',
      '• Monitoreo de las incidencias de tus departamentos.',
      '• Despacho y reasignación de emergencias.',
      '• Gestión de la carga de tus operadores: puedes ver quién está',
      '  disponible y quién ha alcanzado su cupo máximo.',
      '',
      'Recibirás avisos por Telegram cada vez que se cree una',
      'emergencia crítica en tu organización.',
    ].join('\n'),
  },
  operator_org: {
    roleName: 'operator_org',
    welcome: '👋 Bienvenido, Operador de Campo',
    tour: [
      'Como Operador de Campo recibirás las tareas en Telegram:',
      '• Cuando se te asigne una incidencia recibirás un mensaje con',
      '  título, descripción, prioridad, coordenadas y enlace a Google',
      '  Maps para dirigirte al lugar.',
      '• Para cambiar el estado de la incidencia abre la aplicación.',
      '• Sube notas y fotos desde el detalle de la incidencia.',
      '',
      'Si tu carga supera el cupo, un administrador puede asignarte',
      'una adicional con un motivo justificado — recibirás el motivo',
      'en el mensaje para tu contexto.',
    ].join('\n'),
  },
};

/**
 * Returns the profile for a role, or `null` if the role is not a
 * staff role that gets a tour (D7: citizens, `reporter`, must
 * resolve to `null` here).
 */
export function getTourProfileForRole(roleName: string | null | undefined): TourProfile | null {
  if (!roleName) return null;
  return TOUR_PROFILES[roleName] ?? null;
}
