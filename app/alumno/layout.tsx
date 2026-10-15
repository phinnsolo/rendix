import AppShell from "@/components/shell/AppShell";
import { requireRole } from "@/lib/session";
import { listarExamenesAlumno } from "@/lib/services/alumno";

export default async function AlumnoLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("ALUMNO");
  const examenes = await listarExamenesAlumno(user);
  const pendientes = examenes.filter((e) => !e.entregado);
  return (
    <AppShell
      user={user}
      notificaciones={pendientes.map((e) => ({ texto: `Pendiente: ${e.titulo}`, href: `/alumno/examenes/${e.id}` }))}
    >
      {children}
    </AppShell>
  );
}
