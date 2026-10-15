/**
 * Human-readable display names for the 5 seeded roles.
 * Used by InvitationsService to show a readable label in the invitation
 * email instead of the internal role identifier.
 *
 * Falls back to the raw role name if a future role is not in this map.
 */
export const ROLE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  master:       'Master',
  agent_system: 'Agente del Sistema',
  admin_org:    'Administrador de Organización',
  operator_org: 'Operador de Organización',
  reporter:     'Ciudadano',
};
