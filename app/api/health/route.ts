import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Health check público: confirma que la app responde y que la base es alcanzable.
// No expone host, versión ni mensajes de error: el detalle queda solo en los logs.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ application: "ok", database: "ok" });
  } catch (error) {
    console.error("Health check: la base de datos no responde", error);
    return NextResponse.json({ application: "ok", database: "error" }, { status: 503 });
  }
}
