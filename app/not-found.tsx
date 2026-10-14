import Link from "next/link";

export default function NotFound() {
  return (
    <main className="center-page">
      <div className="center-card">
        <span className="code">ERROR 404</span>
        <h1 style={{ fontSize: "1.6rem" }}>No encontrado</h1>
        <p className="muted">La página o el recurso que buscás no existe o no tenés acceso.</p>
        <Link className="btn" href="/">
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
