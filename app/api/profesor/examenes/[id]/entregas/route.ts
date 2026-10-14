import { NextResponse, type NextRequest } from "next/server";
import { handleRoute, requireApiUser } from "@/lib/http";
import { listarEntregasExamen } from "@/lib/services/profesor";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  return handleRoute(async () => {
    const user = await requireApiUser(req, "PROFESOR");
    const { id } = await params;
    return NextResponse.json({ entregas: await listarEntregasExamen(user, id) });
  });
}
