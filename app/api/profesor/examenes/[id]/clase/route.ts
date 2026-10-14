import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, readJson, requireApiUser } from "@/lib/http";
import { asignarClaseExamen } from "@/lib/services/profesor";

type Ctx = { params: Promise<{ id: string }> };

// Asigna (o cambia) la clase del examen: todos los alumnos de esa clase pasan a tener acceso.
export async function PUT(req: NextRequest, { params }: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "PROFESOR");
    const { id } = await params;
    return NextResponse.json({ examen: await asignarClaseExamen(user, id, await readJson(req)) });
  });
}
