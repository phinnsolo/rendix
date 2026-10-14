import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, requireApiUser } from "@/lib/http";
import { listarAlumnosGestion } from "@/lib/services/clases";

// Alumnos con su clase: los de las clases del profesor, los que no tienen clase y
// (sin datos de la clase) los que pertenecen a otro profesor.
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "PROFESOR");
    return NextResponse.json({ alumnos: await listarAlumnosGestion(user) });
  });
}
