import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, readJson, requireApiUser } from "@/lib/http";
import { guardarRespuestas } from "@/lib/services/alumno";

type Ctx = { params: Promise<{ id: string }> };

// Guarda el avance mientras el examen está en curso (no es la entrega definitiva).
export async function PUT(req: NextRequest, { params }: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "ALUMNO");
    const { id } = await params;
    return NextResponse.json(await guardarRespuestas(user, id, await readJson(req)));
  });
}
