import { beforeEach, describe, expect, it } from "vitest";
import { POST as crear } from "@/app/api/profesor/examenes/route";
import { POST as enviar } from "@/app/api/alumno/examenes/[id]/entrega/route";
import { GET as detalleAlumno } from "@/app/api/alumno/examenes/[id]/route";
import { POST as iniciar } from "@/app/api/alumno/examenes/[id]/iniciar/route";
import { GET as listarEntregas } from "@/app/api/profesor/examenes/[id]/entregas/route";
import { GET as verEntrega } from "@/app/api/profesor/entregas/[entregaId]/route";
import { PUT as corregir } from "@/app/api/profesor/entregas/[entregaId]/correccion/route";
import type { Diagrama } from "@/lib/diagrama";
import { prisma } from "@/lib/prisma";
import { crearClaseDb, crearUsuarios, ctx, examenValido, req, resetDb, type Fixture } from "./helpers";

let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await crearUsuarios();
});

const ARBOL: Diagrama = {
  version: 1,
  shapes: [
    { id: "shape-1", type: "rectangle", x: 200, y: 50, width: 120, height: 60, text: "Inicio" },
    { id: "shape-2", type: "circle", x: 200, y: 180, width: 120, height: 120, text: "¿Edad >= 18?" },
    { id: "shape-3", type: "rectangle", x: 60, y: 360, width: 140, height: 60, text: "Mayor de edad" },
    { id: "shape-4", type: "rectangle", x: 320, y: 360, width: 140, height: 60, text: "Menor de edad" },
  ],
  connections: [
    { id: "connection-1", from: { shapeId: "shape-1" }, to: { shapeId: "shape-2" }, label: "" },
    { id: "connection-2", from: { shapeId: "shape-2" }, to: { shapeId: "shape-3" }, label: "Sí" },
    { id: "connection-3", from: { shapeId: "shape-2" }, to: { shapeId: "shape-4" }, label: "No" },
  ],
};

/** Examen publicado con los cuatro tipos de consigna, asignado a una clase con alumno1 y alumno2. */
async function examenMixto(profesorId = f.profesor.id) {
  const clase = await crearClaseDb(profesorId, [f.alumno1.id, f.alumno2.id]);
  return prisma.examen.create({
    data: {
      titulo: "Mixto",
      enunciado: "Enunciado",
      estado: "PUBLICADO",
      fechaPublicacion: new Date(),
      profesorId,
      habilitarEscritura: true,
      consignas: {
        create: [
          { orden: 1, puntaje: 2, tipo: "VERDADERO_FALSO", texto: "VF", opciones: ["Verdadero", "Falso"], respuestaCorrecta: 0 },
          { orden: 2, puntaje: 3, tipo: "OPCION_MULTIPLE", texto: "MC", opciones: ["A", "B", "C"], respuestaCorrecta: 2 },
          { orden: 3, puntaje: 4, tipo: "DIAGRAMA", texto: "Árbol", criterio: "Inicio → condición → 2 hojas" },
          { orden: 4, puntaje: 1, tipo: "DESARROLLO", texto: "Explicá" },
        ],
      },
      claseId: clase.id,
    },
    include: { consignas: { orderBy: { orden: "asc" } } },
  });
}

async function enviarComo(user: Fixture["alumno1"], examenId: string, body: unknown) {
  return enviar(await req("POST", "/", { user, body }), ctx({ id: examenId }));
}

/** alumno1: VF correcta, MC incorrecta, diagrama, texto. */
async function escenarioEntregado() {
  const examen = await examenMixto();
  const [vf, mc, diag, des] = examen.consignas;
  const res = await enviarComo(f.alumno1, examen.id, {
    respuestas: [
      { consignaId: vf.id, opcion: 0 },
      { consignaId: mc.id, opcion: 0 },
      { consignaId: diag.id, diagrama: ARBOL },
      { consignaId: des.id, texto: "Son fáciles de interpretar" },
    ],
  });
  expect(res.status).toBe(201);
  const { entrega } = await res.json();
  return { examen, entregaId: entrega.id as string, vf, mc, diag, des };
}

async function correccionComo(user: Fixture["profesor"], entregaId: string, body: unknown) {
  return corregir(await req("PUT", "/", { user, body }), ctx({ entregaId }));
}

