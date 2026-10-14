import { beforeEach, describe, expect, it } from "vitest";
import { GET as listarClases, POST as crearClase } from "@/app/api/profesor/clases/route";
import { GET as verClase, PATCH as editarClase } from "@/app/api/profesor/clases/[id]/route";
import { POST as agregarAlumno } from "@/app/api/profesor/clases/[id]/alumnos/route";
import { DELETE as quitarAlumno } from "@/app/api/profesor/clases/[id]/alumnos/[alumnoId]/route";
import { GET as alumnosGestion } from "@/app/api/profesor/alumnos/route";
import { GET as listarEntregas } from "@/app/api/profesor/examenes/[id]/entregas/route";
import { GET as miClase } from "@/app/api/alumno/clase/route";
import { GET as listarAlumno } from "@/app/api/alumno/examenes/route";
import { GET as detalleAlumno } from "@/app/api/alumno/examenes/[id]/route";
import { POST as entregar } from "@/app/api/alumno/examenes/[id]/entrega/route";
import { POST as iniciar } from "@/app/api/alumno/examenes/[id]/iniciar/route";
import { prisma } from "@/lib/prisma";
import { crearClaseDb, crearExamenDb, crearUsuarios, ctx, req, resetDb, type Fixture } from "./helpers";

let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await crearUsuarios();
});

type Usuario = Fixture["alumno1"];

const agregar = async (user: Usuario, claseId: string, alumnoId: string) =>
  agregarAlumno(await req("POST", "/", { user, body: { alumnoId } }), ctx({ id: claseId }));
const quitar = async (user: Usuario, claseId: string, alumnoId: string) =>
  quitarAlumno(await req("DELETE", "/", { user }), ctx({ id: claseId, alumnoId }));
const examenesDe = async (alumno: Usuario) =>
  (await (await listarAlumno(await req("GET", "/", { user: alumno }))).json()).examenes as { id: string; titulo: string }[];
const entregarComo = async (alumno: Usuario, examenId: string) =>
  entregar(await req("POST", "/", { user: alumno, body: { respuestas: [] } }), ctx({ id: examenId }));

describe("Clases del profesor", () => {
  it("crea una clase (nombre + descripción opcional) y la lista con alumnos y exámenes activos", async () => {
    const res = await crearClase(
      await req("POST", "/", { user: f.profesor, body: { nombre: "  Clase 1 ", descripcion: "Comisión lunes y miércoles" } }),
    );
    expect(res.status).toBe(201);
    const { clase } = await res.json();
    expect(clase).toMatchObject({ nombre: "Clase 1", descripcion: "Comisión lunes y miércoles", profesorId: f.profesor.id });

    await agregar(f.profesor, clase.id, f.alumno1.id);
    await crearExamenDb(f.profesor.id, { claseId: clase.id });
    await crearExamenDb(f.profesor.id, { claseId: clase.id, estado: "BORRADOR" });

    const { clases } = await (await listarClases(await req("GET", "/", { user: f.profesor }))).json();
    expect(clases).toEqual([expect.objectContaining({ nombre: "Clase 1", alumnos: 1, examenesActivos: 1, borradores: 1 })]);
  });

  it("validaciones: nombre obligatorio (400) y nombre repetido para el mismo profesor (409)", async () => {
    expect((await crearClase(await req("POST", "/", { user: f.profesor, body: { nombre: " " } }))).status).toBe(400);
    expect((await crearClase(await req("POST", "/", { user: f.profesor, body: { nombre: "Clase 1" } }))).status).toBe(201);
    expect((await crearClase(await req("POST", "/", { user: f.profesor, body: { nombre: "Clase 1" } }))).status).toBe(409);
    // Otro profesor sí puede usar el mismo nombre.
    expect((await crearClase(await req("POST", "/", { user: f.profesor2, body: { nombre: "Clase 1" } }))).status).toBe(201);
  });

  it("agrega y quita alumnos: quitar NO elimina al alumno ni sus entregas, solo la asociación", async () => {
    const clase = await crearClaseDb(f.profesor.id);
    expect((await agregar(f.profesor, clase.id, f.alumno1.id)).status).toBe(201);
    expect((await agregar(f.profesor, clase.id, f.alumno1.id)).status).toBe(409); // ya pertenece
    const examen = await crearExamenDb(f.profesor.id, { claseId: clase.id });
    expect((await entregarComo(f.alumno1, examen.id)).status).toBe(201);

    const detalle = (await (await verClase(await req("GET", "/", { user: f.profesor }), ctx({ id: clase.id }))).json()).clase;
    expect(detalle.alumnos.map((a: { email: string }) => a.email)).toEqual(["alumno1@test.com"]);

    expect((await quitar(f.profesor, clase.id, f.alumno1.id)).status).toBe(200);
    expect(await prisma.usuario.findUnique({ where: { id: f.alumno1.id } })).not.toBeNull();
    expect(await prisma.entrega.count({ where: { alumnoId: f.alumno1.id } })).toBe(1);
    expect(await prisma.inscripcionClase.count()).toBe(0);
    expect((await quitar(f.profesor, clase.id, f.alumno1.id)).status).toBe(404);
  });

  it("cambiar de clase: agregarlo a otra clase propia lo mueve (sigue en una sola clase)", async () => {
    const c1 = await crearClaseDb(f.profesor.id, [f.alumno1.id], "Clase 1");
    const c2 = await crearClaseDb(f.profesor.id, [], "Clase 2");
    const res = await agregar(f.profesor, c2.id, f.alumno1.id);
    expect(res.status).toBe(201);
    expect((await res.json()).movidoDesde).toMatchObject({ id: c1.id, nombre: "Clase 1" });
    expect(await prisma.inscripcionClase.findMany({ where: { alumnoId: f.alumno1.id } })).toEqual([
      expect.objectContaining({ claseId: c2.id }),
    ]);
  });

  it("un alumno pertenece a una sola clase (UNIQUE en la base)", async () => {
    const c1 = await crearClaseDb(f.profesor.id, [f.alumno1.id]);
    const c2 = await crearClaseDb(f.profesor.id);
    await expect(prisma.inscripcionClase.create({ data: { claseId: c2.id, alumnoId: f.alumno1.id } })).rejects.toThrow();
    expect(c1).toBeTruthy();
  });

  it("solo se agregan alumnos existentes con rol ALUMNO (400)", async () => {
    const clase = await crearClaseDb(f.profesor.id);
    expect((await agregar(f.profesor, clase.id, "no-existe")).status).toBe(400);
    expect((await agregar(f.profesor, clase.id, f.profesor2.id)).status).toBe(400);
  });
});

