import { useEffect, useRef } from 'react'

// Diálogo modal de confirmación (reemplaza a window.confirm, que en el examen sacaría el foco de la página).
// `tono`: 'danger' para acciones definitivas (botón rojo).
export default function ConfirmDialog({ abierto, titulo, children, confirmar, cancelar = 'Cancelar', tono = 'primary', ocupado = false, onConfirmar, onCancelar }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (abierto && !dialog.open) dialog.showModal()
    if (!abierto && dialog.open) dialog.close()
  }, [abierto])

  return (
    <dialog
      ref={ref}
      className={`confirm-dialog ${tono}`}
      aria-labelledby="confirm-dialog-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!ocupado) onCancelar()
      }}
    >
      <h2 id="confirm-dialog-title">{titulo}</h2>
      <div className="confirm-dialog-body">{children}</div>
      <div className="actions confirm-dialog-actions">
        <button type="button" className="secondary" onClick={onCancelar} disabled={ocupado}>{cancelar}</button>
        <button type="button" className={tono === 'danger' ? 'solid-danger' : ''} onClick={onConfirmar} disabled={ocupado}>
          {confirmar}
        </button>
      </div>
    </dialog>
  )
}
