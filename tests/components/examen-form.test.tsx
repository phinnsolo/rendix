// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExamenForm from "@/components/profesor/ExamenForm";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const clases = [
  { id: "c1", nombre: "Clase 1", alumnos: 32 },
  { id: "c2", nombre: "Clase 2", alumnos: 28 },
];
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.values(router).forEach((fn) => fn.mockReset());
});
afterEach(() => vi.unstubAllGlobals());

const PUNTAJE = /^Puntaje \(0 a 10\)/;

describe("US2 - Formulario de examen (validación en frontend)", () => {
  it("muestra errores visibles, lleva a la sección con errores y no envía datos inválidos", async () => {
    const user = userEvent.setup();
    render(<ExamenForm clases={clases} />);
    await user.click(screen.getByRole("button", { name: /^Pregunta 1:/ }));
    await user.type(screen.getByLabelText(PUNTAJE), "11");
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));

    // Resumen navegable con un mensaje por sección.
    expect(screen.getByRole("alert")).toHaveTextContent("Revisá los campos marcados antes de guardar.");
    expect(screen.getAllByText("El título es obligatorio").length).toBeGreaterThan(0);
    expect(screen.getAllByText("El enunciado es obligatorio").length).toBeGreaterThan(0);
    expect(screen.getAllByText("El texto de la consigna es obligatorio").length).toBeGreaterThan(0);
    // La pregunta con errores queda marcada en la estructura; al abrirla se ve el error del puntaje.
    await user.click(screen.getByRole("button", { name: /^Pregunta 1: .*con errores/ }));
    expect(screen.getByText("El puntaje debe estar entre 0 y 10")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no permite guardar sin preguntas", async () => {
    const user = userEvent.setup();
    render(<ExamenForm clases={clases} />);
    await user.type(screen.getByLabelText(/Título del examen/), "T");
    await user.type(screen.getByLabelText(/Instrucciones/), "E");
    await user.click(screen.getByRole("button", { name: "Eliminar pregunta 1" }));
    expect(screen.queryAllByTestId("pregunta-item")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(screen.getAllByText("El examen debe tener al menos una consigna").length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("eliminar una pregunta con contenido pide confirmación", async () => {
    const user = userEvent.setup();
    render(<ExamenForm clases={clases} />);
    await user.click(screen.getByRole("button", { name: /^Pregunta 1:/ }));
    await user.type(screen.getByLabelText(/Enunciado de la pregunta/), "Algo");
    await user.click(screen.getByRole("button", { name: "Eliminar pregunta 1" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("¿Eliminar esta pregunta?");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    expect(screen.getAllByTestId("pregunta-item")).toHaveLength(1);
  });

  it("agrega preguntas eligiendo el tipo, elige herramientas, clase, fecha y duración, y envía el borrador", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ examen: { id: "nuevo" } }), { status: 201 }));
    const user = userEvent.setup();
    render(<ExamenForm clases={clases} />);

    await user.type(screen.getByLabelText(/Título del examen/), "Parcial");
    await user.type(screen.getByLabelText(/Instrucciones/), "Instrucciones");
    for (let i = 0; i < 2; i++) {
      await user.click(screen.getByRole("button", { name: "Agregar pregunta" }));
      expect(screen.getByRole("dialog")).toHaveTextContent("¿Qué tipo de pregunta querés crear?");
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Desarrollo/ }));
    }
    expect(screen.getAllByTestId("pregunta-item")).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Eliminar pregunta 3" }));
    expect(screen.getAllByTestId("pregunta-item")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /^Pregunta 1:/ }));
    await user.type(screen.getByLabelText(/Enunciado de la pregunta/), "Uno");
    await user.type(screen.getByLabelText(PUNTAJE), "4");
    await user.click(screen.getByRole("button", { name: "Siguiente pregunta" }));
    await user.type(screen.getByLabelText(/Enunciado de la pregunta/), "Dos");
    await user.type(screen.getByLabelText(PUNTAJE), "6");

    await user.click(screen.getByRole("button", { name: /Configuración del examen/ }));
    await user.click(screen.getByLabelText(/Calculadora/));
    await user.click(screen.getByLabelText(/GeoGebra/));
    await user.selectOptions(screen.getByLabelText("Asignar a"), "c1");
    await user.type(screen.getByLabelText(/^Fecha/), "2026-10-15");
    await user.type(screen.getByLabelText(/^Hora/), "10:00");
    await user.type(screen.getByLabelText(/Duración/), "60");

    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/profesor/examenes/nuevo?guardado=1"));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/profesor/examenes");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      titulo: "Parcial",
      enunciado: "Instrucciones",
      modo: "NORMAL",
      habilitarEscritura: true,
      habilitarCalculadora: true,
      habilitarGeoGebra: true,
      // Consignas de desarrollo (tipo por defecto), normalizadas por el esquema compartido.
      consignas: [
        { texto: "Uno", puntaje: 4, tipo: "DESARROLLO", opciones: [], respuestaCorrecta: null, criterio: null },
        { texto: "Dos", puntaje: 6, tipo: "DESARROLLO", opciones: [], respuestaCorrecta: null, criterio: null },
      ],
      temas: [],
      claseId: "c1",
      fechaDisponible: new Date("2026-10-15T10:00").toISOString(),
      duracionMinutos: 60,
    });
  });

  it("reordena preguntas con los controles de la estructura", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ examen: { id: "x" } }), { status: 201 }));
    const user = userEvent.setup();
    render(<ExamenForm clases={clases} />);
    await user.click(screen.getByRole("button", { name: "Agregar pregunta" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Verdadero \/ Falso/ }));
    expect(screen.getByRole("button", { name: /^Pregunta 2: Verdadero \/ Falso/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Subir pregunta 2" }));
    expect(screen.getByRole("button", { name: /^Pregunta 1: Verdadero \/ Falso/ })).toBeInTheDocument();
  });
});

