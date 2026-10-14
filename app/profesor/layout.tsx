import { cookies } from "next/headers";
import AppShell from "@/components/shell/AppShell";
import { fechaPublicacion } from "@/lib/format";
import { requireRole } from "@/lib/session";
import { contarPendientesCorreccion } from "@/lib/services/panel";

export default async function ProfesorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("PROFESOR");
  const [store, pendientes] = await Promise.all([cookies(), contarPendientesCorreccion(user)]);
  return (
    <AppShell
      user={user}
      fecha={fechaPublicacion()}
      colapsadoInicial={store.get("ui-cabecera")?.value === "compacta"}
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
