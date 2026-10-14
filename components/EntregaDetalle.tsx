import RespuestaVista from "@/components/RespuestaVista";
import { TipoBadge } from "@/components/TipoPregunta";
import GeoGebraApplet from "@/components/tools/GeoGebraApplet";
import type { TipoConsigna } from "@/lib/correccion";
import type { Diagrama } from "@/lib/diagrama";
import { formatPuntaje } from "@/lib/format";

interface Props {
  consignas: {
    id: string;
    orden: number;
    texto: string;
    puntaje: number;
    respuesta: string;
    tipo?: TipoConsigna;
    opciones?: string[];
    opcionSeleccionada?: number | null;
    diagrama?: Diagrama | null;
  }[];
  habilitarEscritura: boolean;
  habilitarGeoGebra: boolean;
  geogebraState: string | null;
}

/** Muestra una entrega en modo solo lectura: preguntas, respuestas y gráfico de GeoGebra. */
export default function EntregaDetalle({ consignas, habilitarEscritura, habilitarGeoGebra, geogebraState }: Props) {
  return (
    <>
      <section aria-labelledby="respuestas-titulo">
        <div className="section-head">
          <h2 className="section-title" id="respuestas-titulo">
            Tus respuestas <span className="count">{consignas.length}</span>
          </h2>
        </div>
        <ol className="qcard-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {consignas.map((c) => (
            <li key={c.id} className="qcard" data-testid="respuesta-entregada">
              <div className="qcard-num" aria-hidden>
                {String(c.orden).padStart(2, "0")}
              </div>
              <div className="qcard-body">
                <div className="row">
                  <span className="sr-only">Pregunta {c.orden}.</span>
                  <TipoBadge tipo={c.tipo ?? "DESARROLLO"} />
                  <span className="small muted">{formatPuntaje(c.puntaje)}</span>
                </div>
                <p className="qcard-text pre-wrap">{c.texto}</p>
                <RespuestaVista
                  tipo={c.tipo}
                  texto={c.respuesta}
                  opciones={c.opciones}
                  opcionSeleccionada={c.opcionSeleccionada}
                  diagrama={c.diagrama}
                  habilitarEscritura={habilitarEscritura}
                />
              </div>
            </li>
          ))}
        </ol>
      </section>

      {habilitarGeoGebra && (
        <section className="card">
          <h2 className="section-title" style={{ marginBottom: "0.75rem" }}>
            Gráfico de GeoGebra
          </h2>
          {geogebraState ? (
            <GeoGebraApplet initialState={geogebraState} readOnly height={420} />
          ) : (
            <p className="muted">No se guardó ningún gráfico.</p>
          )}
        </section>
      )}
    </>
  );
}
