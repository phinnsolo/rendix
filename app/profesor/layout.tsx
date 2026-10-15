import AppShell from "@/components/shell/AppShell";
import { requireRole } from "@/lib/session";
import { contarPendientesCorreccion } from "@/lib/services/panel";

export default async function ProfesorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("PROFESOR");
  const pendientes = await contarPendientesCorreccion(user);
  return (
    <AppShell
      user={user}
      badges={{ correcciones: pendientes }}
      notificaciones={
        pendientes > 0
          ? [
              {
                texto: `${pendientes} ${pendientes === 1 ? "entrega pendiente" : "entregas pendientes"} de corrección`,
                href: "/profesor/correcciones",
              },
            ]
          : []
      }
    >
      {children}
    </AppShell>
  );
}
