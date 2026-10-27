// Hora oficial: la del servidor. Cada respuesta de la API trae `serverNow` y acá se guarda junto con el
// reloj monotónico del navegador (performance.now), que no cambia si el alumno toca la hora del
// dispositivo. Antes de la primera respuesta (y en el servidor) es la hora local.

let base = null // { server, perf, rtt }

// `t0` y `t1` son performance.now() al mandar el pedido y al recibir la respuesta.
export function syncClock(serverNow, t0, t1) {
  const rtt = t1 - t0
  // Una muestra con mucha demora es poco precisa: se usa solo si es la primera o si la anterior es igual de mala.
  if (base && rtt > 1500 && rtt > base.rtt) return
  base = { server: serverNow + rtt / 2, perf: t1, rtt }
}

export function now() {
  return base ? base.server + (performance.now() - base.perf) : Date.now()
}
