"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { UserAvatar } from "@/components/ui/Misc";

interface Props {
  user: { nombre: string; email: string; rol: "PROFESOR" | "ALUMNO" };
}

const ATAJOS: Record<Props["user"]["rol"], { teclas: string[]; accion: string }[]> = {
  PROFESOR: [
    { teclas: ["Ctrl", "S"], accion: "Guardar el examen en el editor" },
    { teclas: ["Alt", "↑ / ↓"], accion: "Reordenar la pregunta seleccionada" },
    { teclas: ["Ctrl", "Z"], accion: "Deshacer en el editor de diagramas" },
    { teclas: ["Supr"], accion: "Eliminar el elemento seleccionado del diagrama" },
  ],
  ALUMNO: [
    { teclas: ["Ctrl", "Z"], accion: "Deshacer en el editor de diagramas" },
    { teclas: ["Ctrl", "Y"], accion: "Rehacer en el editor de diagramas" },
    { teclas: ["Supr"], accion: "Eliminar el elemento seleccionado del diagrama" },
  ],
};

export default function Configuracion({ user }: Props) {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  async function cerrarSesion() {
    setSaliendo(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="settings">
      <section className="settings-section">
        <div className="settings-intro">
          <h2 className="section-title">Perfil</h2>
        </div>
        <div className="card settings-card">
          <div className="row" style={{ gap: "1rem" }}>
            <UserAvatar nombre={user.nombre} tamanio="lg" />
            <div>
              <div className="strong">{user.nombre}</div>
              <div className="small muted">{user.email}</div>
            </div>
            <span className="badge badge-accent" style={{ marginLeft: "auto" }}>
              {user.rol === "PROFESOR" ? "Profesor" : "Alumno"}
            </span>
          </div>
        </div>
      </section>


      <section className="settings-section">
        <div className="settings-intro">
          <h2 className="section-title">Atajos de teclado</h2>
        </div>
        <div className="card settings-card">
          <ul className="shortcut-list">
            {ATAJOS[user.rol].map((a) => (
              <li key={a.accion}>
                <span>{a.accion}</span>
                <span className="row" style={{ gap: "0.25rem" }}>
                  {a.teclas.map((t) => (
                    <span key={t} className="kbd">
                      {t}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-intro">
          <h2 className="section-title">Sesión</h2>
        </div>
        <div className="card settings-card stack-sm">
          <div className="row small muted">
            <KeyRound width={15} height={15} aria-hidden />
            Para cambiar tu contraseña, contactá a la institución.
          </div>
          <div>
            <button type="button" className="btn btn-secondary" onClick={cerrarSesion} disabled={saliendo}>
              <LogOut className="icon" aria-hidden />
              {saliendo ? "Saliendo..." : "Cerrar sesión"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
