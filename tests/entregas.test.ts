import { beforeEach, describe, expect, it } from "vitest";
import { POST as enviar } from "@/app/api/alumno/examenes/[id]/entrega/route";
import * as rutaEntrega from "@/app/api/alumno/examenes/[id]/entrega/route";
import { GET as detalle } from "@/app/api/alumno/examenes/[id]/route";
import { prisma } from "@/lib/prisma";
import { crearExamenDb, crearUsuarios, ctx, req, resetDb, type Fixture } from "./helpers";

let f: Fixture;
const GGB = "UEsDBBQAAAAIAGeVSlkAAAAAAAAAAAAAAAAWAAAAZ2VvZ2VicmFfdGh1bWJuYWlsLnBuZw==";

beforeEach(async () => {
  await resetDb();
  f = await crearUsuarios();
});

async function enviarComo(user: Fixture["alumno1"], examenId: string, body: unknown) {
  return enviar(await req("POST", `/api/alumno/examenes/${examenId}/entrega`, { user, body }), ctx({ id: examenId }));
}

describe("US6 - Enviar examen", () => {
  it("envío correcto: 201, respuestas, fecha y estado de GeoGebra guardados", async () => {
    const examen = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id] });
    const [c1, c2] = examen.consignas;
    const antes = Date.now();

    const res = await enviarComo(f.alumno1, examen.id, {
      respuestas: [
        { consignaId: c1.id, texto: "Respuesta uno" },
        { consignaId: c2.id, texto: "Respuesta dos" },
      ],
      geogebraState: GGB,
    });
    const duracion = Date.now() - antes;

    expect(res.status).toBe(201);
    const { entrega } = await res.json();
    expect(entrega.estado).toBe("ENTREGADO");
    expect(duracion).toBeLessThan(3000); // objetivo: envío <= 3 segundos

    const db = await prisma.entrega.findUniqueOrThrow({ where: { id: entrega.id }, include: { respuestas: true } });
    // Alumno y examen salen del JWT y de la URL
    expect(db.alumnoId).toBe(f.alumno1.id);
    expect(db.examenId).toBe(examen.id);
    // Respuestas guardadas
    const textos = Object.fromEntries(db.respuestas.map((r) => [r.consignaId, r.texto]));
    expect(textos).toEqual({ [c1.id]: "Respuesta uno", [c2.id]: "Respuesta dos" });
    // Fecha guardada
    expect(db.fechaEntrega!.getTime()).toBeGreaterThanOrEqual(antes - 1000);
    expect(db.fechaEntrega!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    // GeoGebra guardado
    expect(db.geogebraState).toBe(GGB);
  });

  it("después de enviar, el examen se muestra ENTREGADO con lo enviado", async () => {
    const examen = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id] });
    await enviarComo(f.alumno1, examen.id, { respuestas: [{ consignaId: examen.consignas[0].id, texto: "Hola" }], geogebraState: GGB });
    const data = (await (await detalle(await req("GET", "/", { user: f.alumno1 }), ctx({ id: examen.id }))).json()).examen;
    expect(data.entrega.estado).toBe("ENTREGADO");
    expect(data.entrega.geogebraState).toBe(GGB);
    expect(data.entrega.respuestas).toContainEqual({ consignaId: examen.consignas[0].id, texto: "Hola" });
  });

  it("consignas sin responder se guardan vacías", async () => {
    const examen = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id] });
    await enviarComo(f.alumno1, examen.id, { respuestas: [] });
    expect(await prisma.respuesta.count()).toBe(2);
  });

  it("doble envío rechazado con 409", async () => {
    const examen = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id] });
    expect((await enviarComo(f.alumno1, examen.id, { respuestas: [] })).status).toBe(201);
    const segundo = await enviarComo(f.alumno1, examen.id, { respuestas: [] });
    expect(segundo.status).toBe(409);
    expect(await prisma.entrega.count()).toBe(1);
  });

  it("envíos simultáneos: la base garantiza una sola entrega (uno 201, otro 409)", async () => {
    const examen = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id] });
    const resultados = await Promise.all([
      enviarComo(f.alumno1, examen.id, { respuestas: [] }),
      enviarComo(f.alumno1, examen.id, { respuestas: [] }),
      enviarComo(f.alumno1, examen.id, { respuestas: [] }),
    ]);
    const codigos = resultados.map((r) => r.status).sort();
    expect(codigos).toEqual([201, 409, 409]);
    expect(await prisma.entrega.count()).toBe(1);
  });

  it("constraint único examenId + alumnoId en la base de datos", async () => {
    const examen = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id] });
    await prisma.entrega.create({ data: { examenId: examen.id, alumnoId: f.alumno1.id } });
    await expect(prisma.entrega.create({ data: { examenId: examen.id, alumnoId: f.alumno1.id } })).rejects.toThrow();
  });

  it("alumno no puede editar después de enviar: un nuevo envío no modifica nada", async () => {
    const examen = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id] });
    const c1 = examen.consignas[0];
    await enviarComo(f.alumno1, examen.id, { respuestas: [{ consignaId: c1.id, texto: "Original" }], geogebraState: GGB });

    const intento = await enviarComo(f.alumno1, examen.id, {
      respuestas: [{ consignaId: c1.id, texto: "Modificada" }],
      geogebraState: null,
    });
    expect(intento.status).toBe(409);

    const respuesta = await prisma.respuesta.findFirstOrThrow({ where: { consignaId: c1.id } });
    expect(respuesta.texto).toBe("Original");
    expect((await prisma.entrega.findFirstOrThrow()).geogebraState).toBe(GGB);
    // No existe endpoint de edición de entregas
    expect("PUT" in rutaEntrega).toBe(false);
    expect("PATCH" in rutaEntrega).toBe(false);
  });

  it("alumno de otra clase (o sin clase) no puede entregar (403)", async () => {
    const examen = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno2.id] });
    const res = await enviarComo(f.alumno1, examen.id, { respuestas: [] });
    expect(res.status).toBe(403);
    expect(await prisma.entrega.count()).toBe(0);
  });

  it("no se puede entregar un borrador (404)", async () => {
    const examen = await crearExamenDb(f.profesor.id, { estado: "BORRADOR", alumnoIds: [f.alumno1.id] });
    expect((await enviarComo(f.alumno1, examen.id, { respuestas: [] })).status).toBe(404);
  });

  it("profesor no puede enviar entregas (403)", async () => {
    const examen = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id] });
    expect((await enviarComo(f.profesor, examen.id, { respuestas: [] })).status).toBe(403);
  });

  it("respuestas para consignas de otro examen → 400", async () => {
    const examen = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id] });
    const otro = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id] });
    const res = await enviarComo(f.alumno1, examen.id, { respuestas: [{ consignaId: otro.consignas[0].id, texto: "x" }] });
    expect(res.status).toBe(400);
    expect(await prisma.entrega.count()).toBe(0);
  });

  it("herramientas deshabilitadas se validan en el backend (400)", async () => {
    const sinGgb = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id], geogebra: false });
    expect((await enviarComo(f.alumno1, sinGgb.id, { respuestas: [], geogebraState: GGB })).status).toBe(400);

    const sinEscritura = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id], escritura: false });
    const res = await enviarComo(f.alumno1, sinEscritura.id, {
      respuestas: [{ consignaId: sinEscritura.consignas[0].id, texto: "No debería poder escribir" }],
    });
    expect(res.status).toBe(400);
    expect(await prisma.entrega.count()).toBe(0);
  });

  it("body inválido → 400", async () => {
    const examen = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id] });
    expect((await enviarComo(f.alumno1, examen.id, { respuestas: "no-es-array" })).status).toBe(400);
    expect((await enviarComo(f.alumno1, examen.id, { respuestas: [], geogebraState: "<script>" })).status).toBe(400);
  });
});
