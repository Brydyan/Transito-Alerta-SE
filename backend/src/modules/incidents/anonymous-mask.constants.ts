/**
 * AUD (sc-327) D1 — constante que identifica al dispositivo
 * máscara. La fila `users.device_uuid = 'anonymous'`
 * (sembrada por 0001, vaciada de permisos por ANON 0048)
 * es la única identidad de publicación "mostrada" para
 * los reportes anónimos.
 *
 * Re-exportada acá para que el spec (`incidents.anonymous-mask.spec.ts`)
 * pueda alinearse con `authConfig.anonymousDeviceUuid` y
 * cazar la deriva si alguien cambia un lado sin el otro.
 */
export const ANONYMOUS_MASK_DEVICE_UUID = 'anonymous' as const;
