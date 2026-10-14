import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { homeForRol } from "@/lib/jwt";

export default async function NoAutorizadoPage() {
  const user = await getSessionUser();
  return (
    <main className="center-page">
      <div className="center-card">
        <span className="code">ERROR 403</span>
        <h1 style={{ fontSize: "1.6rem" }}>Acceso denegado</h1>
        <p className="muted">Tu usuario no tiene permiso para acceder a esta sección.</p>
        <Link className="btn" href={user ? homeForRol(user.rol) : "/login"}>
          Volver a mi inicio
        </Link>
      </div>
    </main>
  );
}
