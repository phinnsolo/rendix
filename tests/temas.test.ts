import { beforeEach, describe, expect, it } from "vitest";
import { POST as crear } from "@/app/api/profesor/examenes/route";
import { PUT as editar } from "@/app/api/profesor/examenes/[id]/route";
import { POST as publicar } from "@/app/api/profesor/examenes/[id]/publicar/route";
import { GET as temasProfesor } from "@/app/api/profesor/examenes/[id]/temas/route";
import { GET as listarEntregas } from "@/app/api/profesor/examenes/[id]/entregas/route";
import { GET as verEntrega } from "@/app/api/profesor/entregas/[entregaId]/route";
import { PUT as corregir } from "@/app/api/profesor/entregas/[entregaId]/correccion/route";
import { GET as resultadosRuta } from "@/app/api/profesor/examenes/[id]/route";
import { GET as detalleAlumno } from "@/app/api/alumno/examenes/[id]/route";
import { GET as listarAlumno } from "@/app/api/alumno/examenes/route";
import { PUT as elegirTema } from "@/app/api/alumno/examenes/[id]/tema/route";
import { POST as iniciar } from "@/app/api/alumno/examenes/[id]/iniciar/route";
import { PUT as guardar } from "@/app/api/alumno/examenes/[id]/respuestas/route";
import { POST as entregar } from "@/app/api/alumno/examenes/[id]/entrega/route";
import { prisma } from "@/lib/prisma";
import { resultadosExamen } from "@/lib/services/panel";
import { crearClaseDb, crearExamenDb, crearUsuarios, ctx, examenPorTemasValido, req, resetDb, type Fixture } from "./helpers";

let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await crearUsuarios();
});

type Usuario = Fixture["alumno1"];
type TemaDb = { id: string; nombre: string; consignas: { id: string; texto: string }[] };

/** Examen POR_TEMAS publicado, asignado a una clase con los tres alumnos. */
async function escenario(nombreClase = "Clase 1") {
  const clase = await crearClaseDb(f.profesor.id, [f.alumno1.id, f.alumno2.id, f.alumno3.id], nombreClase);
  const res = await crear(await req("POST", "/", { user: f.profesor, body: examenPorTemasValido(clase.id) }));
  expect(res.status).toBe(201);
  const { examen } = await res.json();
  expect((await publicar(await req("POST", "/", { user: f.profesor }), ctx({ id: examen.id }))).status).toBe(200);
  const { temas } = (await (await temasProfesor(await req("GET", "/", { user: f.profesor }), ctx({ id: examen.id }))).json()) as { temas: TemaDb[] };
  return { examenId: examen.id as string, clase, temas };
}

const elegir = async (u: Usuario, examenId: string, temaId: string) =>
  elegirTema(await req("PUT", "/", { user: u, body: { temaId } }), ctx({ id: examenId }));
const comenzar = async (u: Usuario, examenId: string) => iniciar(await req("POST", "/", { user: u }), ctx({ id: examenId }));
const detalle = async (u: Usuario, examenId: string) =>
  (await (await detalleAlumno(await req("GET", "/", { user: u }), ctx({ id: examenId }))).json()).examen;
const entregarComo = async (u: Usuario, examenId: string, respuestas: unknown[] = []) =>
  entregar(await req("POST", "/", { user: u, body: { respuestas } }), ctx({ id: examenId }));
const guardarComo = async (u: Usuario, examenId: string, respuestas: unknown[]) =>
  guardar(await req("PUT", "/", { user: u, body: { respuestas } }), ctx({ id: examenId }));

