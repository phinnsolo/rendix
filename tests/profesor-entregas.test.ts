import { beforeEach, describe, expect, it } from "vitest";
import { GET as listarEntregas } from "@/app/api/profesor/examenes/[id]/entregas/route";
import { GET as verEntrega } from "@/app/api/profesor/entregas/[entregaId]/route";
import { GET as detalleExamen } from "@/app/api/profesor/examenes/[id]/route";
import { prisma } from "@/lib/prisma";
import { crearExamenDb, crearUsuarios, ctx, req, resetDb, type Fixture } from "./helpers";

let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await crearUsuarios();
});

async function escenario() {
  const examen = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id, f.alumno2.id, f.alumno3.id] });
  const entrega = await prisma.entrega.create({
    data: {
      examenId: examen.id,
      alumnoId: f.alumno1.id,
      geogebraState: "UEsDBBQ=",
      respuestas: {
        create: [
          { consignaId: examen.consignas[0].id, texto: "Mi respuesta 1" },
          { consignaId: examen.consignas[1].id, texto: "Mi respuesta 2" },
        ],
      },
    },
  });
  return { examen, entrega };
}

describe("US7 - Ver entregas", () => {
  it("el profesor ve todos los alumnos de la clase como ENTREGADO / NO ENTREGADO con fecha", async () => {
    const { examen, entrega } = await escenario();
    const res = await listarEntregas(await req("GET", "/", { user: f.profesor }), ctx({ id: examen.id }));
    expect(res.status).toBe(200);
    const { entregas } = await res.json();
    expect(entregas).toHaveLength(3);

    const porNombre = Object.fromEntries(
      entregas.map((e: { alumno: { nombre: string }; entregado: boolean; fechaEntrega: string | null }) => [
        e.alumno.nombre,
        { entregado: e.entregado, fecha: e.fechaEntrega },
      ]),
    );
    expect(porNombre["Juan Pérez"]).toEqual({ entregado: true, fecha: entrega.fechaEntrega!.toISOString() });
    expect(porNombre["María López"]).toEqual({ entregado: false, fecha: null });
    expect(porNombre["Pedro García"]).toEqual({ entregado: false, fecha: null });
  });

  it("el profesor puede abrir una entrega: alumno, examen, fecha, consignas, respuestas y GeoGebra", async () => {
    const { examen, entrega } = await escenario();
    const res = await verEntrega(await req("GET", "/", { user: f.profesor }), ctx({ entregaId: entrega.id }));
    expect(res.status).toBe(200);
    const data = (await res.json()).entrega;
    expect(data.alumno.nombre).toBe("Juan Pérez");
    expect(data.examen.titulo).toBe(examen.titulo);
    expect(data.fechaEntrega).toBe(entrega.fechaEntrega!.toISOString());
    expect(data.geogebraState).toBe("UEsDBBQ=");
    expect(data.consignas.map((c: { texto: string; respuesta: string }) => [c.texto, c.respuesta])).toEqual([
      ["Consigna uno", "Mi respuesta 1"],
      ["Consigna dos", "Mi respuesta 2"],
    ]);
  });

  it("otro profesor no puede abrir el examen, sus entregas ni una entrega (403)", async () => {
    const { examen, entrega } = await escenario();
    expect((await detalleExamen(await req("GET", "/", { user: f.profesor2 }), ctx({ id: examen.id }))).status).toBe(403);
    expect((await listarEntregas(await req("GET", "/", { user: f.profesor2 }), ctx({ id: examen.id }))).status).toBe(403);
    expect((await verEntrega(await req("GET", "/", { user: f.profesor2 }), ctx({ entregaId: entrega.id }))).status).toBe(403);
  });

  it("un alumno no puede ver entregas (403), ni siquiera la propia por la API de profesor", async () => {
    const { entrega } = await escenario();
    expect((await verEntrega(await req("GET", "/", { user: f.alumno1 }), ctx({ entregaId: entrega.id }))).status).toBe(403);
  });

  it("entrega inexistente → 404", async () => {
    expect((await verEntrega(await req("GET", "/", { user: f.profesor }), ctx({ entregaId: "nope" }))).status).toBe(404);
  });
});
