import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, requireApiUser } from "@/lib/http";
import { obtenerExamenAlumno } from "@/lib/services/alumno";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "ALUMNO");
    const { id } = await params;
    return NextResponse.json({ examen: await obtenerExamenAlumno(user, id) });
  });
}