describe("Permisos entre profesores", () => {
  it("un profesor no puede ver, editar ni administrar las clases de otro (403)", async () => {
    const ajena = await crearClaseDb(f.profesor2.id, [f.alumno1.id], "Clase de Carlos");
    expect((await verClase(await req("GET", "/", { user: f.profesor }), ctx({ id: ajena.id }))).status).toBe(403);
    expect((await editarClase(await req("PATCH", "/", { user: f.profesor, body: { nombre: "Mía" } }), ctx({ id: ajena.id }))).status).toBe(403);
    expect((await agregar(f.profesor, ajena.id, f.alumno2.id)).status).toBe(403);
    expect((await quitar(f.profesor, ajena.id, f.alumno1.id)).status).toBe(403);
    const { clases } = await (await listarClases(await req("GET", "/", { user: f.profesor }))).json();
    expect(clases).toHaveLength(0);
    expect((await prisma.clase.findUniqueOrThrow({ where: { id: ajena.id } })).nombre).toBe("Clase de Carlos");
  });

  it("no puede 'robar' un alumno que pertenece a la clase de otro profesor (409)", async () => {
    await crearClaseDb(f.profesor2.id, [f.alumno1.id]);
    const propia = await crearClaseDb(f.profesor.id);
    const res = await agregar(f.profesor, propia.id, f.alumno1.id);
    expect(res.status).toBe(409);
    // En el listado de gestión solo se informa que está en otra cátedra, sin datos de esa clase.
    const { alumnos } = await (await alumnosGestion(await req("GET", "/", { user: f.profesor }))).json();
    expect(alumnos.find((a: { id: string }) => a.id === f.alumno1.id)).toMatchObject({ clase: null, otraCatedra: true });
  });

  it("un alumno no puede usar las APIs de clases del profesor (403)", async () => {
    const clase = await crearClaseDb(f.profesor.id, [f.alumno1.id]);
    expect((await verClase(await req("GET", "/", { user: f.alumno1 }), ctx({ id: clase.id }))).status).toBe(403);
    expect((await agregar(f.alumno1, clase.id, f.alumno2.id)).status).toBe(403);
  });
});

