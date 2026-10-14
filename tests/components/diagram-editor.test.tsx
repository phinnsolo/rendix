// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DiagramEditor from "@/components/tools/DiagramEditor";
import { diagramaSchema, type Diagrama } from "@/lib/diagrama";

// En jsdom el lienzo no tiene tamaño real: el editor usa 800 x height. Como al abrir un diagrama
// existente la vista se ajusta (zoom + desplazamiento), las coordenadas del diagrama se convierten
// a coordenadas de pantalla leyendo la transformación real del lienzo.
function aPantalla(x: number, y: number) {
  const g = screen.getByTestId("diagram-editor").querySelector("svg > g")!;
  const m = g.getAttribute("transform")!.match(/scale\(([-\d.e]+)\) translate\(([-\d.e]+) ([-\d.e]+)\)/)!;
  const [z, tx, ty] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return { clientX: (x + tx) * z, clientY: (y + ty) * z };
}

const ultimo = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)![0] as Diagrama;

function base(): Diagrama {
  return {
    version: 1,
    shapes: [
      { id: "shape-1", type: "rectangle", x: 100, y: 100, width: 100, height: 50, text: "Inicio" },
      { id: "shape-2", type: "circle", x: 400, y: 100, width: 100, height: 100, text: "¿Edad >= 18?" },
    ],
    connections: [],
  };
}

