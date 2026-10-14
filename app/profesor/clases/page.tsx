import ClasesLista, { CrearClaseButton } from "@/components/profesor/ClasesLista";
import { PageHeader } from "@/components/ui/Misc";
import { requireRole } from "@/lib/session";
import { listarClasesProfesor } from "@/lib/services/clases";

export default async function ClasesPage() {
  const user = await requireRole("PROFESOR");
  const clases = await listarClasesProfesor(user);
  return (
    <>
      <PageHeader
        titulo="Clases"
        subtitulo="Tus comisiones y sus alumnos. Cada examen se asigna a una clase: lo ven todos sus alumnos."
        acciones={clases.length > 0 ? <CrearClaseButton /> : undefined}
      />
      <ClasesLista clases={clases} />
    </>
  );
}
