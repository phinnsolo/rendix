// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResolverExamen, { claveBorrador, type ExamenParaResolver } from "@/components/alumno/ResolverExamen";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// GeoGebra se carga desde internet: en los tests se reemplaza por un stub.
vi.mock("@/components/tools/GeoGebraApplet", () => ({
  default: () => <div data-testid="geogebra-stub">GeoGebra</div>,
}));

const base: ExamenParaResolver = {
  id: "ex1",
  titulo: "Parcial",
  enunciado: "Resolvé",
  profesor: "Laura",
  habilitarEscritura: true,
  habilitarCalculadora: true,
  habilitarGeoGebra: true,
  consignas: [
    { id: "c1", orden: 1, texto: "Primera consigna", puntaje: 5 },
    { id: "c2", orden: 2, texto: "Segunda consigna", puntaje: 5 },
  ],
};

const fetchMock = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.values(router).forEach((fn) => fn.mockReset());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("US5 - Herramientas visibles", () => {
  it("muestra las tres herramientas cuando están habilitadas", async () => {
    render(<ResolverExamen examen={base} userId="u1" />);
    expect(screen.getByTestId("herramienta-escritura")).toBeInTheDocument();
    expect(screen.getByTestId("herramienta-calculadora")).toBeInTheDocument();
    expect(screen.getByTestId("herramienta-geogebra")).toBeInTheDocument();
    expect(await screen.findByTestId("geogebra-stub")).toBeInTheDocument();
  });

  it("solo calculadora: no muestra escritura ni GeoGebra", () => {
    render(
      <ResolverExamen
        examen={{ ...base, habilitarEscritura: false, habilitarGeoGebra: false }}
        userId="u1"
      />,
    );
    expect(screen.queryByTestId("herramienta-escritura")).not.toBeInTheDocument();
    expect(screen.queryByTestId("herramienta-geogebra")).not.toBeInTheDocument();
    expect(screen.getByTestId("herramienta-calculadora")).toBeInTheDocument();
  });

  it("solo escritura: no muestra calculadora ni GeoGebra", () => {
    render(
      <ResolverExamen examen={{ ...base, habilitarCalculadora: false, habilitarGeoGebra: false }} userId="u1" />,
    );
    expect(screen.getByTestId("herramienta-escritura")).toBeInTheDocument();
    expect(screen.queryByTestId("herramienta-calculadora")).not.toBeInTheDocument();
    expect(screen.queryByTestId("herramienta-geogebra")).not.toBeInTheDocument();
  });
});

