"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { UserAvatar } from "@/components/ui/Misc";
import { useToast } from "@/components/ui/Toast";

interface Props {
  user: { nombre: string; email: string; rol: "PROFESOR" | "ALUMNO" };
  cabeceraCompacta: boolean;
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

export default function Configuracion({ user, cabeceraCompacta }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [compacto, setCompacto] = useState(cabeceraCompacta);
  const [saliendo, setSaliendo] = useState(false);

  function cambiarCompacto(v: boolean) {
    setCompacto(v);
    document.cookie = `ui-cabecera=${v ? "compacta" : "completa"}; path=/; max-age=31536000; samesite=lax`;
    toast.exito("Preferencia guardada");
    router.refresh();
  }

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
          <p className="small muted">Tus datos los administra la institución.</p>
        </div>
        <div className="card settings-card">
          <div className="row" style={{ gap: "1rem" }}>
            <UserAvatar nombre={user.nombre} tamanio="lg" />
            <div>
              <div className="strong">{user.nombre}</div>
              <div className="small muted">{user.email}</div>
            </div>
            <span className="badge badge-accent" style={{ marginLeft: "auto" }}>
              {user.rol === "PROFESOR" ? "Profesor/a" : "Alumno/a"}
            </span>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-intro">
          <h2 className="section-title">Interfaz</h2>
          <p className="small muted">Se guarda en este navegador.</p>
        </div>
        <div className="card settings-card">
          <label className="switch-row">
            <span className="grow">
              <span className="choice-title">Cabecera compacta</span>
              <span className="choice-desc">Oculta el encabezado grande y deja solo el índice, para ganar espacio vertical.</span>
            </span>
            <input type="checkbox" role="switch" className="switch" checked={compacto} onChange={(e) => cambiarCompacto(e.target.checked)} />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-intro">
          <h2 className="section-title">Atajos de teclado</h2>
          <p className="small muted">Para trabajar más rápido.</p>
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
          <p className="small muted">La sesión expira automáticamente a las 8 horas.</p>
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
