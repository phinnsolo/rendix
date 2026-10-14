import { beforeEach, describe, expect, it } from "vitest";
import { GET as listarProfesor, POST as crear } from "@/app/api/profesor/examenes/route";
import { GET as detalleProfesor, PUT as editar } from "@/app/api/profesor/examenes/[id]/route";
import { POST as publicar } from "@/app/api/profesor/examenes/[id]/publicar/route";
import { PUT as asignarClase } from "@/app/api/profesor/examenes/[id]/clase/route";
import { GET as listarAlumno } from "@/app/api/alumno/examenes/route";
import { GET as detalleAlumno } from "@/app/api/alumno/examenes/[id]/route";
import { prisma } from "@/lib/prisma";
import { crearClaseDb, crearExamenDb, crearUsuarios, ctx, examenValido, req, resetDb, type Fixture } from "./helpers";

let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await crearUsuarios();
});

async function crearComo(user: Fixture["profesor"], body: unknown) {
  return crear(await req("POST", "/api/profesor/examenes", { user, body }));
}

describe("US2 - Crear examen", () => {
  it("profesor crea examen: queda BORRADOR con consignas ordenadas, herramientas y clase asignada", async () => {
    const clase = await crearClaseDb(f.profesor.id, [f.alumno1.id, f.alumno2.id], "Clase 1");
    const inicio = Date.now();
    const res = await crearComo(f.profesor, {
      ...examenValido(clase.id),
      fechaDisponible: "2026-10-15T13:00:00.000Z",
      duracionMinutos: 60,
    });
    const duracion = Date.now() - inicio;

    expect(res.status).toBe(201);
    const { examen } = await res.json();
    expect(examen.estado).toBe("BORRADOR");
    expect(examen.fechaPublicacion).toBeNull();
    expect(examen.profesorId).toBe(f.profesor.id);
    expect(examen.habilitarGeoGebra).toBe(true);
    expect(examen.consignas.map((c: { orden: number; puntaje: number }) => [c.orden, c.puntaje])).toEqual([
      [1, 4],
      [2, 6],
    ]);
    expect(examen.modo).toBe("NORMAL");
    // Asignación por clase: no se crean asignaciones por alumno.
    expect(examen.clase).toMatchObject({ id: clase.id, nombre: "Clase 1", _count: { inscripciones: 2 } });
    expect(await prisma.asignacionExamen.count()).toBe(0);
    expect(examen.fechaDisponible).toBe("2026-10-15T13:00:00.000Z");
    expect(examen.duracionMinutos).toBe(60);
    expect(duracion).toBeLessThan(1000); // objetivo: guardado < 1 segundo
  });

  it("la identidad del profesor sale del JWT: se ignora un profesorId enviado en el body", async () => {
    const res = await crearComo(f.profesor, { ...examenValido(), profesorId: f.profesor2.id, estado: "PUBLICADO" });
    const { examen } = await res.json();
    expect(examen.profesorId).toBe(f.profesor.id);
    expect(examen.estado).toBe("BORRADOR");
  });

  it("examen sin título rechazado (400)", async () => {
    const res = await crearComo(f.profesor, { ...examenValido(), titulo: "   " });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.detalles).toContainEqual({ campo: "titulo", mensaje: "El título es obligatorio" });
    expect(await prisma.examen.count()).toBe(0);
  });

  it("examen sin enunciado rechazado (400)", async () => {
    const res = await crearComo(f.profesor, { ...examenValido(), enunciado: "" });
    expect(res.status).toBe(400);
  });

  it("examen sin consignas rechazado (400)", async () => {
    const res = await crearComo(f.profesor, { ...examenValido(), consignas: [] });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.detalles).toContainEqual({ campo: "consignas", mensaje: "El examen debe tener al menos una consigna" });
    expect(await prisma.examen.count()).toBe(0);
  });

  it("puntaje > 10 rechazado (400)", async () => {
    const res = await crearComo(f.profesor, { ...examenValido(), consignas: [{ texto: "Consigna", puntaje: 11 }] });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.detalles[0].campo).toBe("consignas.0.puntaje");
    expect(await prisma.consigna.count()).toBe(0);
  });

  it("puntaje negativo o no numérico rechazado (400)", async () => {
    expect((await crearComo(f.profesor, { ...examenValido(), consignas: [{ texto: "C", puntaje: -1 }] })).status).toBe(400);
    expect((await crearComo(f.profesor, { ...examenValido(), consignas: [{ texto: "C", puntaje: null }] })).status).toBe(400);
  });

  it("la base de datos también rechaza un puntaje fuera de rango (CHECK constraint)", async () => {
    const examen = await crearExamenDb(f.profesor.id, { estado: "BORRADOR" });
    await expect(
      prisma.consigna.create({ data: { examenId: examen.id, texto: "x", puntaje: 11, orden: 3 } }),
    ).rejects.toThrow();
  });

  it("al menos una herramienta habilitada (400)", async () => {
    const res = await crearComo(f.profesor, {
      ...examenValido(),
      habilitarEscritura: false,
      habilitarCalculadora: false,
      habilitarGeoGebra: false,
    });
    expect(res.status).toBe(400);
  });

  it("clase inexistente o de otro profesor rechazada (400): no se confía en el id enviado", async () => {
    const ajena = await crearClaseDb(f.profesor2.id);
    expect((await crearComo(f.profesor, examenValido("no-existe"))).status).toBe(400);
    const res = await crearComo(f.profesor, examenValido(ajena.id));
    expect(res.status).toBe(400);
    expect((await res.json()).detalles).toContainEqual({ campo: "claseId", mensaje: "La clase elegida no existe o no es tuya" });
    expect(await prisma.examen.count()).toBe(0);
  });

  it("duración y fecha inválidas rechazadas (400)", async () => {
    expect((await crearComo(f.profesor, { ...examenValido(), duracionMinutos: 0 })).status).toBe(400);
    expect((await crearComo(f.profesor, { ...examenValido(), duracionMinutos: 2.5 })).status).toBe(400);
    expect((await crearComo(f.profesor, { ...examenValido(), fechaDisponible: "mañana" })).status).toBe(400);
  });

  it("alumno no puede crear exámenes (403)", async () => {
    const res = await crearComo(f.alumno1, examenValido());
    expect(res.status).toBe(403);
  });

  it("profesor puede editar su borrador", async () => {
    const [c1, c2] = [await crearClaseDb(f.profesor.id), await crearClaseDb(f.profesor.id)];
    const { examen } = await (await crearComo(f.profesor, examenValido(c1.id))).json();
    const res = await editar(
      await req("PUT", `/api/profesor/examenes/${examen.id}`, {
        user: f.profesor,
        body: { ...examenValido(c2.id), titulo: "Nuevo título", consignas: [{ texto: "Única", puntaje: 10 }] },
      }),
      ctx({ id: examen.id }),
    );
    expect(res.status).toBe(200);
    const editado = (await res.json()).examen;
    expect(editado.titulo).toBe("Nuevo título");
    expect(editado.consignas).toHaveLength(1);
    expect(editado.claseId).toBe(c2.id);
  });

  it("profesor no puede ver ni editar el examen de otro profesor (403)", async () => {
    const ajeno = await crearExamenDb(f.profesor2.id, { estado: "BORRADOR" });
    const get = await detalleProfesor(await req("GET", `/api/profesor/examenes/${ajeno.id}`, { user: f.profesor }), ctx({ id: ajeno.id }));
    expect(get.status).toBe(403);
    const put = await editar(
      await req("PUT", `/api/profesor/examenes/${ajeno.id}`, { user: f.profesor, body: examenValido() }),
      ctx({ id: ajeno.id }),
    );
    expect(put.status).toBe(403);
    const lista = await (await listarProfesor(await req("GET", "/api/profesor/examenes", { user: f.profesor }))).json();
    expect(lista.examenes).toHaveLength(0);
  });

  it("examen inexistente → 404", async () => {
    const res = await detalleProfesor(await req("GET", "/api/profesor/examenes/nope", { user: f.profesor }), ctx({ id: "nope" }));
    expect(res.status).toBe(404);
  });
});

