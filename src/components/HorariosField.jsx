import { TURNOS } from '../config.js'
import { isValidDuracion } from '../examSettings.js'
import { formatHorario, rangoInicio, sumarMinutos, validateHorario } from '../turnosStore.js'
import { fechaHoraLocal, horasDeInicio, instante } from '../turnos.js'
import { now } from '../clock.js'

// Fecha de hoy en la zona horaria de la app, como la usa <input type="date">.
function hoy() {
  return fechaHoraLocal(now()).fecha
}

const HORA = /^\d{2}:\d{2}$/

// '8:30', '8.30' o '830' → '08:30'. Si no se entiende, la deja como está (la validación avisa).
function normalizarHora(texto) {
  const m = texto.trim().match(/^(\d{1,2})[:.]?(\d{2})$/)
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return texto.trim()
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

export function nuevoHorario(turno = '') {
  return { key: crypto.randomUUID(), turno, fecha: '', horaInicio: '' }
}

// Turnos en los que se toma el parcial: uno de los turnos fijos, la fecha y la hora de inicio.
// La hora de inicio se habilita recién con la duración y el turno, y solo acepta horarios que
// terminen dentro del turno. Los que ya empezaron se muestran sin poder cambiarlos.
// `value` son filas { key, id?, turno, fecha, horaInicio, bloqueado? }; `errores` va alineado con ellas.
// Las filas nuevas empiezan con `turnoPorDefecto` (el turno de la clase).
export default function HorariosField({ value, onChange, duracion, errores = [], turnoPorDefecto = '' }) {
  function update(key, changes) {
    onChange(value.map((h) => (h.key === key ? { ...h, ...changes } : h)))
  }

  return (
    <fieldset className="tools-selector horarios">
      <legend>Turno</legend>
      <p className="muted small">
        Elegí en qué turno se toma, el día y a qué hora empieza. Termina a la hora de inicio más la duración.
      </p>
      {value.map((h, index) => {
        if (h.bloqueado) {
          return (
            <div key={h.key} className="card horario horario-locked">
              <span className="muted small">{formatHorario(h)} · Ya empezó: no se puede modificar.</span>
            </div>
          )
        }
        const conDuracion = isValidDuracion(duracion)
        const rango = rangoInicio(h.turno, duracion)
        // Opciones de la lista: cada 15 min dentro del rango; si el día es hoy, solo las que todavía no pasaron.
        const opciones = horasDeInicio(h.turno, duracion).filter((hora) => !h.fecha || instante(h.fecha, hora).getTime() > now())
        const habilitada = rango !== null
        // Mientras se completa, se avisa en vivo si la hora elegida se pasa del turno o si la duración no entra
        // (el formato recién se controla al guardar, para no marcar error mientras se escribe).
        const enVivo = conDuracion && h.turno && (HORA.test(h.horaInicio) || !rango) ? validateHorario(h, duracion).horaInicio : null
        const error = errores[index] ?? {}
        const errorInicio = error.horaInicio ?? enVivo
        let hint
        if (!conDuracion) hint = 'Indicá primero la duración del parcial.'
        else if (!h.turno) hint = 'Elegí primero el turno.'
        else if (HORA.test(h.horaInicio)) hint = `Termina a las ${sumarMinutos(h.horaInicio, duracion)}.`
        else hint = `Entre las ${rango.desde} y las ${rango.hasta}.`

        return (
          <div key={h.key} className="card horario">
            <div className="form-row">
              <label>
                Turno
                <select
                  value={h.turno}
                  onChange={(e) => update(h.key, { turno: e.target.value, horaInicio: '' })}
                  aria-invalid={error.turno ? true : undefined}
                >
                  <option value="" disabled>Elegí un turno</option>
                  {Object.entries(TURNOS).map(([key, t]) => (
                    <option key={key} value={key}>{t.nombre} ({t.inicio} a {t.fin})</option>
                  ))}
                </select>
                {error.turno && <span className="field-error">{error.turno}</span>}
              </label>
              <label>
                Fecha
                <input
                  type="date"
                  min={hoy()}
                  value={h.fecha}
                  onChange={(e) => update(h.key, { fecha: e.target.value })}
                  aria-invalid={error.fecha ? true : undefined}
                />
                {error.fecha && <span className="field-error">{error.fecha}</span>}
              </label>
              <label>
                Hora de inicio
                {/* Un solo campo: se escribe la hora o se elige de la lista que despliega (cada 15 min). */}
                <input
                  type="text"
                  list={`horas-${h.key}`}
                  placeholder={habilitada ? `Ej: ${rango.desde}` : 'HH:MM'}
                  autoComplete="off"
                  value={h.horaInicio}
                  disabled={!habilitada}
                  onChange={(e) => update(h.key, { horaInicio: e.target.value })}
                  onBlur={(e) => update(h.key, { horaInicio: normalizarHora(e.target.value) })}
                  aria-invalid={errorInicio ? true : undefined}
                />
                <datalist id={`horas-${h.key}`}>
                  {opciones.map((hora) => <option key={hora} value={hora} />)}
                </datalist>
                {errorInicio
                  ? <span className="field-error">{errorInicio}</span>
                  : hint && <span className="muted hint">{hint}</span>}
              </label>
            </div>
            {value.length > 1 && (
              <button
                type="button"
                className="link-button danger-link"
                onClick={() => {
                  const asignados = h.alumnos?.length ?? 0
                  if (asignados > 0 && !window.confirm(`Este turno tiene ${asignados} alumno(s) asignado(s). ¿Quitarlo igual?`)) return
                  onChange(value.filter((x) => x.key !== h.key))
                }}
              >
                Quitar este turno
              </button>
            )}
          </div>
        )
      })}
      <button type="button" className="secondary horario-add" onClick={() => onChange([...value, nuevoHorario(turnoPorDefecto)])}>
        + Asignar otro turno
      </button>
    </fieldset>
  )
}
