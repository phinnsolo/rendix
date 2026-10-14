import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, readJson, requireApiUser } from "@/lib/http";
import { inscribirAlumno } from "@/lib/services/clases";

type Ctx = { params: Promise<{ id: string }> };

// Agrega un alumno a la clase. Si estaba en otra clase del mismo profesor, lo cambia de clase.
export async function POST(req: NextRequest, { params }: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "PROFESOR");
    const { id } = await params;
    return NextResponse.json(await inscribirAlumno(user, id, await readJson(req)), { status: 201 });
  });
}