describe("Creación de exámenes por temas", () => {
  it("crea temas con sus propias consignas; las consignas quedan asociadas a su tema", async () => {
    const { temas } = await escenario();
    expect(temas.map((t) => [t.nombre, t.consignas.map((c) => c.texto)])).toEqual([
      ["Tema 1", ["T1 - Pregunta 1", "T1 - Pregunta 2"]],
      ["Tema 2", ["T2 - Pregunta 1"]],
      ["Tema 3", ["T3 - Pregunta 1", "T3 - Pregunta 2"]],
    ]);
  });

  it("validaciones: tema sin consignas, consignas sueltas, nombres repetidos (400)", async () => {
    const base = examenPorTemasValido();
    const intentar = async (body: object) => (await crear(await req("POST", "/", { user: f.profesor, body }))).status;
    expect(await intentar({ ...base, temas: [{ nombre: "Tema 1", consignas: [] }] })).toBe(400);
    expect(await intentar({ ...base, temas: [] })).toBe(400);
    expect(await intentar({ ...base, consignas: [{ texto: "Suelta", puntaje: 1 }] })).toBe(400);
    expect(await intentar({ ...base, temas: [base.temas[0], { ...base.temas[1], nombre: "tema 1" }] })).toBe(400);
    // Un examen normal no puede traer temas.
    expect(await intentar({ ...base, modo: "NORMAL", consignas: [{ texto: "X", puntaje: 1 }] })).toBe(400);
    expect(await prisma.examen.count()).toBe(0);
  });

  it("publicar exige al menos 2 temas (400)", async () => {
    const clase = await crearClaseDb(f.profesor.id);
    const base = examenPorTemasValido(clase.id);
    const { examen } = await (await crear(await req("POST", "/", { user: f.profesor, body: { ...base, temas: [base.temas[0]] } }))).json();
    const res = await publicar(await req("POST", "/", { user: f.profesor }), ctx({ id: examen.id }));
    expect(res.status).toBe(400);
  });

  it("editar el borrador reemplaza, reordena y elimina temas", async () => {
    const base = examenPorTemasValido();
    const { examen } = await (await crear(await req("POST", "/", { user: f.profesor, body: base }))).json();
    const res = await editar(
      await req("PUT", "/", { user: f.profesor, body: { ...base, temas: [base.temas[2], base.temas[0]] } }),
      ctx({ id: examen.id }),
    );
    expect(res.status).toBe(200);
    const editado = (await res.json()).examen;
    expect(editado.temas.map((t: { nombre: string; orden: number }) => [t.orden, t.nombre])).toEqual([
      [1, "Tema 3"],
      [2, "Tema 1"],
    ]);
    expect(await prisma.tema.count()).toBe(2);
    expect(await prisma.consigna.count()).toBe(4);
  });
});

describe("Integridad de datos (base)", () => {
  it("una consigna no puede apuntar a un tema de otro examen (FK compuesta)", async () => {
    const { temas } = await escenario();
    const otro = await crearExamenDb(f.profesor.id);
    await expect(
      prisma.consigna.create({ data: { examenId: otro.id, temaId: temas[0].id, texto: "x", puntaje: 1, orden: 9 } }),
    ).rejects.toThrow();
  });

  it("una entrega no puede tener un tema de otro examen (FK compuesta)", async () => {
    const { temas } = await escenario();
    const otro = await crearExamenDb(f.profesor.id);
    await expect(
      prisma.entrega.create({ data: { examenId: otro.id, alumnoId: f.alumno1.id, temaId: temas[0].id } }),
    ).rejects.toThrow();
  });

  it("EN_CURSO ⇔ sin fecha de entrega (CHECK constraint)", async () => {
    const { examenId } = await escenario();
    await expect(prisma.entrega.create({ data: { examenId, alumnoId: f.alumno1.id, estado: "EN_CURSO" } })).rejects.toThrow();
    await expect(
      prisma.entrega.create({ data: { examenId, alumnoId: f.alumno1.id, estado: "ENTREGADO", fechaEntrega: null } }),
    ).rejects.toThrow();
  });
});

