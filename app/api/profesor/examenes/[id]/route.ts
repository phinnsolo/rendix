import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, readJson, requireApiUser } from "@/lib/http";
import { actualizarExamen, obtenerExamenProfesor } from "@/lib/services/profesor";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "PROFESOR");
    const { id } = await params;
    return NextResponse.json({ examen: await obtenerExamenProfesor(user, id) });
  });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "PROFESOR");
    const { id } = await params;
    return NextResponse.json({ examen: await actualizarExamen(user, id, await readJson(req)) });
  });
}
