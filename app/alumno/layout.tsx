import { cookies } from "next/headers";
import AppShell from "@/components/shell/AppShell";
import { fechaPublicacion } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { listarExamenesAlumno } from "@/lib/services/alumno";

export default async function AlumnoLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("ALUMNO");
  const [store, examenes] = await Promise.all([cookies(), listarExamenesAlumno(user)]);
  const pendientes = examenes.filter((e) => !e.entregado);
  return (
    <AppShell
      user={user}
      fecha={fechaPublicacion()}
      colapsadoInicial={store.get("ui-cabecera")?.value === "compacta"}
      notificaciones={pendientes.map((e) => ({ texto: `Pendiente: ${e.titulo}`, href: `/alumno/examenes/${e.id}` }))}
    >
      {children}
    </AppShell>
  );
}
