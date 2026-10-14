import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, readJson, requireApiUser } from "@/lib/http";
import { guardarCorreccion } from "@/lib/services/profesor";

type Ctx = { params: Promise<{ entregaId: string }> };

// Guarda (y opcionalmente finaliza) la corrección de una entrega. Solo el profesor dueño del examen.
export async function PUT(req: NextRequest, { params }: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "PROFESOR");
    const { entregaId } = await params;
    return NextResponse.json({ entrega: await guardarCorreccion(user, entregaId, await readJson(req)) });
  });
}
