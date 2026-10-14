import { beforeEach, describe, expect, it } from "vitest";
import { GET as listar } from "@/app/api/alumno/examenes/route";
import { GET as detalle } from "@/app/api/alumno/examenes/[id]/route";
import { POST as iniciar } from "@/app/api/alumno/examenes/[id]/iniciar/route";
import { crearExamenDb, crearUsuarios, ctx, req, resetDb, type Fixture } from "./helpers";

let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await crearUsuarios();
});

describe("US4 - Ver y abrir examen", () => {
  it("alumno ve el examen publicado asignado a su clase (consignas recién al comenzar)", async () => {
    const examen = await crearExamenDb(f.profesor.id, { titulo: "Asignado", alumnoIds: [f.alumno1.id] });
    const { examenes } = await (await listar(await req("GET", "/api/alumno/examenes", { user: f.alumno1 }))).json();
    expect(examenes).toHaveLength(1);
    expect(examenes[0]).toMatchObject({ id: examen.id, titulo: "Asignado", entregado: false });

    const res = await detalle(await req("GET", `/api/alumno/examenes/${examen.id}`, { user: f.alumno1 }), ctx({ id: examen.id }));
    expect(res.status).toBe(200);
    const data = (await res.json()).examen;
    expect(data.titulo).toBe("Asignado");
    expect(data.enunciado).toBe("Enunciado de prueba");
    expect(data.clase).toBe("Clase de prueba");
    // Antes de comenzar no se envían las consignas (solo cuántas son).
    expect(data.consignas).toEqual([]);
    expect(data.cantidadConsignas).toBe(2);
    expect(data.entrega).toBeNull();

    expect((await iniciar(await req("POST", "/", { user: f.alumno1 }), ctx({ id: examen.id }))).status).toBe(200);
    const comenzado = (await (await detalle(await req("GET", "/", { user: f.alumno1 }), ctx({ id: examen.id }))).json()).examen;
    expect(comenzado.consignas.map((c: { texto: string }) => c.texto)).toEqual(["Consigna uno", "Consigna dos"]);
    expect(comenzado.entrega).toMatchObject({ estado: "EN_CURSO" });
  });

  it("alumno NO ve un examen de otra clase y no puede abrirlo cambiando la URL (403)", async () => {
    const ajeno = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno2.id] });
    const { examenes } = await (await listar(await req("GET", "/api/alumno/examenes", { user: f.alumno1 }))).json();
    expect(examenes).toHaveLength(0);

    const res = await detalle(await req("GET", `/api/alumno/examenes/${ajeno.id}`, { user: f.alumno1 }), ctx({ id: ajeno.id }));
    expect(res.status).toBe(403);
  });

  it("solo aparecen exámenes PUBLICADOS + de SU CLASE (mezcla de casos)", async () => {
    const visible = await crearExamenDb(f.profesor.id, { alumnoIds: [f.alumno1.id] });
    await crearExamenDb(f.profesor.id, { estado: "BORRADOR", alumnoIds: [f.alumno1.id] });
    await crearExamenDb(f.profesor2.id, { alumnoIds: [f.alumno2.id] });
    const { examenes } = await (await listar(await req("GET", "/", { user: f.alumno1 }))).json();
    expect(examenes.map((e: { id: string }) => e.id)).toEqual([visible.id]);
  });

  it("examen inexistente → 404", async () => {
    const res = await detalle(await req("GET", "/", { user: f.alumno1 }), ctx({ id: "no-existe" }));
    expect(res.status).toBe(404);
  });
});

describe("US5 - Herramientas", () => {
  it("el examen informa exactamente las herramientas que habilitó el profesor", async () => {
    const soloCalc = await crearExamenDb(f.profesor.id, {
      alumnoIds: [f.alumno1.id],
      escritura: false,
      calculadora: true,
      geogebra: false,
    });
    const data = (await (await detalle(await req("GET", "/", { user: f.alumno1 }), ctx({ id: soloCalc.id }))).json()).examen;
    expect(data).toMatchObject({ habilitarEscritura: false, habilitarCalculadora: true, habilitarGeoGebra: false });
  });
});