describe("Experiencia del alumno (casos 4 a 8)", () => {
  it("CASO 4: examen normal, todos responden las mismas preguntas", async () => {
    const examen = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id, f.alumno2.id] });
    for (const u of [f.alumno1, f.alumno2]) {
      expect((await comenzar(u, examen.id)).status).toBe(200);
      expect((await detalle(u, examen.id)).consignas.map((c: { id: string }) => c.id)).toEqual(examen.consignas.map((c) => c.id));
    }
  });

  it("antes de elegir no se envía ninguna consigna; solo los temas para elegir", async () => {
    const { examenId } = await escenario();
    const data = await detalle(f.alumno1, examenId);
    expect(data.modo).toBe("POR_TEMAS");
    expect(data.temas.map((t: { nombre: string; preguntas: number }) => [t.nombre, t.preguntas])).toEqual([
      ["Tema 1", 2],
      ["Tema 2", 1],
      ["Tema 3", 2],
    ]);
    expect(data.consignas).toEqual([]);
    expect(JSON.stringify(data)).not.toContain("T1 - Pregunta");
  });

  it("CASO 5: cada alumno ve SOLO las preguntas de su tema (numeradas desde 1)", async () => {
    const { examenId, temas } = await escenario();
    expect((await elegir(f.alumno1, examenId, temas[0].id)).status).toBe(200);
    expect((await elegir(f.alumno2, examenId, temas[2].id)).status).toBe(200);
    await comenzar(f.alumno1, examenId);
    await comenzar(f.alumno2, examenId);

    const a = await detalle(f.alumno1, examenId);
    expect(a.tema).toMatchObject({ nombre: "Tema 1", titulo: "Inteligencia Artificial" });
    expect(a.consignas.map((c: { orden: number; texto: string }) => [c.orden, c.texto])).toEqual([
      [1, "T1 - Pregunta 1"],
      [2, "T1 - Pregunta 2"],
    ]);
    const b = await detalle(f.alumno2, examenId);
    expect(b.consignas.map((c: { texto: string }) => c.texto)).toEqual(["T3 - Pregunta 1", "T3 - Pregunta 2"]);
    expect(JSON.stringify(b)).not.toContain("T1 - Pregunta");
  });

  it("CASO 6: eligió Tema 2 pero no comenzó → puede cambiarlo (sigue habiendo una sola entrega)", async () => {
    const { examenId, temas } = await escenario();
    await elegir(f.alumno1, examenId, temas[1].id);
    const res = await elegir(f.alumno1, examenId, temas[0].id);
    expect(res.status).toBe(200);
    const entregas = await prisma.entrega.findMany({ where: { examenId, alumnoId: f.alumno1.id } });
    expect(entregas).toHaveLength(1);
    expect(entregas[0]).toMatchObject({ temaId: temas[0].id, estado: "EN_CURSO", fechaInicio: null, fechaEntrega: null });
  });

  it("CASO 7: después de comenzar (o de guardar respuestas) el tema queda bloqueado (409)", async () => {
    const { examenId, temas } = await escenario();
    await elegir(f.alumno1, examenId, temas[1].id);
    expect((await comenzar(f.alumno1, examenId)).status).toBe(200);
    expect((await guardarComo(f.alumno1, examenId, [{ consignaId: temas[1].consignas[0].id, texto: "Avance" }])).status).toBe(200);
    const res = await elegir(f.alumno1, examenId, temas[0].id);
    expect(res.status).toBe(409);
    expect((await prisma.entrega.findFirstOrThrow({ where: { alumnoId: f.alumno1.id } })).temaId).toBe(temas[1].id);
    // El avance quedó guardado en el servidor.
    expect((await detalle(f.alumno1, examenId)).entrega.respuestas).toContainEqual({ consignaId: temas[1].consignas[0].id, texto: "Avance" });
  });

  it("CASO 8: entregó Tema 2 → no puede elegir otro tema, ni comenzar, ni volver a entregar", async () => {
    const { examenId, temas } = await escenario();
    await elegir(f.alumno1, examenId, temas[1].id);
    await comenzar(f.alumno1, examenId);
    const res = await entregarComo(f.alumno1, examenId, [{ consignaId: temas[1].consignas[0].id, texto: "Mi respuesta" }]);
    expect(res.status).toBe(201);

    expect((await elegir(f.alumno1, examenId, temas[0].id)).status).toBe(409);
    expect((await comenzar(f.alumno1, examenId)).status).toBe(409);
    expect((await guardarComo(f.alumno1, examenId, [])).status).toBe(409);
    expect((await entregarComo(f.alumno1, examenId)).status).toBe(409);
    const entregas = await prisma.entrega.findMany({ where: { examenId, alumnoId: f.alumno1.id } });
    expect(entregas).toHaveLength(1);
    expect(entregas[0]).toMatchObject({ estado: "ENTREGADO", temaId: temas[1].id });
    // Solo existen respuestas para las consignas del tema elegido.
    const rs = await prisma.respuesta.findMany({ where: { entregaId: entregas[0].id } });
    expect(rs.map((r) => r.consignaId)).toEqual([temas[1].consignas[0].id]);
  });

  it("no puede entregar sin elegir tema, ni responder consignas de otro tema (backend)", async () => {
    const { examenId, temas } = await escenario();
    expect((await entregarComo(f.alumno1, examenId)).status).toBe(409);
    await elegir(f.alumno1, examenId, temas[0].id);
    await comenzar(f.alumno1, examenId);
    const ajena = await entregarComo(f.alumno1, examenId, [{ consignaId: temas[2].consignas[0].id, texto: "Otro tema" }]);
    expect(ajena.status).toBe(400);
    expect((await ajena.json()).error).toBe("Hay respuestas para consignas que no corresponden al tema elegido");
    expect((await guardarComo(f.alumno1, examenId, [{ consignaId: temas[2].consignas[0].id, texto: "x" }])).status).toBe(400);
  });

  it("no se puede elegir un tema de otro examen ni comenzar sin elegir tema", async () => {
    const primero = await escenario();
    // El segundo escenario pasa a los alumnos a "Clase 2": su examen es el accesible.
    const { examenId } = await escenario("Clase 2");
    expect((await elegir(f.alumno1, examenId, primero.temas[0].id)).status).toBe(400);
    expect(await prisma.entrega.count()).toBe(0);
    expect((await comenzar(f.alumno1, examenId)).status).toBe(409);
  });

  it("elecciones simultáneas: una sola entrega por alumno y examen", async () => {
    const { examenId, temas } = await escenario();
    const codigos = await Promise.all(temas.map((t) => elegir(f.alumno1, examenId, t.id).then((r) => r.status)));
    expect(codigos.every((c) => c === 200)).toBe(true);
    expect(await prisma.entrega.count({ where: { examenId, alumnoId: f.alumno1.id } })).toBe(1);
  });

  it("un examen por temas aparece en la lista con su tema una vez elegido", async () => {
    const { examenId, temas } = await escenario();
    await elegir(f.alumno1, examenId, temas[1].id);
    const { examenes } = await (await listarAlumno(await req("GET", "/", { user: f.alumno1 }))).json();
    expect(examenes[0]).toMatchObject({ id: examenId, modo: "POR_TEMAS", entregado: false, tema: { nombre: "Tema 2" } });
  });
});

