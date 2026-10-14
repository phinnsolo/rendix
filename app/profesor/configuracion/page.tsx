import { cookies } from "next/headers";
import Configuracion from "@/components/Configuracion";
import { PageHeader } from "@/components/ui/Misc";
import { requireRole } from "@/lib/session";

export default async function ConfiguracionPage() {
  const user = await requireRole("PROFESOR");
  const store = await cookies();
  return (
    <>
      <PageHeader titulo="Configuración" subtitulo="Tu cuenta y tus preferencias de uso." />
      <Configuracion user={user} cabeceraCompacta={store.get("ui-cabecera")?.value === "compacta"} />
    </>
  );
}