describe("Editor de examen por temas", () => {
  it("al pasar a 'por temas' las preguntas existentes van al Tema 1; se agregan temas con sus preguntas", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ examen: { id: "tp" } }), { status: 201 }));
    const user = userEvent.setup();
    render(<ExamenForm clases={clases} />);
    await user.type(screen.getByLabelText(/Título del examen/), "TP Final");
    await user.type(screen.getByLabelText(/Instrucciones/), "Elegí un tema");
    await user.click(screen.getByLabelText(/Examen por temas/));

    // Tema 1 con la pregunta que ya existía.
    expect(screen.getAllByTestId("tema-item")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /^Tema 1/ }));
    await user.type(screen.getByLabelText(/^Título\s*\(opcional\)/), "Inteligencia Artificial");
    await user.click(screen.getByRole("button", { name: /^Pregunta 1:/ }));
    await user.type(screen.getByLabelText(/Enunciado de la pregunta/), "Pregunta IA");
    await user.type(screen.getByLabelText(PUNTAJE), "10");

    // Tema 2 nuevo, con su propia pregunta.
    await user.click(screen.getByRole("button", { name: "Agregar tema" }));
    expect(screen.getByTestId("tema-edit")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Título\s*\(opcional\)/), "Blockchain");
    expect(screen.queryAllByTestId("pregunta-item")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Agregar preguntas" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Desarrollo/ }));
    await user.type(screen.getByLabelText(/Enunciado de la pregunta/), "Pregunta Blockchain");
    await user.type(screen.getByLabelText(PUNTAJE), "8");

    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.modo).toBe("POR_TEMAS");
    expect(body.consignas).toEqual([]);
    expect(body.temas.map((t: { nombre: string; titulo: string; consignas: { texto: string }[] }) => [t.nombre, t.titulo, t.consignas.map((c) => c.texto)])).toEqual([
      ["Tema 1", "Inteligencia Artificial", ["Pregunta IA"]],
      ["Tema 2", "Blockchain", ["Pregunta Blockchain"]],
    ]);
  });

  it("un tema sin preguntas no se puede guardar y se marca con error", async () => {
    const user = userEvent.setup();
    render(<ExamenForm clases={clases} />);
    await user.type(screen.getByLabelText(/Título del examen/), "TP");
    await user.type(screen.getByLabelText(/Instrucciones/), "E");
    await user.click(screen.getByLabelText(/Examen por temas/));
    await user.click(screen.getByRole("button", { name: /^Eliminar pregunta 1/ }));
    await user.click(screen.getByRole("button", { name: "Guardar borrador" }));
    expect(screen.getAllByText("El tema debe tener al menos una consigna").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^Tema 1 \(con errores\)/ })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