describe("Permisos entre alumnos", () => {
  it("un alumno no ve la entrega ni el tema de otro, ni puede cambiarlo", async () => {
    const { examenId, temas } = await escenario();
    await elegir(f.alumno1, examenId, temas[0].id);
    await comenzar(f.alumno1, examenId);
    await guardarComo(f.alumno1, examenId, [{ consignaId: temas[0].consignas[0].id, texto: "Secreto de Juan" }]);

    const otro = await detalle(f.alumno2, examenId);
    expect(otro.entrega).toBeNull();
    expect(otro.tema).toBeNull();
    expect(JSON.stringify(otro)).not.toContain("Secreto de Juan");
    // Su elección solo afecta a su propia entrega.
    await elegir(f.alumno2, examenId, temas[2].id);
    expect((await prisma.entrega.findFirstOrThrow({ where: { alumnoId: f.alumno1.id } })).temaId).toBe(temas[0].id);
  });

  it("un alumno de otra clase no puede elegir tema ni comenzar (403)", async () => {
    const { examenId, temas } = await escenario();
    await crearClaseDb(f.profesor.id, [f.alumno3.id]); // alumno3 se va a otra clase
    expect((await elegir(f.alumno3, examenId, temas[0].id)).status).toBe(403);
    expect((await comenzar(f.alumno3, examenId)).status).toBe(403);
  });
});

