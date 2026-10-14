import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, readJson, requireApiUser } from "@/lib/http";
import { crearClase, listarClasesProfesor } from "@/lib/services/clases";

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "PROFESOR");
    return NextResponse.json({ clases: await listarClasesProfesor(user) });
  });
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "PROFESOR");
    const clase = await crearClase(user, await readJson(req));
    return NextResponse.json({ clase }, { status: 201 });
  });
}
