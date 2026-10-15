import BandejaCorrecciones from "@/components/profesor/BandejaCorrecciones";
import { PageHeader } from "@/components/ui/Misc";
import { requireRole } from "@/lib/session";
import { bandejaCorrecciones } from "@/lib/services/panel";

export default async function CorreccionesPage() {
  const user = await requireRole("PROFESOR");
  const entregas = await bandejaCorrecciones(user);
  return (
    <>
      <PageHeader
        titulo="Correcciones"
      />
      <BandejaCorrecciones entregas={entregas} />
    </>
  );
}
