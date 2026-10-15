import Link from "next/link";
import { Plus } from "lucide-react";
import ExamList from "@/components/profesor/ExamList";
import { PageHeader } from "@/components/ui/Misc";
import { requireRole } from "@/lib/session";
import { resumenExamenes } from "@/lib/services/panel";

export default async function ExamenesPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const user = await requireRole("PROFESOR");
  const [examenes, { estado }] = await Promise.all([resumenExamenes(user), searchParams]);
  return (
    <>
      <PageHeader
        titulo="Exámenes"
        acciones={
          <Link href="/profesor/examenes/nuevo" className="btn">
            <Plus className="icon" aria-hidden />
            Crear examen
          </Link>
        }
      />
      <ExamList examenes={examenes} filtroInicial={estado} />
    </>
  );
}
