import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, readJson, requireApiUser } from "@/lib/http";
import { actualizarClase, obtenerClase } from "@/lib/services/clases";

type Ctx = { params: Promise<{ id: string }> };

// Detalle de la clase: alumnos inscriptos y exámenes asignados.
export async function GET(req: NextRequest, { params }: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "PROFESOR");
    const { id } = await params;
    return NextResponse.json({ clase: await obtenerClase(user, id) });
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "PROFESOR");
    const { id } = await params;
    return NextResponse.json({ clase: await actualizarClase(user, id, await readJson(req)) });
  });
}