describe("US3 - Publicar examen", () => {
  it("borrador invisible para alumno asignado (0 apariciones y 404 al abrirlo)", async () => {
    const borrador = await crearExamenDb(f.profesor.id, { estado: "BORRADOR", alumnoIds: [f.alumno1.id] });
    const lista = await (await listarAlumno(await req("GET", "/api/alumno/examenes", { user: f.alumno1 }))).json();
    expect(lista.examenes.filter((e: { id: string }) => e.id === borrador.id)).toHaveLength(0);

    const res = await detalleAlumno(await req("GET", `/api/alumno/examenes/${borrador.id}`, { user: f.alumno1 }), ctx({ id: borrador.id }));
    expect(res.status).toBe(404);
  });

  it("publicación correcta: BORRADOR → PUBLICADO con fechaPublicacion, y el alumno ahora lo ve", async () => {
    const clase = await crearClaseDb(f.profesor.id, [f.alumno1.id]);
    const { examen } = await (await crearComo(f.profesor, examenValido(clase.id))).json();
    const antes = Date.now();
    const res = await publicar(await req("POST", `/api/profesor/examenes/${examen.id}/publicar`, { user: f.profesor }), ctx({ id: examen.id }));
    expect(res.status).toBe(200);
    const publicado = (await res.json()).examen;
    expect(publicado.estado).toBe("PUBLICADO");
    expect(new Date(publicado.fechaPublicacion).getTime()).toBeGreaterThanOrEqual(antes - 1000);

    const lista = await (await listarAlumno(await req("GET", "/api/alumno/examenes", { user: f.alumno1 }))).json();
    expect(lista.examenes.map((e: { id: string }) => e.id)).toEqual([examen.id]);
  });

  it("no se puede publicar sin clase asignada (400) y sigue como BORRADOR", async () => {
    const { examen } = await (await crearComo(f.profesor, examenValido())).json();
    const res = await publicar(await req("POST", "/", { user: f.profesor }), ctx({ id: examen.id }));
    expect(res.status).toBe(400);
    expect((await res.json()).detalles).toContainEqual({ campo: "claseId", mensaje: "Asigná el examen a una clase antes de publicarlo" });
    expect((await prisma.examen.findUniqueOrThrow({ where: { id: examen.id } })).estado).toBe("BORRADOR");
  });

  it("publicar dos veces → 409", async () => {
    const examen = await crearExamenDb(f.profesor.id, { estado: "PUBLICADO" });
    const res = await publicar(await req("POST", "/", { user: f.profesor }), ctx({ id: examen.id }));
    expect(res.status).toBe(409);
  });

  it("no se puede publicar un examen sin consignas válidas (400)", async () => {
    const examen = await crearExamenDb(f.profesor.id, { estado: "BORRADOR" });
    await prisma.consigna.deleteMany({ where: { examenId: examen.id } });
    const res = await publicar(await req("POST", "/", { user: f.profesor }), ctx({ id: examen.id }));
    expect(res.status).toBe(400);
    expect((await prisma.examen.findUniqueOrThrow({ where: { id: examen.id } })).estado).toBe("BORRADOR");
  });

  it("solo el profesor propietario puede publicar (otro profesor 403, alumno 403)", async () => {
    const examen = await crearExamenDb(f.profesor.id, { estado: "BORRADOR" });
    expect((await publicar(await req("POST", "/", { user: f.profesor2 }), ctx({ id: examen.id }))).status).toBe(403);
    expect((await publicar(await req("POST", "/", { user: f.alumno1 }), ctx({ id: examen.id }))).status).toBe(403);
    expect((await prisma.examen.findUniqueOrThrow({ where: { id: examen.id } })).estado).toBe("BORRADOR");
  });

  it("un examen publicado no puede editarse (409)", async () => {
    const examen = await crearExamenDb(f.profesor.id, { estado: "PUBLICADO" });
    const res = await editar(await req("PUT", "/", { user: f.profesor, body: examenValido() }), ctx({ id: examen.id }));
    expect(res.status).toBe(409);
  });
});