describe("Entregas y corrección por tema (profesor)", () => {
  async function conEntregas() {
    const esc = await escenario();
    const { examenId, temas } = esc;
    await elegir(f.alumno1, examenId, temas[0].id);
    await entregarComo(f.alumno1, examenId, [
      { consignaId: temas[0].consignas[0].id, texto: "Respuesta IA" },
      { consignaId: temas[0].consignas[1].id, opcion: 0 },
    ]);
    await elegir(f.alumno2, examenId, temas[2].id);
    await comenzar(f.alumno2, examenId);
    const entrega1 = await prisma.entrega.findFirstOrThrow({ where: { alumnoId: f.alumno1.id } });
    return { ...esc, entrega1 };
  }

  it("la lista muestra tema y estado de cada alumno (incluye no entregados y en curso)", async () => {
    const { examenId } = await conEntregas();
    const { entregas } = await (await listarEntregas(await req("GET", "/", { user: f.profesor }), ctx({ id: examenId }))).json();
    const filas = entregas.map((e: { alumno: { nombre: string }; tema: { nombre: string } | null; estado: string | null; entregaId: string | null; puntajeMaximo: number }) => [
      e.alumno.nombre,
      e.tema?.nombre ?? null,
      e.estado,
      Boolean(e.entregaId),
      e.puntajeMaximo,
    ]);
    expect(filas).toEqual([
      ["Juan Pérez", "Tema 1", "ENTREGADO", true, 10],
      ["María López", "Tema 3", "EN_CURSO", false, 10],
      ["Pedro García", null, null, false, 0],
    ]);
  });

  it("la entrega muestra solo las consignas del tema y la corrección solo exige esas", async () => {
    const { entrega1, temas } = await conEntregas();
    const data = (await (await verEntrega(await req("GET", "/", { user: f.profesor }), ctx({ entregaId: entrega1.id }))).json()).entrega;
    expect(data.tema).toMatchObject({ nombre: "Tema 1", titulo: "Inteligencia Artificial" });
    expect(data.consignas.map((c: { texto: string }) => c.texto)).toEqual(["T1 - Pregunta 1", "T1 - Pregunta 2"]);
    expect(data.puntajeMaximo).toBe(10);
    // Sugerencia automática de la V/F del tema.
    expect(data.consignas[1].correccion).toMatchObject({ puntajeSugerido: 5, fuenteSugerencia: "AUTOMATICA" });

    const otroTema = await corregir(
      await req("PUT", "/", { user: f.profesor, body: { correcciones: [{ consignaId: temas[2].consignas[0].id, puntajeObtenido: 1 }] } }),
      ctx({ entregaId: entrega1.id }),
    );
    expect(otroTema.status).toBe(400);

    const res = await corregir(
      await req("PUT", "/", {
        user: f.profesor,
        body: {
          correcciones: temas[0].consignas.map((c) => ({ consignaId: c.id, puntajeObtenido: 4, feedback: "Bien" })),
          finalizar: true,
        },
      }),
      ctx({ entregaId: entrega1.id }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).entrega).toMatchObject({ estado: "CORREGIDO", notaTotal: 8 });
  });

  it("una entrega EN_CURSO no se puede abrir (404) ni corregir (409)", async () => {
    await conEntregas();
    const enCurso = await prisma.entrega.findFirstOrThrow({ where: { alumnoId: f.alumno2.id } });
    expect((await verEntrega(await req("GET", "/", { user: f.profesor }), ctx({ entregaId: enCurso.id }))).status).toBe(404);
    const res = await corregir(await req("PUT", "/", { user: f.profesor, body: { correcciones: [] } }), ctx({ entregaId: enCurso.id }));
    expect(res.status).toBe(409);
  });

  it("resultados: estadísticas por tema y notas sobre 10", async () => {
    const { examenId, entrega1, temas } = await conEntregas();
    await corregir(
      await req("PUT", "/", {
        user: f.profesor,
        body: { correcciones: temas[0].consignas.map((c) => ({ consignaId: c.id, puntajeObtenido: 4 })), finalizar: true },
      }),
      ctx({ entregaId: entrega1.id }),
    );
    const r = await resultadosExamen({ ...f.profesor, rol: "PROFESOR" }, examenId);
    expect(r.escalaSobre10).toBe(true);
    expect(r.porTema.map((t) => [t.nombre, t.alumnos, t.promedioSobre10])).toEqual([
      ["Tema 1", 1, 8],
      ["Tema 2", 0, null],
      ["Tema 3", 0, null],
    ]);
    expect(r.alumnos).toEqual([expect.objectContaining({ nota: 8, tema: { nombre: "Tema 1", titulo: "Inteligencia Artificial" } })]);
    // Otro profesor no accede.
    expect((await resultadosRuta(await req("GET", "/", { user: f.profesor2 }), ctx({ id: examenId }))).status).toBe(403);
  });
});

