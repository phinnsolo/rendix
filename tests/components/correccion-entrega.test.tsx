// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CorreccionEntrega from "@/components/profesor/CorreccionEntrega";
import type { EntregaProfesorDetalle } from "@/lib/services/profesor";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/tools/GeoGebraApplet", () => ({ default: () => null }));

const sinCorreccion = { puntajeSugerido: null, fuenteSugerencia: null, sugerenciaDetalle: null, puntajeObtenido: null, feedback: null };

const entrega: EntregaProfesorDetalle = {
  id: "e1",
  estado: "ENTREGADO",
  fechaInicio: new Date("2026-10-01T11:00:00Z"),
  fechaEntrega: new Date("2026-10-01T12:00:00Z"),
  geogebraState: null,
  notaTotal: null,
  puntajeMaximo: 9,
  feedbackGeneral: null,
  fechaCorreccion: null,
  alumno: { id: "a1", nombre: "Juan Pérez", email: "alumno1@test.com" },
  tema: null,
  examen: {
    id: "ex1",
    titulo: "TP",
    enunciado: "Enunciado",
    modo: "NORMAL",
    habilitarEscritura: true,
    habilitarCalculadora: false,
    habilitarGeoGebra: false,
  },
  consignas: [
    {
      id: "c1",
      orden: 1,
      texto: "¿Qué es un nodo interno?",
      puntaje: 3,
      tipo: "OPCION_MULTIPLE",
      opciones: ["Hoja", "Condición"],
      respuestaCorrecta: 1,
      criterio: null,
      respuesta: "",
      opcionSeleccionada: 0,
      diagrama: null,
      correccion: { ...sinCorreccion, puntajeSugerido: 0, fuenteSugerencia: "AUTOMATICA", sugerenciaDetalle: 'Incorrecta: eligió "Hoja".' },
    },
    {
      id: "c2",
      orden: 2,
      texto: "Construí el árbol",
      puntaje: 4,
      tipo: "DIAGRAMA",
      opciones: [],
      respuestaCorrecta: null,
      criterio: "Inicio → condición → 2 hojas",
      respuesta: "",
      opcionSeleccionada: null,
      diagrama: {
        version: 1,
        shapes: [{ id: "shape-1", type: "rectangle", x: 0, y: 0, width: 120, height: 60, text: "Inicio" }],
        connections: [],
      },
      correccion: sinCorreccion,
    },
    {
      id: "c3",
      orden: 3,
      texto: "Explicá",
      puntaje: 2,
      tipo: "DESARROLLO",
      opciones: [],
      respuestaCorrecta: null,
      criterio: null,
      respuesta: "Porque son legibles",
      opcionSeleccionada: null,
      diagrama: null,
      correccion: sinCorreccion,
    },
  ],
};

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.values(router).forEach((fn) => fn.mockReset());
});
afterEach(() => vi.unstubAllGlobals());

const irA = (user: ReturnType<typeof userEvent.setup>, n: number) =>
  user.click(screen.getByRole("button", { name: new RegExp(`^Pregunta ${n}:`) }));