describe("US5 - Escritura", () => {
  it("las respuestas no se pierden al cambiar de consigna y se respaldan en localStorage", async () => {
    const user = userEvent.setup();
    render(<ResolverExamen examen={base} userId="u1" />);

    await user.type(screen.getByLabelText("Tu respuesta"), "Respuesta A");
    await user.click(screen.getByRole("tab", { name: /Pregunta 2/ }));
    expect(screen.getByText("Segunda consigna")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Tu respuesta"), "Respuesta B");

    await user.click(screen.getByRole("tab", { name: /Pregunta 1/ }));
    expect(screen.getByLabelText("Tu respuesta")).toHaveValue("Respuesta A");
    await user.click(screen.getByRole("button", { name: /Siguiente/ }));
    expect(screen.getByLabelText("Tu respuesta")).toHaveValue("Respuesta B");

    const guardado = JSON.parse(window.localStorage.getItem(claveBorrador("u1", "ex1"))!);
    expect(guardado.respuestas).toEqual({ c1: "Respuesta A", c2: "Respuesta B" });
  });

  it("recupera las respuestas guardadas localmente al volver a abrir", async () => {
    window.localStorage.setItem(
      claveBorrador("u1", "ex1"),
      JSON.stringify({ respuestas: { c1: "Guardada" }, geogebraState: null, actualizado: "" }),
    );
    render(<ResolverExamen examen={base} userId="u1" />);
    await waitFor(() => expect(screen.getByLabelText("Tu respuesta")).toHaveValue("Guardada"));
    expect(screen.getByText(/Recuperamos las respuestas/)).toBeInTheDocument();
  });
});

describe("US6 - Envío con confirmación", () => {
  it("Entregar muestra el modal con el resumen; Cancelar no envía nada", async () => {
    const user = userEvent.setup();
    render(<ResolverExamen examen={base} userId="u1" />);
    await user.click(screen.getByRole("button", { name: "Entregar examen" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Respondiste 0 de 2 preguntas.");
    expect(screen.getByRole("dialog")).toHaveTextContent("Una vez entregado no vas a poder modificarlo.");

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Confirmar envío manda las respuestas y limpia el respaldo local", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ entrega: { id: "e1" } }), { status: 201 }));
    const user = userEvent.setup();
    render(<ResolverExamen examen={base} userId="u1" />);
    await user.type(screen.getByLabelText("Tu respuesta"), "Final");

    await user.click(screen.getByRole("button", { name: "Entregar examen" }));
    await user.click(screen.getByRole("button", { name: "Confirmar envío" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/alumno/examenes/ex1?enviado=1"));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/alumno/examenes/ex1/entrega");
    expect(JSON.parse(init.body)).toEqual({
      respuestas: [
        { consignaId: "c1", texto: "Final" },
        { consignaId: "c2", texto: "" },
      ],
      geogebraState: null,
    });
    expect(window.localStorage.getItem(claveBorrador("u1", "ex1"))).toBeNull();
  });

  it("si falla la conexión NO se borran las respuestas y se puede reintentar", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<ResolverExamen examen={base} userId="u1" />);
    await user.type(screen.getByLabelText("Tu respuesta"), "No perder");

    await user.click(screen.getByRole("button", { name: "Entregar examen" }));
    await user.click(screen.getByRole("button", { name: "Confirmar envío" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/podés reintentar/);
    expect(screen.getByLabelText("Tu respuesta")).toHaveValue("No perder");
    expect(JSON.parse(window.localStorage.getItem(claveBorrador("u1", "ex1"))!).respuestas.c1).toBe("No perder");

    // Reintento exitoso
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ entrega: { id: "e1" } }), { status: 201 }));
    await user.click(screen.getByRole("button", { name: "Entregar examen" }));
    await user.click(screen.getByRole("button", { name: "Confirmar envío" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
  });

  it("consignas de opciones y de diagrama: se responden, se guardan localmente y se envían con su tipo", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ entrega: { id: "e1" } }), { status: 201 }));
    const user = userEvent.setup();
    const examen: ExamenParaResolver = {
      ...base,
      habilitarCalculadora: false,
      habilitarGeoGebra: false,
      consignas: [
        { id: "vf", orden: 1, texto: "Afirmación", puntaje: 2, tipo: "VERDADERO_FALSO", opciones: ["Verdadero", "Falso"] },
        { id: "dg", orden: 2, texto: "Construí el árbol", puntaje: 4, tipo: "DIAGRAMA", opciones: [] },
        { id: "ds", orden: 3, texto: "Explicá", puntaje: 2, tipo: "DESARROLLO", opciones: [] },
      ],
    };
    render(<ResolverExamen examen={examen} userId="u1" />);

    await user.click(screen.getByLabelText("Falso"));
    await user.click(screen.getByRole("tab", { name: /Pregunta 2/ }));
    expect(screen.getByTestId("respuesta-diagrama")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Rectángulo/ }));
    await user.type(screen.getByLabelText("Texto de la figura"), "Inicio");

    // Cambiar de consigna y volver no pierde el diagrama ni la opción
    await user.click(screen.getByRole("tab", { name: /Pregunta 1/ }));
    expect(screen.getByLabelText("Falso")).toBeChecked();
    await user.click(screen.getByRole("tab", { name: /Pregunta 2/ }));
    expect(screen.getByText("Inicio")).toBeInTheDocument();

    const local = JSON.parse(window.localStorage.getItem(claveBorrador("u1", "ex1"))!);
    expect(local.opciones).toEqual({ vf: 1 });
    expect(local.diagramas.dg.shapes[0]).toMatchObject({ type: "rectangle", text: "Inicio" });

    await user.click(screen.getByRole("button", { name: "Entregar examen" }));
    await user.click(screen.getByRole("button", { name: "Confirmar envío" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.respuestas[0]).toEqual({ consignaId: "vf", opcion: 1 });
    expect(body.respuestas[1].consignaId).toBe("dg");
    expect(body.respuestas[1].diagrama.shapes[0]).toMatchObject({ type: "rectangle", text: "Inicio" });
    expect(body.respuestas[2]).toEqual({ consignaId: "ds", texto: "" });
  });

  it("un refresh no pierde el diagrama: se recupera del respaldo local", async () => {
    window.localStorage.setItem(
      claveBorrador("u1", "ex1"),
      JSON.stringify({
        respuestas: {},
        geogebraState: null,
        diagramas: {
          dg: {
            version: 1,
            shapes: [{ id: "shape-1", type: "circle", x: 10, y: 10, width: 100, height: 100, text: "¿Edad >= 18?" }],
            connections: [],
          },
        },
        actualizado: "",
      }),
    );
    render(
      <ResolverExamen
        examen={{ ...base, consignas: [{ id: "dg", orden: 1, texto: "Árbol", puntaje: 4, tipo: "DIAGRAMA", opciones: [] }] }}
        userId="u1"
      />,
    );
    expect(await screen.findByText("¿Edad >= 18?")).toBeInTheDocument();
    expect(screen.getByText(/Recuperamos las respuestas/)).toBeInTheDocument();
  });

  it("si el servidor responde 500 tampoco se pierden las respuestas", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Error interno del servidor" }), { status: 500 }));
    const user = userEvent.setup();
    render(<ResolverExamen examen={base} userId="u1" />);
    await user.type(screen.getByLabelText("Tu respuesta"), "Algo");
    await user.click(screen.getByRole("button", { name: "Entregar examen" }));
    await user.click(screen.getByRole("button", { name: "Confirmar envío" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Error interno del servidor");
    expect(window.localStorage.getItem(claveBorrador("u1", "ex1"))).not.toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("marcar para revisar se refleja en el navegador y se respalda localmente", async () => {
    const user = userEvent.setup();
    render(<ResolverExamen examen={base} userId="u1" />);
    await user.click(screen.getByRole("button", { name: "Marcar para revisar" }));
    expect(screen.getByRole("tab", { name: /Pregunta 1, sin responder, marcada para revisar/ })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Tu respuesta"), "Algo");
    expect(screen.getByRole("tab", { name: /Pregunta 1, respondida, marcada para revisar/ })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(claveBorrador("u1", "ex1"))!).marcadas).toEqual(["c1"]);
  });
});
