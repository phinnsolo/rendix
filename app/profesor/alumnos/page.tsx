import ListaAlumnos from "@/components/profesor/ListaAlumnos";
import { PageHeader } from "@/components/ui/Misc";
import { requireRole } from "@/lib/session";
import { alumnosConResumen } from "@/lib/services/panel";

export default async function AlumnosPage() {
  const user = await requireRole("PROFESOR");
  const alumnos = await alumnosConResumen(user);
  return (
    <>
      <PageHeader titulo="Alumnos" subtitulo="Alumnos de tus clases y sin clase asignada: actividad, promedio y pendientes. Para agregarlos o moverlos, entrá a la clase." />
      <ListaAlumnos alumnos={alumnos} />
    </>
  );
}
