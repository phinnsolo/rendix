import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { homeForRol } from "@/lib/jwt";

export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? homeForRol(user.rol) : "/login");
}