describe("Fecha y duración", () => {
  it("no se puede comenzar ni entregar antes de la fecha disponible (409)", async () => {
    const manana = new Date(Date.now() + 24 * 3600_000);
    const examen = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id], fechaDisponible: manana });
    const data = await detalle(f.alumno1, examen.id);
    expect(data.disponible).toBe(false);
    expect((await comenzar(f.alumno1, examen.id)).status).toBe(409);
    expect((await entregarComo(f.alumno1, examen.id)).status).toBe(409);
  });

  it("al comenzar se informa el fin del tiempo según la duración", async () => {
    const examen = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id], duracionMinutos: 60 });
    const res = await comenzar(f.alumno1, examen.id);
    const { fechaInicio, fechaLimite } = await res.json();
    expect(new Date(fechaLimite).getTime() - new Date(fechaInicio).getTime()).toBe(60 * 60_000);
    // Comenzar dos veces es idempotente (no reinicia el reloj).
    expect((await (await comenzar(f.alumno1, examen.id)).json()).fechaInicio).toBe(fechaInicio);
  });

  it("si se agotó el tiempo, la entrega se cierra con lo guardado y no se aceptan más cambios", async () => {
    const examen = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id], duracionMinutos: 30 });
    await comenzar(f.alumno1, examen.id);
    await guardarComo(f.alumno1, examen.id, [{ consignaId: examen.consignas[0].id, texto: "Lo que llegué a escribir" }]);
    // Simula que comenzó hace 40 minutos.
    await prisma.entrega.updateMany({ where: { examenId: examen.id }, data: { fechaInicio: new Date(Date.now() - 40 * 60_000) } });

    const tarde = await entregarComo(f.alumno1, examen.id, [{ consignaId: examen.consignas[0].id, texto: "Cambio tardío" }]);
    expect(tarde.status).toBe(409);
    const entrega = await prisma.entrega.findFirstOrThrow({ where: { examenId: examen.id }, include: { respuestas: true } });
    expect(entrega.estado).toBe("ENTREGADO");
    expect(entrega.respuestas.find((r) => r.consignaId === examen.consignas[0].id)?.texto).toBe("Lo que llegué a escribir");
    expect(entrega.respuestas).toHaveLength(2);
  });
});
