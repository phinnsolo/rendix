import ListaAlumnos from "@/components/profesor/ListaAlumnos";
import { PageHeader } from "@/components/ui/Misc";
import { requireRole } from "@/lib/session";
import { alumnosConResumen } from "@/lib/services/panel";

export default async function AlumnosPage() {
  const user = await requireRole("PROFESOR");
  const alumnos = await alumnosConResumen(user);
  return (
    <>
      <PageHeader titulo="Alumnos" />
      <ListaAlumnos alumnos={alumnos} />
    </>
  );
}
