import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, requireApiUser } from "@/lib/http";
import { listarExamenesAlumno } from "@/lib/services/alumno";

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "ALUMNO");
    return NextResponse.json({ examenes: await listarExamenesAlumno(user) });
  });
}