describe("Asignación de exámenes a clases (casos 1, 2 y 3)", () => {
  it("CASO 1: los tres alumnos de la clase ven el examen; el alumno ve su clase", async () => {
    const clase = await crearClaseDb(f.profesor.id, [f.alumno1.id, f.alumno2.id, f.alumno3.id], "Clase 1");
    const examen = await crearExamenDb(f.profesor.id, { claseId: clase.id, titulo: "Examen 1" });
    for (const a of [f.alumno1, f.alumno2, f.alumno3]) {
      expect((await examenesDe(a)).map((e) => e.id)).toEqual([examen.id]);
    }
    const { clase: suClase } = await (await miClase(await req("GET", "/", { user: f.alumno1 }))).json();
    expect(suClase).toMatchObject({ id: clase.id, nombre: "Clase 1" });
  });

  it("CASO 2: un alumno agregado DESPUÉS de publicar también ve el examen (sin asignaciones individuales)", async () => {
    const clase = await crearClaseDb(f.profesor.id, [f.alumno1.id]);
    const examen = await crearExamenDb(f.profesor.id, { claseId: clase.id });
    expect(await examenesDe(f.alumno2)).toHaveLength(0);

    expect((await agregar(f.profesor, clase.id, f.alumno2.id)).status).toBe(201);
    expect((await examenesDe(f.alumno2)).map((e) => e.id)).toEqual([examen.id]);
    expect((await entregarComo(f.alumno2, examen.id)).status).toBe(201);
    expect(await prisma.asignacionExamen.count()).toBe(0);
  });

  it("CASO 3: al cambiar de clase no ve exámenes nuevos ni pendientes de la anterior, pero conserva lo entregado", async () => {
    const c1 = await crearClaseDb(f.profesor.id, [f.alumno1.id, f.alumno2.id], "Clase 1");
    const c2 = await crearClaseDb(f.profesor.id, [], "Clase 2");
    const entregado = await crearExamenDb(f.profesor.id, { claseId: c1.id, titulo: "Entregado" });
    const pendiente = await crearExamenDb(f.profesor.id, { claseId: c1.id, titulo: "Pendiente" });
    expect((await entregarComo(f.alumno1, entregado.id)).status).toBe(201);

    expect((await agregar(f.profesor, c2.id, f.alumno1.id)).status).toBe(201); // pasa a Clase 2
    const futuro = await crearExamenDb(f.profesor.id, { claseId: c1.id, titulo: "Futuro de Clase 1" });
    const deC2 = await crearExamenDb(f.profesor.id, { claseId: c2.id, titulo: "De Clase 2" });

    const titulos = (await examenesDe(f.alumno1)).map((e) => e.titulo).sort();
    expect(titulos).toEqual(["De Clase 2", "Entregado"]);
    // Historial: su entrega sigue visible (solo lectura) y no puede reenviar.
    const hist = await detalleAlumno(await req("GET", "/", { user: f.alumno1 }), ctx({ id: entregado.id }));
    expect(hist.status).toBe(200);
    expect((await hist.json()).examen.entrega.estado).toBe("ENTREGADO");
    expect((await entregarComo(f.alumno1, entregado.id)).status).toBe(409);
    // Exámenes de la clase anterior que no entregó: sin acceso.
    for (const e of [pendiente, futuro]) {
      expect((await detalleAlumno(await req("GET", "/", { user: f.alumno1 }), ctx({ id: e.id }))).status).toBe(403);
      expect((await iniciar(await req("POST", "/", { user: f.alumno1 }), ctx({ id: e.id }))).status).toBe(403);
      expect((await entregarComo(f.alumno1, e.id)).status).toBe(403);
    }
    expect((await examenesDe(f.alumno2)).map((e) => e.titulo).sort()).toEqual(["Entregado", "Futuro de Clase 1", "Pendiente"]);
    expect(deC2).toBeTruthy();

    // El profesor sigue viendo la entrega histórica, marcada como "ya no está en la clase".
    const { entregas } = await (await listarEntregas(await req("GET", "/", { user: f.profesor }), ctx({ id: entregado.id }))).json();
    expect(entregas.map((e: { alumno: { nombre: string }; entregado: boolean; enClase: boolean }) => [e.alumno.nombre, e.entregado, e.enClase])).toEqual([
      ["Juan Pérez", true, false],
      ["María López", false, true],
    ]);
  });

  it("un alumno sin clase no ve ningún examen", async () => {
    await crearExamenDb(f.profesor.id, { claseId: (await crearClaseDb(f.profesor.id, [f.alumno1.id])).id });
    expect(await examenesDe(f.alumno3)).toHaveLength(0);
    const { clase } = await (await miClase(await req("GET", "/", { user: f.alumno3 }))).json();
    expect(clase).toBeNull();
  });
});
