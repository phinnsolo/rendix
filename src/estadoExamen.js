// Modo restringido: estados de la sesión de examen, transiciones válidas y tipos de evento de la trazabilidad.
// Lo comparten el servidor (que es el único que cambia estados) y el frontend (que los muestra).

// Estados de la sesión (columna sesiones_examen.estado).
export const SESION = {
  EN_CURSO: 'en-curso', // IN_PROGRESS
  ENTREGADO: 'entregado', // SUBMITTED (el alumno la envió, a mano o al llegar a cero)
  ENTREGADO_SISTEMA: 'entregado-sistema', // SUBMITTED (la envió el servidor al vencer la hora límite)
  SALIO_ENTREGO: 'salio-entrego', // VOLUNTARY_EXIT (botón SALIR)
  INCIDENTE: 'incidente', // INCIDENT (salió del modo restringido sin usar SALIR)
}

// Transiciones válidas. Las entregas y la salida voluntaria son definitivas; un incidente solo lo reanuda el profesor.
const TRANSICIONES = {
  [SESION.EN_CURSO]: [SESION.ENTREGADO, SESION.ENTREGADO_SISTEMA, SESION.SALIO_ENTREGO, SESION.INCIDENTE],
  [SESION.INCIDENTE]: [SESION.EN_CURSO],
}

export function puedeTransicionar(desde, hacia) {
  return (TRANSICIONES[desde] ?? []).includes(hacia)
}

export class TransicionInvalida extends Error {
  constructor(desde, hacia) {
    super(`Transición inválida: ${desde} → ${hacia}.`)
    this.desde = desde
    this.hacia = hacia
  }
}

export function assertTransicion(desde, hacia) {
  if (!puedeTransicionar(desde, hacia)) throw new TransicionInvalida(desde, hacia)
}

// Latido del alumno cada 2 s. Sin latido durante UMBRAL_LATIDO_MS, el servidor marca la sesión como incidente.
// El panel del profesor se actualiza cada 2 s: una pérdida real se ve en ≤ 10 s.
export const LATIDO_MS = 2000
export const UMBRAL_LATIDO_MS = 8000

// Señales técnicas de abandono (las detecta el navegador o el servidor) y su descripción.
export const SENALES = {
  FULLSCREEN_EXIT: 'salida de pantalla completa',
  VISIBILITY_HIDDEN: 'cambio de pestaña o ventana minimizada',
  WINDOW_BLUR: 'cambio de ventana (pérdida de foco)',
  PAGE_EXIT: 'cierre o recarga de la página',
  PAGE_RELOAD: 'el examen se abrió fuera de pantalla completa (recarga o nueva pestaña)',
  NAVIGATION: 'navegación fuera del examen',
  CONNECTION_LOST: 'pérdida de conexión',
  HEARTBEAT_TIMEOUT: 'se perdió la señal del dispositivo',
}

export const esSenal = (tipo) => Object.hasOwn(SENALES, tipo)

// Todos los tipos de evento de eventos_seguridad, con el texto que ve el profesor en la línea de tiempo.
export const EVENTOS = {
  EXAM_STARTED: 'Inicio del examen',
  RESTRICTED_MODE_ACCEPTED: 'Aceptó las reglas del modo restringido',
  FULLSCREEN_ENTERED: 'Pantalla completa activada',
  FULLSCREEN_EXIT: 'Señal: salida de pantalla completa',
  VISIBILITY_HIDDEN: 'Señal: cambio de pestaña o ventana minimizada',
  WINDOW_BLUR: 'Señal: cambio de ventana',
  PAGE_EXIT: 'Señal: cierre o recarga de la página',
  PAGE_RELOAD: 'Señal: examen abierto fuera de pantalla completa',
  NAVIGATION: 'Señal: navegación fuera del examen',
  CONNECTION_LOST: 'Señal: pérdida de conexión',
  HEARTBEAT_TIMEOUT: 'Señal perdida (sin latido del dispositivo)',
  INCIDENT: 'Incidente: examen bloqueado',
  VOLUNTARY_EXIT: 'Salió con SALIR y se entregó',
  NORMAL_SUBMISSION: 'Entregado',
  TIME_EXPIRED: 'Entregado por vencimiento del tiempo',
  RESUMED_BY_TEACHER: 'Reanudado por el profesor',
  RECONNECTED: 'Reconexión del dispositivo',
}

// Los cuatro estados del panel del profesor (más "No abrió"/"No completó" para quien no tiene sesión).
export const ESTADO_PANEL = {
  'en-curso': { label: 'En curso', className: 'chip pending' },
  entregado: { label: 'Entregado', className: 'chip published' },
  // Abrió y no envió: lo entregó el sistema al terminarse el tiempo, con lo último guardado.
  'entregado-sistema': { label: 'Entregado por sistema', className: 'chip' },
  'salio-entrego': { label: 'Salió y se entregó', className: 'chip exited' },
  incidente: { label: 'Incidente', className: 'chip incident' },
  'no-abrio': { label: 'No abrió', className: 'chip' },
  'no-completo': { label: 'No completó', className: 'chip incorrect' },
}