describe("Editor de diagramas", () => {
  it("agrega círculos, rectángulos y textos desde la barra de herramientas", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DiagramEditor onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Círculo/ }));
    await user.click(screen.getByRole("button", { name: /Rectángulo/ }));
    await user.click(screen.getByRole("button", { name: /Texto/ }));

    const d = ultimo(onChange);
    expect(d.shapes.map((s) => [s.id, s.type])).toEqual([
      ["shape-1", "circle"],
      ["shape-2", "rectangle"],
      ["shape-3", "text"],
    ]);
    // La estructura emitida siempre es válida para el backend.
    expect(diagramaSchema.safeParse(d).success).toBe(true);
  });

  it("edita el texto de la figura seleccionada", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DiagramEditor onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /Rectángulo/ }));
    const input = screen.getByLabelText("Texto de la figura");
    await user.type(input, "Mayor de edad");
    expect(ultimo(onChange).shapes[0].text).toBe("Mayor de edad");
    expect(screen.getByTestId("shape-shape-1")).toHaveTextContent("Mayor de edad");
  });

  it("deshacer y rehacer (botones y teclado); escribir un texto cuenta como un solo paso", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DiagramEditor onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /Círculo/ }));
    await user.type(screen.getByLabelText("Texto de la figura"), "Hola");
    await user.click(screen.getByRole("button", { name: /Rectángulo/ }));
    expect(ultimo(onChange).shapes).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: /Deshacer/ }));
    expect(ultimo(onChange).shapes).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /Deshacer/ }));
    expect(ultimo(onChange).shapes[0].text).toBe("");
    await user.click(screen.getByRole("button", { name: /Rehacer/ }));
    expect(ultimo(onChange).shapes[0].text).toBe("Hola");

    screen.getByTestId("diagram-editor").focus();
    await user.keyboard("{Control>}z{/Control}");
    expect(ultimo(onChange).shapes[0].text).toBe("");
    await user.keyboard("{Control>}y{/Control}");
    expect(ultimo(onChange).shapes[0].text).toBe("Hola");
  });

  it("elimina con el botón y con la tecla Supr, junto con sus líneas", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const inicial: Diagrama = {
      ...base(),
      connections: [{ id: "connection-1", from: { shapeId: "shape-1" }, to: { shapeId: "shape-2" }, label: "" }],
    };
    render(<DiagramEditor value={inicial} onChange={onChange} />);

    fireEvent.pointerDown(screen.getByTestId("shape-shape-1").firstChild as Element, aPantalla(150, 120));
    fireEvent.pointerUp(screen.getByLabelText("Lienzo del diagrama"), aPantalla(150, 120));
    await user.click(screen.getByRole("button", { name: /Eliminar/ }));
    expect(ultimo(onChange).shapes.map((s) => s.id)).toEqual(["shape-2"]);
    expect(ultimo(onChange).connections).toEqual([]);

    fireEvent.pointerDown(screen.getByTestId("shape-shape-2").firstChild as Element, aPantalla(450, 150));
    fireEvent.pointerUp(screen.getByLabelText("Lienzo del diagrama"), aPantalla(450, 150));
    fireEvent.keyDown(screen.getByTestId("diagram-editor"), { key: "Delete" });
    expect(ultimo(onChange).shapes).toEqual([]);
  });

  it("mueve una figura arrastrándola", () => {
    const onChange = vi.fn();
    render(<DiagramEditor value={base()} onChange={onChange} />);
    const lienzo = screen.getByLabelText("Lienzo del diagrama");
    fireEvent.pointerDown(screen.getByTestId("shape-shape-1").firstChild as Element, aPantalla(150, 120));
    fireEvent.pointerMove(lienzo, aPantalla(200, 170));
    fireEvent.pointerUp(lienzo, aPantalla(200, 170));
    expect(ultimo(onChange).shapes[0]).toMatchObject({ x: 150, y: 150, width: 100, height: 50 });
  });

  it("redimensiona una figura desde su esquina", () => {
    const onChange = vi.fn();
    const { container } = render(<DiagramEditor value={base()} onChange={onChange} />);
    const lienzo = screen.getByLabelText("Lienzo del diagrama");
    fireEvent.pointerDown(screen.getByTestId("shape-shape-1").firstChild as Element, aPantalla(150, 120));
    fireEvent.pointerUp(lienzo, aPantalla(150, 120));
    const esquina = container.querySelector('[data-kind="handle"][data-corner="se"]')!;
    fireEvent.pointerDown(esquina, aPantalla(200, 150));
    fireEvent.pointerMove(lienzo, aPantalla(260, 190));
    fireEvent.pointerUp(lienzo, aPantalla(260, 190));
    expect(ultimo(onChange).shapes[0]).toMatchObject({ x: 100, y: 100, width: 160, height: 90 });
  });

  it("conecta dos figuras con la herramienta Línea y etiqueta la línea", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DiagramEditor value={base()} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /Línea/ }));
    const lienzo = screen.getByLabelText("Lienzo del diagrama");
    fireEvent.pointerDown(lienzo, aPantalla(150, 125));
    fireEvent.pointerMove(lienzo, aPantalla(300, 140));
    fireEvent.pointerUp(lienzo, aPantalla(450, 150));

    expect(ultimo(onChange).connections).toEqual([
      { id: "connection-1", from: { shapeId: "shape-1" }, to: { shapeId: "shape-2" }, label: "" },
    ]);
    await user.type(screen.getByLabelText("Etiqueta de la línea"), "Sí");
    expect(ultimo(onChange).connections[0].label).toBe("Sí");
    expect(within(screen.getByTestId("connection-connection-1")).getByText("Sí")).toBeInTheDocument();
  });

  it("mueve el extremo de una línea: suelto en el vacío queda libre, sobre una figura queda anclado", () => {
    const onChange = vi.fn();
    const inicial: Diagrama = {
      ...base(),
      connections: [{ id: "connection-1", from: { shapeId: "shape-1" }, to: { x: 300, y: 300 }, label: "" }],
    };
    const { container } = render(<DiagramEditor value={inicial} onChange={onChange} />);
    const lienzo = screen.getByLabelText("Lienzo del diagrama");
    fireEvent.pointerDown(screen.getByTestId("connection-connection-1").firstChild as Element, aPantalla(250, 200));
    fireEvent.pointerUp(lienzo, aPantalla(250, 200));

    const extremo = () => container.querySelector('[data-kind="endpoint"][data-end="to"]')!;
    fireEvent.pointerDown(extremo(), aPantalla(300, 300));
    fireEvent.pointerMove(lienzo, aPantalla(320, 330));
    fireEvent.pointerUp(lienzo, aPantalla(320, 330));
    expect(ultimo(onChange).connections[0].to).toEqual({ x: 320, y: 330 });

    fireEvent.pointerDown(extremo(), aPantalla(320, 330));
    fireEvent.pointerMove(lienzo, aPantalla(450, 150));
    fireEvent.pointerUp(lienzo, aPantalla(450, 150));
    expect(ultimo(onChange).connections[0].to).toEqual({ shapeId: "shape-2" });
  });

  it("zoom con los botones", async () => {
    const user = userEvent.setup();
    render(<DiagramEditor />);
    await user.click(screen.getByRole("button", { name: "Acercar" }));
    expect(screen.getByRole("button", { name: "Zoom al 100%" })).toHaveTextContent("120%");
    await user.click(screen.getByRole("button", { name: "Alejar" }));
    await user.click(screen.getByRole("button", { name: "Alejar" }));
    expect(screen.getByRole("button", { name: "Zoom al 100%" })).toHaveTextContent("83%");
  });

  it("modo lectura: reconstruye el diagrama, sin herramientas de edición y sin modificarlo", async () => {
    const onChange = vi.fn();
    const inicial: Diagrama = {
      ...base(),
      connections: [{ id: "connection-1", from: { shapeId: "shape-1" }, to: { shapeId: "shape-2" }, label: "Sí" }],
    };
    render(<DiagramEditor value={inicial} readOnly onChange={onChange} expandible />);
    expect(screen.getByRole("img", { name: "Diagrama con 2 figuras y 1 conexiones" })).toBeInTheDocument();
    expect(screen.getByText("Inicio")).toBeInTheDocument();
    expect(screen.getByText("¿Edad >= 18?")).toBeInTheDocument();
    expect(screen.getByText("Sí")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Círculo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Eliminar/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajustar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ampliar" })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId("shape-shape-1").firstChild as Element, aPantalla(150, 120));
    fireEvent.keyDown(screen.getByTestId("diagram-editor"), { key: "Delete" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