describe("Tipos de consigna (creación)", () => {
  it("crea consignas de los cuatro tipos y normaliza V/F", async () => {
    const res = await crear(
      await req("POST", "/", {
        user: f.profesor,
        body: {
          ...examenValido(),
          consignas: [
            { texto: "VF", puntaje: 2, tipo: "VERDADERO_FALSO", respuestaCorrecta: 1, opciones: ["x"] },
            { texto: "MC", puntaje: 3, tipo: "OPCION_MULTIPLE", opciones: ["A", "B"], respuestaCorrecta: 1 },
            { texto: "Diagrama", puntaje: 4, tipo: "DIAGRAMA", criterio: "Árbol con dos hojas", respuestaCorrecta: 0 },
            { texto: "Desarrollo", puntaje: 1 },
          ],
        },
      }),
    );
    expect(res.status).toBe(201);
    const { examen } = await res.json();
    const cs = examen.consignas;
    expect(cs[0]).toMatchObject({ tipo: "VERDADERO_FALSO", opciones: ["Verdadero", "Falso"], respuestaCorrecta: 1 });
    expect(cs[1]).toMatchObject({ tipo: "OPCION_MULTIPLE", opciones: ["A", "B"], respuestaCorrecta: 1 });
    expect(cs[2]).toMatchObject({ tipo: "DIAGRAMA", opciones: [], respuestaCorrecta: null, criterio: "Árbol con dos hojas" });
    expect(cs[3]).toMatchObject({ tipo: "DESARROLLO", opciones: [], respuestaCorrecta: null, criterio: null });
  });

  it("opción múltiple inválida rechazada (400): menos de 2 opciones, opción vacía o sin correcta", async () => {
    const intentar = async (consigna: object) =>
      (await crear(await req("POST", "/", { user: f.profesor, body: { ...examenValido(), consignas: [consigna] } }))).status;
    expect(await intentar({ texto: "MC", puntaje: 1, tipo: "OPCION_MULTIPLE", opciones: ["A"], respuestaCorrecta: 0 })).toBe(400);
    expect(await intentar({ texto: "MC", puntaje: 1, tipo: "OPCION_MULTIPLE", opciones: ["A", " "], respuestaCorrecta: 0 })).toBe(400);
    expect(await intentar({ texto: "MC", puntaje: 1, tipo: "OPCION_MULTIPLE", opciones: ["A", "B"], respuestaCorrecta: 5 })).toBe(400);
    expect(await intentar({ texto: "VF", puntaje: 1, tipo: "VERDADERO_FALSO" })).toBe(400);
    expect(await intentar({ texto: "X", puntaje: 1, tipo: "INVENTADO" })).toBe(400);
  });

  it("un examen solo con consignas de diagrama no necesita herramientas", async () => {
    const res = await crear(
      await req("POST", "/", {
        user: f.profesor,
        body: {
          ...examenValido(),
          habilitarEscritura: false,
          habilitarCalculadora: false,
          habilitarGeoGebra: false,
          consignas: [{ texto: "Árbol", puntaje: 5, tipo: "DIAGRAMA" }],
        },
      }),
    );
    expect(res.status).toBe(201);
  });

  it("el alumno recibe tipo y opciones, pero NUNCA la respuesta correcta ni el criterio", async () => {
    const examen = await examenMixto();
    // Las consignas recién se envían cuando el alumno comienza el examen.
    expect((await iniciar(await req("POST", "/", { user: f.alumno1 }), ctx({ id: examen.id }))).status).toBe(200);
    const data = (await (await detalleAlumno(await req("GET", "/", { user: f.alumno1 }), ctx({ id: examen.id }))).json()).examen;
    expect(data.consignas[1]).toEqual({ id: examen.consignas[1].id, orden: 2, texto: "MC", puntaje: 3, tipo: "OPCION_MULTIPLE", opciones: ["A", "B", "C"] });
    const json = JSON.stringify(data);
    expect(json).not.toContain("respuestaCorrecta");
    expect(json).not.toContain("criterio");
  });
});

