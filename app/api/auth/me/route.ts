import { NextResponse, type NextRequest } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { handleRoute, unauthorized } from "@/lib/http";
import { SESSION_COOKIE } from "@/lib/jwt";

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await getUserFromToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (!user) throw unauthorized();
    return NextResponse.json({ user });
  });
}
