// Única función de Vercel: todas las rutas /api/* llegan acá (ver vercel.json) y las resuelve server/router.js.
import { handle } from '../server/router.js'

export default handle
