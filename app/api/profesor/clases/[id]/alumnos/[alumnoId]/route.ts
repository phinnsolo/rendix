import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, requireApiUser } from "@/lib/http";
import { quitarAlumno } from "@/lib/services/clases";

type Ctx = { params: Promise<{ id: string; alumnoId: string }> };

// Quita al alumno de la clase: no lo elimina ni toca sus entregas, solo la asociación.
export async function DELETE(req: NextRequest, { params }: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "PROFESOR");
    const { id, alumnoId } = await params;
    return NextResponse.json(await quitarAlumno(user, id, alumnoId));
  });
}
