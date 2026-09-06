export const environment = {
  production: false,
  apiUrl: '/api',
  apiTimeout: 30000,
  /**
   * DSN de Sentry. Vacío = no se inicializa, igual que el backend, que
   * hace `if (process.env.SENTRY_DSN)` antes de `Sentry.init`.
   *
   * Un SPA estático no tiene variables de entorno en ejecución: esto se
   * hornea en el build. Un DSN de Sentry es semi-público por diseño —
   * viaja en el bundle de todos modos— pero sólo permite ENVIAR eventos,
   * nunca leerlos, así que no es una credencial de acceso.
   */
  sentryDsn: '',
};
