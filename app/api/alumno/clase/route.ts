import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, requireApiUser } from "@/lib/http";
import { claseDelAlumno } from "@/lib/services/alumno";

// Clase actual del alumno autenticado (null si todavía no pertenece a ninguna).
export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "ALUMNO");
    return NextResponse.json({ clase: await claseDelAlumno(user.id) });
  });
}
