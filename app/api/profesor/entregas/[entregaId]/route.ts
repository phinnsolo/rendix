import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, requireApiUser } from "@/lib/http";
import { obtenerEntregaProfesor } from "@/lib/services/profesor";

type Ctx = { params: Promise<{ entregaId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "PROFESOR");
    const { entregaId } = await params;
    return NextResponse.json({ entrega: await obtenerEntregaProfesor(user, entregaId) });
  });
}
