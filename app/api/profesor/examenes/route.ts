import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, readJson, requireApiUser } from "@/lib/http";
import { crearExamen, listarExamenesProfesor } from "@/lib/services/profesor";

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "PROFESOR");
    return NextResponse.json({ examenes: await listarExamenesProfesor(user) });
  });
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "PROFESOR");
    const examen = await crearExamen(user, await readJson(req));
    return NextResponse.json({ examen }, { status: 201 });
  });
}