describe("Corrección del profesor (interfaz)", () => {
  it("muestra pregunta por pregunta: enunciado, respuesta, correcta/criterio, máximo y corrección automática", async () => {
    const user = userEvent.setup();
    render(<CorreccionEntrega entrega={entrega} />);
    const c1 = screen.getByTestId("correccion-1");
    expect(within(c1).getByText("¿Qué es un nodo interno?")).toBeInTheDocument();
    expect(within(c1).getByText("Elegida por el alumno")).toBeInTheDocument();
    expect(within(c1).getByText(/Opción correcta: “Condición”/)).toBeInTheDocument();
    expect(within(c1).getByText(/Máximo: 3 puntos/)).toBeInTheDocument();
    const sugerencia = within(c1).getByTestId("sugerencia");
    expect(sugerencia).toHaveTextContent("Corrección automática");
    expect(sugerencia).toHaveTextContent("0 / 3");
    expect(sugerencia).toHaveTextContent("la nota final la decidís vos");
    // La sugerencia automática precarga el puntaje, que sigue siendo editable.
    expect(within(c1).getByLabelText(/Puntaje obtenido/)).toHaveValue(0);
    expect(screen.getByText("Pendiente de corrección")).toBeInTheDocument();

    await irA(user, 2);
    const c2 = screen.getByTestId("correccion-2");
    expect(within(c2).getByRole("img", { name: /Diagrama con 1 figuras/ })).toBeInTheDocument();
    expect(within(c2).getByText("Inicio → condición → 2 hojas")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Siguiente pregunta" }));
    expect(within(screen.getByTestId("correccion-3")).getByText("Porque son legibles")).toBeInTheDocument();
  });

  it("calcula la nota total automáticamente al asignar puntajes", async () => {
    const user = userEvent.setup();
    render(<CorreccionEntrega entrega={entrega} />);
    expect(screen.getByTestId("nota-total")).toHaveTextContent("0 / 9");
    await user.clear(screen.getByLabelText(/Puntaje obtenido/));
    await user.type(screen.getByLabelText(/Puntaje obtenido/), "1.5");
    await irA(user, 2);
    await user.type(screen.getByLabelText(/Puntaje obtenido/), "4");
    expect(screen.getByTestId("nota-total")).toHaveTextContent("5.5 / 9");
  });

  it("valida el máximo de cada pregunta y no envía", async () => {
    const user = userEvent.setup();
    render(<CorreccionEntrega entrega={entrega} />);
    await irA(user, 2);
    await user.type(screen.getByLabelText(/Puntaje obtenido/), "5");
    await user.click(screen.getByRole("button", { name: "Guardar corrección" }));
    expect(screen.getByText("El puntaje debe estar entre 0 y 4")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("guarda puntajes y feedback", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ entrega }), { status: 200 }));
    const user = userEvent.setup();
    render(<CorreccionEntrega entrega={entrega} />);
    await irA(user, 2);
    await user.type(screen.getByLabelText(/Puntaje obtenido/), "3");
    await user.type(screen.getByLabelText("Comentario para el alumno"), "Faltan etiquetas");
    await user.click(screen.getByRole("button", { name: "Guardar corrección" }));

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/profesor/entregas/e1/correccion");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({
      correcciones: [
        { consignaId: "c1", puntajeObtenido: 0, feedback: "" },
        { consignaId: "c2", puntajeObtenido: 3, feedback: "Faltan etiquetas" },
        { consignaId: "c3", puntajeObtenido: null, feedback: "" },
      ],
      feedbackGeneral: "",
      finalizar: false,
    });
    expect(screen.getByText("Corrección guardada.")).toBeInTheDocument();
  });

  it("finalizar exige todos los puntajes (marca las preguntas faltantes); con todo completo confirma y envía finalizar", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ entrega }), { status: 200 }));
    const user = userEvent.setup();
    render(<CorreccionEntrega entrega={entrega} />);

    await user.click(screen.getByRole("button", { name: "Finalizar corrección" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Finalizar corrección" }));
    // Lleva a la primera pregunta sin puntaje y marca las dos faltantes en la lista.
    expect(screen.getByTestId("correccion-2")).toBeInTheDocument();
    expect(screen.getByText("Asigná un puntaje para poder marcar como corregido")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pregunta 2: con error" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pregunta 3: con error" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Puntaje obtenido/), "4");
    await irA(user, 3);
    await user.type(screen.getByLabelText(/Puntaje obtenido/), "2");
    await user.click(screen.getByRole("button", { name: "Finalizar corrección" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("La nota final será 6 / 9");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Finalizar corrección" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).finalizar).toBe(true);
  });

  it("Aceptar sugerencia vuelve al puntaje automático después de modificarlo; Ignorar la oculta", async () => {
    const user = userEvent.setup();
    render(<CorreccionEntrega entrega={entrega} />);
    const input = screen.getByLabelText(/Puntaje obtenido/);
    await user.clear(input);
    await user.type(input, "2");
    await user.click(screen.getByRole("button", { name: "Aceptar sugerencia" }));
    expect(input).toHaveValue(0);
    expect(screen.getByText("Sugerencia aplicada")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ignorar" }));
    expect(screen.queryByTestId("sugerencia")).not.toBeInTheDocument();
    expect(input).toHaveValue(0);
  });

  it("navega entre alumnos y avisa si hay cambios sin guardar", async () => {
    const user = userEvent.setup();
    render(
      <CorreccionEntrega
        entrega={entrega}
        navegacion={{ posicion: 1, total: 2, anterior: null, siguiente: { href: "/siguiente", nombre: "María" }, volver: "/x" }}
      />,
    );
    expect(screen.getByText("Alumno 1 de 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anterior alumno" })).toBeDisabled();
    await irA(user, 2);
    await user.type(screen.getByLabelText(/Puntaje obtenido/), "1");
    await user.click(screen.getByRole("button", { name: "Siguiente alumno: María" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Tenés cambios sin guardar");
    await user.click(screen.getByRole("button", { name: "Salir sin guardar" }));
    expect(router.push).toHaveBeenCalledWith("/siguiente");
  });
});
