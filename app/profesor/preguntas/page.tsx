import BancoPreguntas from "@/components/profesor/BancoPreguntas";
import { PageHeader } from "@/components/ui/Misc";
import { requireRole } from "@/lib/session";
import { bancoPreguntas } from "@/lib/services/panel";

export default async function PreguntasPage() {
  const user = await requireRole("PROFESOR");
  const preguntas = await bancoPreguntas(user);
  return (
    <>
      <PageHeader
        titulo="Preguntas"
      />
      <BancoPreguntas preguntas={preguntas} />
    </>
  );
}
