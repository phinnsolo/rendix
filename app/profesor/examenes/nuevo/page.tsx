import ExamenForm from "@/components/profesor/ExamenForm";
import { requireRole } from "@/lib/session";
import { listarClasesProfesor } from "@/lib/services/clases";

export default async function NuevoExamenPage({ searchParams }: { searchParams: Promise<{ clase?: string }> }) {
  const user = await requireRole("PROFESOR");
  const [clases, { clase }] = await Promise.all([listarClasesProfesor(user), searchParams]);
  return (
    <div className="layout-wide">
      <h1 className="sr-only">Crear examen</h1>
      <ExamenForm
        clases={clases.map((c) => ({ id: c.id, nombre: c.nombre, alumnos: c.alumnos }))}
        // Solo se preselecciona si la clase es del profesor (el backend lo vuelve a validar).
        claseInicial={clases.some((c) => c.id === clase) ? clase : undefined}
      />
    </div>
  );
}