describe("Entrega con consignas tipadas", () => {
  it("guarda la opción elegida, la estructura completa del diagrama y la sugerencia automática", async () => {
    const { entregaId, vf, mc, diag, des } = await escenarioEntregado();
    const rs = await prisma.respuesta.findMany({ where: { entregaId } });
    const por = Object.fromEntries(rs.map((r) => [r.consignaId, r]));

    expect(por[vf.id]).toMatchObject({ opcionSeleccionada: 0, puntajeSugerido: 2, fuenteSugerencia: "AUTOMATICA", puntajeObtenido: null });
    expect(por[mc.id]).toMatchObject({ opcionSeleccionada: 0, puntajeSugerido: 0, fuenteSugerencia: "AUTOMATICA" });
    expect(por[mc.id].sugerenciaDetalle).toContain('Respuesta correcta: "C"');
    // El diagrama se reconstruye exactamente igual (estructura, no imagen).
    expect(por[diag.id].diagrama).toEqual(ARBOL);
    expect(por[diag.id].puntajeSugerido).toBeNull();
    expect(por[des.id]).toMatchObject({ texto: "Son fáciles de interpretar", puntajeSugerido: null });
  });

  it("el alumno ve su diagrama y su opción después de entregar", async () => {
    const { examen, diag, vf } = await escenarioEntregado();
    const data = (await (await detalleAlumno(await req("GET", "/", { user: f.alumno1 }), ctx({ id: examen.id }))).json()).examen;
    expect(data.entrega.respuestas).toContainEqual({ consignaId: diag.id, texto: "", diagrama: ARBOL });
    expect(data.entrega.respuestas).toContainEqual({ consignaId: vf.id, texto: "", opcionSeleccionada: 0 });
  });

  it("respuestas que no corresponden al tipo de la consigna → 400", async () => {
    const examen = await examenMixto();
    const [vf, mc, diag] = examen.consignas;
    expect((await enviarComo(f.alumno1, examen.id, { respuestas: [{ consignaId: vf.id, texto: "Verdadero" }] })).status).toBe(400);
    expect((await enviarComo(f.alumno1, examen.id, { respuestas: [{ consignaId: mc.id, opcion: 7 }] })).status).toBe(400);
    expect((await enviarComo(f.alumno1, examen.id, { respuestas: [{ consignaId: diag.id, opcion: 0 }] })).status).toBe(400);
    expect((await enviarComo(f.alumno1, examen.id, { respuestas: [{ consignaId: mc.id, diagrama: ARBOL }] })).status).toBe(400);
    expect(await prisma.entrega.count()).toBe(0);
  });

  it("diagrama inválido → 400 (conexión a figura inexistente, ids repetidos, tipo de figura desconocido)", async () => {
    const examen = await examenMixto();
    const diag = examen.consignas[2];
    const conDiagrama = (d: unknown) => enviarComo(f.alumno1, examen.id, { respuestas: [{ consignaId: diag.id, diagrama: d }] });
    expect(
      (await conDiagrama({ ...ARBOL, connections: [{ id: "c", from: { shapeId: "nope" }, to: { x: 1, y: 2 }, label: "" }] })).status,
    ).toBe(400);
    expect((await conDiagrama({ ...ARBOL, shapes: [ARBOL.shapes[0], ARBOL.shapes[0]], connections: [] })).status).toBe(400);
    expect((await conDiagrama({ ...ARBOL, shapes: [{ ...ARBOL.shapes[0], type: "triangle" }], connections: [] })).status).toBe(400);
    expect(await prisma.entrega.count()).toBe(0);
  });

  it("consignas sin responder quedan con sugerencia 0 (opciones) y diagrama vacío", async () => {
    const examen = await examenMixto();
    await enviarComo(f.alumno1, examen.id, { respuestas: [] });
    const rs = await prisma.respuesta.findMany({ include: { consigna: true } });
    const vf = rs.find((r) => r.consigna.tipo === "VERDADERO_FALSO")!;
    expect(vf).toMatchObject({ opcionSeleccionada: null, puntajeSugerido: 0 });
    expect(rs.find((r) => r.consigna.tipo === "DIAGRAMA")!.diagrama).toBeNull();
  });
});

