import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, readJson, requireApiUser } from "@/lib/http";
import { enviarEntrega } from "@/lib/services/alumno";

type Ctx = { params: Promise<{ id: string }> };

// Solo POST: una entrega es definitiva, no existe endpoint para editarla (PUT/PATCH → 405).
export async function POST(req: NextRequest, { params }: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "ALUMNO");
    const { id } = await params;
    const entrega = await enviarEntrega(user, id, await readJson(req));
    return NextResponse.json({ entrega }, { status: 201 });
  });
}
