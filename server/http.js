// Respuestas JSON de la API. Todas llevan `serverNow` (la hora oficial) para que el cliente sincronice su reloj.

export class HttpError extends Error {
  constructor(status, mensaje, extra = {}) {
    super(mensaje)
    this.status = status
    this.extra = extra
  }
}

export function enviar(res, status, datos = {}) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify({ ...datos, serverNow: Date.now() }))
}

const LIMITE_BODY = 4 * 1024 * 1024

// En Vercel el body JSON ya viene parseado en req.body; en el servidor de desarrollo se lee del stream.
export async function leerBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}
  let texto = ''
  for await (const chunk of req) {
    texto += chunk
    if (texto.length > LIMITE_BODY) throw new HttpError(413, 'El pedido es demasiado grande.')
  }
  try {
    return texto ? JSON.parse(texto) : {}
  } catch {
    throw new HttpError(400, 'El pedido no es JSON válido.')
  }
}
