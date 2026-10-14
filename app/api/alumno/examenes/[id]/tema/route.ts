import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, readJson, requireApiUser } from "@/lib/http";
import { seleccionarTema } from "@/lib/services/alumno";

type Ctx = { params: Promise<{ id: string }> };

// Elige o cambia el tema (solo antes de comenzar el examen).
export async function PUT(req: NextRequest, { params }: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "ALUMNO");
    const { id } = await params;
    return NextResponse.json(await seleccionarTema(user, id, await readJson(req)));
  });
}