describe("Asignación por clase", () => {
  it("el profesor asigna el examen a otra clase: lo ven los alumnos de la nueva clase", async () => {
    const examen = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id] });
    const otra = await crearClaseDb(f.profesor.id, [f.alumno3.id]);
    const res = await asignarClase(await req("PUT", "/", { user: f.profesor, body: { claseId: otra.id } }), ctx({ id: examen.id }));
    expect(res.status).toBe(200);
    expect((await (await listarAlumno(await req("GET", "/", { user: f.alumno3 }))).json()).examenes).toHaveLength(1);
    expect((await (await listarAlumno(await req("GET", "/", { user: f.alumno1 }))).json()).examenes).toHaveLength(0);
  });

  it("la clase no se puede cambiar si algún alumno ya comenzó o entregó (409)", async () => {
    const examen = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id] });
    await prisma.entrega.create({ data: { examenId: examen.id, alumnoId: f.alumno1.id } });
    const otra = await crearClaseDb(f.profesor.id);
    const res = await asignarClase(await req("PUT", "/", { user: f.profesor, body: { claseId: otra.id } }), ctx({ id: examen.id }));
    expect(res.status).toBe(409);
  });

  it("no se puede asignar a la clase de otro profesor (400) ni tocar un examen ajeno (403)", async () => {
    const examen = await crearExamenDb(f.profesor.id);
    const ajena = await crearClaseDb(f.profesor2.id);
    expect((await asignarClase(await req("PUT", "/", { user: f.profesor, body: { claseId: ajena.id } }), ctx({ id: examen.id }))).status).toBe(400);
    const propia2 = await crearClaseDb(f.profesor2.id);
    expect((await asignarClase(await req("PUT", "/", { user: f.profesor2, body: { claseId: propia2.id } }), ctx({ id: examen.id }))).status).toBe(403);
    expect((await prisma.examen.findUniqueOrThrow({ where: { id: examen.id } })).claseId).toBeNull();
  });
});
