"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, ChevronDown, LogOut, Settings, X } from "lucide-react";
import Dropdown, { type DropdownItem } from "@/components/ui/Dropdown";
import { UserAvatar } from "@/components/ui/Misc";

type Rol = "PROFESOR" | "ALUMNO";

interface NavItem {
  href: string;
  label: string;
  /** Coincidencia exacta (para "Inicio"). */
  exacto?: boolean;
  badgeKey?: "correcciones";
}

const NAV: Record<Rol, NavItem[]> = {
  PROFESOR: [
    { href: "/profesor", label: "Inicio", exacto: true },
    { href: "/profesor/examenes", label: "Exámenes" },
    { href: "/profesor/clases", label: "Clases" },
    { href: "/profesor/preguntas", label: "Preguntas" },
    { href: "/profesor/alumnos", label: "Alumnos" },
    { href: "/profesor/correcciones", label: "Correcciones", badgeKey: "correcciones" },
    { href: "/profesor/resultados", label: "Resultados" },
    { href: "/profesor/configuracion", label: "Configuración" },
  ],
  ALUMNO: [
    { href: "/alumno", label: "Mis exámenes", exacto: true },
    { href: "/alumno/configuracion", label: "Configuración" },
  ],
};

interface Miga {
  label: string;
  href?: string;
}

/** Ubicación actual a partir de la ruta: siempre deja claro dónde está el usuario. */
function migas(pathname: string, rol: Rol): Miga[] {
  const s = pathname.split("/").filter(Boolean);
  if (rol === "ALUMNO") {
    const base = { label: "Mis exámenes", href: "/alumno" };
    if (s[1] === "examenes" && s[2]) return [base, { label: "Examen" }];
    if (s[1] === "configuracion") return [{ label: "Configuración" }];
    return [{ label: "Mis exámenes" }];
  }
  const secciones: Record<string, string> = {
    examenes: "Exámenes",
    clases: "Clases",
    preguntas: "Preguntas",
    alumnos: "Alumnos",
    correcciones: "Correcciones",
    resultados: "Resultados",
    configuracion: "Configuración",
  };
  if (!s[1]) return [{ label: "Inicio" }];
  const seccion = secciones[s[1]] ?? "Inicio";
  if (s[1] === "clases" && s[2]) return [{ label: "Clases", href: "/profesor/clases" }, { label: "Clase" }];
  if (s[1] !== "examenes" || !s[2]) return [{ label: seccion }];
  const examenes = { label: "Exámenes", href: "/profesor/examenes" };
  if (s[2] === "nuevo") return [examenes, { label: "Nuevo examen" }];
  const examen = { label: "Examen", href: `/profesor/examenes/${s[2]}` };
  if (s[3] === "editar") return [examenes, examen, { label: "Edición" }];
  if (s[3] === "entregas") return [examenes, { ...examen, href: `/profesor/examenes/${s[2]}#entregas` }, { label: "Corrección" }];
  return [examenes, { label: "Detalle" }];
}


interface Props {
  user: { nombre: string; email: string; rol: Rol };
  badges?: { correcciones?: number };
  notificaciones: { texto: string; href: string }[];
  children: ReactNode;
}

export default function AppShell({ user, badges = {}, notificaciones, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [indiceAbierto, setIndiceAbierto] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  // Cerrar el índice móvil al navegar y con Escape.
  useEffect(() => setIndiceAbierto(false), [pathname]);
  useEffect(() => {
    if (!indiceAbierto) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIndiceAbierto(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [indiceAbierto]);

  async function cerrarSesion() {
    setSaliendo(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const items = NAV[user.rol];
  const activo = (item: NavItem) =>
    item.exacto ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const breadcrumb = migas(pathname, user.rol);
  const base = user.rol === "PROFESOR" ? "/profesor" : "/alumno";

  const menuUsuario: DropdownItem[] = [
    { tipo: "titulo", label: user.email },
    { label: "Configuración", href: `${base}/configuracion`, icon: Settings },
    { tipo: "separador" },
    { tipo: "accion", label: saliendo ? "Saliendo..." : "Cerrar sesión", onSelect: cerrarSesion, icon: LogOut, disabled: saliendo },
  ];
  const menuAvisos: DropdownItem[] =
    notificaciones.length > 0
      ? [{ tipo: "titulo", label: "Requiere tu atención" }, ...notificaciones.map((n) => ({ label: n.texto, href: n.href }))]
      : [{ tipo: "titulo", label: "Sin avisos nuevos" }];

  return (
    <div className="publication">
      <a href="#contenido" className="sr-only">
        Saltar al contenido
      </a>

      {/* ---------- Barra superior ---------- */}
      <nav className="index-bar" aria-label="Índice">
        <div className="index-inner">
          <Link href={base} className="index-mark" aria-label="Exámenes Online UADE, inicio">
            <Image src="/uade-wordmark.png" alt="UADE" width={387} height={127} className="index-logo" priority />
            <span className="index-app">Exámenes Online</span>
          </Link>
          <ol className="index-list">
            {items.map((item) => {
              const badge = item.badgeKey ? badges[item.badgeKey] : undefined;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="index-link"
                    aria-current={activo(item) ? "page" : undefined}
                    aria-label={badge ? `${item.label} (${badge} pendientes)` : undefined}
                  >
                    {item.label}
                    {badge ? (
                      <sup className="index-badge" aria-hidden>
                        {badge}
                      </sup>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="index-toggle"
            onClick={() => setIndiceAbierto(true)}
            aria-expanded={indiceAbierto}
            aria-controls="indice-movil"
          >
            <BookOpen width={15} height={15} aria-hidden />
            Índice
          </button>
          <div className="index-tools">
            <Dropdown
              triggerClassName="index-tool"
              triggerLabel={notificaciones.length > 0 ? `Avisos (${notificaciones.length})` : "Avisos"}
              trigger={
                <>
                  Avisos
                  {notificaciones.length > 0 && <span className="index-badge">{notificaciones.length}</span>}
                </>
              }
              items={menuAvisos}
            />
            <Dropdown
              triggerClassName="index-tool index-user"
              triggerLabel={`Cuenta de ${user.nombre}`}
              trigger={
                <>
                  <UserAvatar nombre={user.nombre} tamanio="sm" />
                  <ChevronDown width={13} height={13} aria-hidden />
                </>
              }
              items={menuUsuario}
            />
          </div>
        </div>
      </nav>

      {/* ---------- Índice móvil: tabla de contenidos ---------- */}
      {indiceAbierto && (
        <div className="toc-overlay" id="indice-movil" role="dialog" aria-modal="true" aria-label="Índice">
          <div className="toc-head">
            <span className="eyebrow">Índice</span>
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => setIndiceAbierto(false)} aria-label="Cerrar índice">
              <X className="icon" aria-hidden />
            </button>
          </div>
          <ol className="toc-list">
            {items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="toc-link" aria-current={activo(item) ? "page" : undefined}>
                  <span>{item.label}</span>
                  <span className="leader-dots" aria-hidden />
                  <span className="toc-page">{item.badgeKey && badges[item.badgeKey] ? `${badges[item.badgeKey]} pend.` : "→"}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}

      <main id="contenido" className="app-content" key={pathname}>
        {breadcrumb.length > 1 && (
          <nav className="running-head" aria-label="Ubicación">
            <ol>
              {breadcrumb.map((m, i) => (
                <li key={i}>
                  {m.href ? (
                    <Link href={m.href}>{m.label}</Link>
                  ) : (
                    <span aria-current={i === breadcrumb.length - 1 ? "page" : undefined}>{m.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        {children}
      </main>
    </div>
  );
}
