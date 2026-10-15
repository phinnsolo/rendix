import type { Metadata } from "next";
import Image from "next/image";
import { Clock } from "lucide-react";
import LoginForm from "@/components/LoginForm";

export const metadata: Metadata = { title: "Ingresar | Exámenes Online UADE" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expirada?: string }> }) {
  const { expirada } = await searchParams;
  return (
    <main className="auth-page">
      <aside className="auth-aside">
        <a href="https://www.uade.edu.ar" className="auth-logo" target="_blank" rel="noopener noreferrer">
          <Image src="/uade-logo.png" alt="UADE — Universidad Argentina de la Empresa" width={387} height={187} priority />
        </a>
        <h2 className="cover-title">Exámenes Online</h2>
      </aside>

      <div className="auth-main">
        <div className="auth-card">
          <Image src="/uade-logo.png" alt="UADE" width={387} height={187} className="auth-card-logo" />
          <h1>Ingresar</h1>
          {expirada && (
            <div className="alert alert-neutral" role="status" style={{ marginBottom: "1.25rem" }}>
              <Clock className="icon" aria-hidden />
              <div className="alert-body">Tu sesión expiró. Volvé a ingresar.</div>
            </div>
          )}
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