describe("Corrección del profesor", () => {
  it("el profesor ve pregunta por pregunta: respuesta, correcta/criterio, máximo y sugerencia", async () => {
    const { entregaId } = await escenarioEntregado();
    const data = (await (await verEntrega(await req("GET", "/", { user: f.profesor }), ctx({ entregaId }))).json()).entrega;
    expect(data.estado).toBe("ENTREGADO"); // pendiente de corrección
    expect(data.puntajeMaximo).toBe(10);
    const [vf, mc, diag, des] = data.consignas;
    expect(vf).toMatchObject({ tipo: "VERDADERO_FALSO", puntaje: 2, respuestaCorrecta: 0, opcionSeleccionada: 0 });
    expect(vf.correccion).toMatchObject({ puntajeSugerido: 2, fuenteSugerencia: "AUTOMATICA", puntajeObtenido: null });
    expect(mc.correccion.puntajeSugerido).toBe(0);
    expect(diag).toMatchObject({ tipo: "DIAGRAMA", criterio: "Inicio → condición → 2 hojas", diagrama: ARBOL });
    expect(des.respuesta).toBe("Son fáciles de interpretar");
  });

  it("guardar corrección parcial: EN_CORRECCION y nota total = suma de puntajes asignados", async () => {
    const { entregaId, vf, diag } = await escenarioEntregado();
    const res = await correccionComo(f.profesor, entregaId, {
      correcciones: [
        { consignaId: vf.id, puntajeObtenido: 2, feedback: "Bien" },
        { consignaId: diag.id, puntajeObtenido: 3.5, feedback: "Falta etiquetar una rama" },
      ],
    });
    expect(res.status).toBe(200);
    const data = (await res.json()).entrega;
    expect(data.estado).toBe("EN_CORRECCION");
    expect(data.notaTotal).toBe(5.5);
    expect(data.fechaCorreccion).toBeNull();
    expect(data.consignas[2].correccion).toMatchObject({ puntajeObtenido: 3.5, feedback: "Falta etiquetar una rama" });
  });

  it("el profesor puede modificar un puntaje automático (la sugerencia se conserva aparte)", async () => {
    const { entregaId, mc } = await escenarioEntregado();
    await correccionComo(f.profesor, entregaId, {
      correcciones: [{ consignaId: mc.id, puntajeObtenido: 1.5, feedback: "Razonamiento parcialmente correcto" }],
    });
    const r = await prisma.respuesta.findFirstOrThrow({ where: { entregaId, consignaId: mc.id } });
    expect(r).toMatchObject({ puntajeSugerido: 0, fuenteSugerencia: "AUTOMATICA", puntajeObtenido: 1.5 });
  });

  it("marcar como corregido exige puntaje en todas las consignas (400)", async () => {
    const { entregaId, vf } = await escenarioEntregado();
    const res = await correccionComo(f.profesor, entregaId, {
      correcciones: [{ consignaId: vf.id, puntajeObtenido: 2 }],
      finalizar: true,
    });
    expect(res.status).toBe(400);
    expect((await prisma.entrega.findUniqueOrThrow({ where: { id: entregaId } })).estado).toBe("ENTREGADO");
  });

  it("marcar como corregido: CORREGIDO, fecha, nota total y todo queda guardado para consultarse", async () => {
    const { entregaId, vf, mc, diag, des } = await escenarioEntregado();
    const res = await correccionComo(f.profesor, entregaId, {
      correcciones: [
        { consignaId: vf.id, puntajeObtenido: 2, feedback: null },
        { consignaId: mc.id, puntajeObtenido: 0, feedback: "Repasar nodos internos" },
        { consignaId: diag.id, puntajeObtenido: 4, feedback: "Excelente árbol" },
        { consignaId: des.id, puntajeObtenido: 0.75, feedback: "" },
      ],
      feedbackGeneral: "Buen trabajo",
      finalizar: true,
    });
    expect(res.status).toBe(200);

    // Se vuelve a consultar más tarde
    const data = (await (await verEntrega(await req("GET", "/", { user: f.profesor }), ctx({ entregaId }))).json()).entrega;
    expect(data.estado).toBe("CORREGIDO");
    expect(data.notaTotal).toBe(6.75);
    expect(data.feedbackGeneral).toBe("Buen trabajo");
    expect(data.fechaCorreccion).not.toBeNull();
    expect(data.consignas.map((c: { correccion: { puntajeObtenido: number; feedback: string | null } }) => [c.correccion.puntajeObtenido, c.correccion.feedback])).toEqual([
      [2, null],
      [0, "Repasar nodos internos"],
      [4, "Excelente árbol"],
      [0.75, null],
    ]);
    expect(data.consignas[2].diagrama).toEqual(ARBOL);

    // El listado de entregas refleja estado y nota
    const { examen } = await prisma.entrega.findUniqueOrThrow({ where: { id: entregaId }, include: { examen: true } });
    const { entregas } = await (await listarEntregas(await req("GET", "/", { user: f.profesor }), ctx({ id: examen.id }))).json();
    const fila = entregas.find((e: { alumno: { id: string } }) => e.alumno.id === f.alumno1.id);
    expect(fila).toMatchObject({ entregado: true, estado: "CORREGIDO", notaTotal: 6.75 });
    const pendiente = entregas.find((e: { alumno: { id: string } }) => e.alumno.id === f.alumno2.id);
    expect(pendiente).toMatchObject({ entregado: false, estado: null, notaTotal: null });
  });

  it("se puede volver a editar una corrección terminada", async () => {
    const { entregaId, vf, mc, diag, des } = await escenarioEntregado();
    const todas = (p: number) => [vf, mc, diag, des].map((c) => ({ consignaId: c.id, puntajeObtenido: Math.min(p, c.puntaje) }));
    await correccionComo(f.profesor, entregaId, { correcciones: todas(1), finalizar: true });
    const res = await correccionComo(f.profesor, entregaId, { correcciones: todas(2), finalizar: true });
    expect((await res.json()).entrega).toMatchObject({ estado: "CORREGIDO", notaTotal: 7 });
  });

  it("puntaje mayor al máximo de la consigna o negativo → 400", async () => {
    const { entregaId, vf } = await escenarioEntregado();
    const mayor = await correccionComo(f.profesor, entregaId, { correcciones: [{ consignaId: vf.id, puntajeObtenido: 2.5 }] });
    expect(mayor.status).toBe(400);
    expect((await mayor.json()).detalles[0].campo).toBe("correcciones.0.puntajeObtenido");
    const negativo = await correccionComo(f.profesor, entregaId, { correcciones: [{ consignaId: vf.id, puntajeObtenido: -1 }] });
    expect(negativo.status).toBe(400);
  });

  it("consigna de otro examen → 400", async () => {
    const { entregaId } = await escenarioEntregado();
    const otro = await examenMixto();
    const res = await correccionComo(f.profesor, entregaId, {
      correcciones: [{ consignaId: otro.consignas[0].id, puntajeObtenido: 1 }],
    });
    expect(res.status).toBe(400);
  });

  it("solo el profesor dueño puede corregir: otro profesor 403, alumno 403, inexistente 404", async () => {
    const { entregaId, vf } = await escenarioEntregado();
    const body = { correcciones: [{ consignaId: vf.id, puntajeObtenido: 2 }] };
    expect((await correccionComo(f.profesor2, entregaId, body)).status).toBe(403);
    expect((await correccionComo(f.alumno1, entregaId, body)).status).toBe(403);
    expect((await correccionComo(f.profesor, "nope", body)).status).toBe(404);
    expect((await prisma.respuesta.findFirstOrThrow({ where: { entregaId, consignaId: vf.id } })).puntajeObtenido).toBeNull();
  });

  it("el alumno no recibe notas ni feedback en su vista", async () => {
    const { examen, entregaId, vf } = await escenarioEntregado();
    await correccionComo(f.profesor, entregaId, { correcciones: [{ consignaId: vf.id, puntajeObtenido: 2, feedback: "Secreto" }] });
    const json = JSON.stringify(await (await detalleAlumno(await req("GET", "/", { user: f.alumno1 }), ctx({ id: examen.id }))).json());
    expect(json).not.toContain("puntajeObtenido");
    expect(json).not.toContain("Secreto");
  });

  it("la base rechaza un puntaje obtenido fuera de rango (CHECK constraint)", async () => {
    const { entregaId, vf } = await escenarioEntregado();
    await expect(
      prisma.respuesta.update({
        where: { entregaId_consignaId: { entregaId, consignaId: vf.id } },
        data: { puntajeObtenido: 11 },
      }),
    ).rejects.toThrow();
  });
});
