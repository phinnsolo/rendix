import ClaseDetalleVista from "@/components/profesor/ClaseDetalleVista";
import { FlashToast } from "@/components/ui/Toast";
import { cargarOFallar } from "@/lib/page-load";
import { requireRole } from "@/lib/session";
import { listarAlumnosGestion, listarClasesProfesor, obtenerClase } from "@/lib/services/clases";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creada?: string }>;
}

export default async function ClasePage({ params, searchParams }: Props) {
  const user = await requireRole("PROFESOR");
  const { id } = await params;
  const { creada } = await searchParams;
  // El servicio verifica que la clase sea de este profesor (404 / 403).
  const clase = await cargarOFallar(() => obtenerClase(user, id));
  const [clases, alumnos] = await Promise.all([listarClasesProfesor(user), listarAlumnosGestion(user)]);
  return (
    <>
      {creada && <FlashToast parametro="creada" mensaje="Clase creada: ahora agregale alumnos" />}
      <ClaseDetalleVista key={clase.id} clase={clase} clases={clases} alumnos={alumnos} />
    </>
  );
}
