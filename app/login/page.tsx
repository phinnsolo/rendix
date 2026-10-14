import type { Metadata } from "next";
import { Clock } from "lucide-react";
import LoginForm from "@/components/LoginForm";
import { fechaPublicacion } from "@/lib/format";

export const metadata: Metadata = { title: "Ingresar | Exámenes Online" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expirada?: string }> }) {
  const { expirada } = await searchParams;
  return (
    <main className="auth-page">
      {/* Portada: como la tapa de un cuaderno de cátedra */}
      <aside className="auth-aside">
        <div className="cover-top">
          <span>Cuaderno de cátedra</span>
          <span>{fechaPublicacion()}</span>
        </div>
        <div style={{ position: "relative" }}>
          <h2 className="cover-title">
            Exámenes
            <em>Online</em>
          </h2>
          <p className="cover-lead">Evaluar con foco. Corregir con criterio. Un espacio para crear, rendir y corregir exámenes.</p>
        </div>
        <svg className="cover-art" viewBox="0 0 340 300" fill="none" aria-hidden>
          <g stroke="currentColor" strokeWidth="1.2">
            <circle cx="170" cy="30" r="14" />
            <path d="M170 44v34M170 78 90 140M170 78l80 62M90 140v52M250 140l-40 70M250 140l40 70M90 192l-36 64M90 192l36 64" />
            <rect x="148" y="70" width="44" height="18" rx="2" />
            <circle cx="90" cy="140" r="12" />
            <circle cx="250" cy="140" r="12" />
            <rect x="74" y="184" width="32" height="16" rx="2" />
            <circle cx="210" cy="216" r="7" />
            <circle cx="290" cy="216" r="7" fill="currentColor" />
            <circle cx="54" cy="262" r="7" />
            <circle cx="126" cy="262" r="7" fill="currentColor" />
          </g>
          <g fontFamily="serif" fontStyle="italic" fontSize="11" fill="currentColor">
            <text x="112" y="108">sí</text>
            <text x="214" y="108">no</text>
          </g>
        </svg>
        <div className="cover-foot">
          <span>Árboles de decisión</span>
          <span>Corrección asistida</span>
          <span>Modo examen</span>
        </div>
      </aside>

      <div className="auth-main">
        <div className="auth-card">
          <span className="eyebrow">Acceso</span>
          <h1>Ingresar</h1>
          <p className="lead">Usá el usuario que te dio tu institución.</p>
          {expirada && (
            <div className="alert alert-neutral" role="status" style={{ marginBottom: "1.25rem" }}>
              <Clock className="icon" aria-hidden />
              <div className="alert-body">Tu sesión expiró. Volvé a ingresar para continuar.</div>
            </div>
          )}
          <LoginForm />
          <p className="auth-footnote">
            <sup>1</sup>No hay registro público: las cuentas las crea la institución.
          </p>
        </div>
      </div>
    </main>
  );
}
