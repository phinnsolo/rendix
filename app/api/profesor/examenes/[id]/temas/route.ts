import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, requireApiUser } from "@/lib/http";
import { obtenerExamenProfesor } from "@/lib/services/profesor";

type Ctx = { params: Promise<{ id: string }> };

// Temas del examen con sus consignas. Se crean, editan, eliminan y reordenan junto con el
// examen (PUT /api/profesor/examenes/:id), igual que las consignas.
export async function GET(req: NextRequest, { params }: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "PROFESOR");
    const { id } = await params;
    const examen = await obtenerExamenProfesor(user, id);
    return NextResponse.json({
      modo: examen.modo,
      temas: examen.temas.map((t) => ({ ...t, consignas: examen.consignas.filter((c) => c.temaId === t.id) })),
    });
  });
}
