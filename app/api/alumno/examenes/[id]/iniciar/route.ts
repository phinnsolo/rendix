import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, requireApiUser } from "@/lib/http";
import { iniciarExamen } from "@/lib/services/alumno";

type Ctx = { params: Promise<{ id: string }> };

// Comienza el examen: bloquea el tema elegido y empieza a correr el tiempo (si tiene duración).
export async function POST(req: NextRequest, { params }: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "ALUMNO");
    const { id } = await params;
    return NextResponse.json(await iniciarExamen(user, id));
  });
}
