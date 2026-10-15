import Configuracion from "@/components/Configuracion";
import { PageHeader } from "@/components/ui/Misc";
import { requireRole } from "@/lib/session";

export default async function ConfiguracionPage() {
  const user = await requireRole("ALUMNO");
  return (
    <>
      <PageHeader titulo="Configuración" />
      <Configuracion user={user} />
    </>
  );
}
