-- CreateEnum
CREATE TYPE "ModoExamen" AS ENUM ('NORMAL', 'POR_TEMAS');

-- AlterEnum
ALTER TYPE "EstadoEntrega" ADD VALUE 'EN_CURSO';

-- AlterTable
ALTER TABLE "Consigna" ADD COLUMN     "temaId" TEXT;

-- AlterTable
ALTER TABLE "Entrega" ADD COLUMN     "fechaInicio" TIMESTAMP(3),
ADD COLUMN     "temaId" TEXT,
ALTER COLUMN "fechaEntrega" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Examen" ADD COLUMN     "claseId" TEXT,
ADD COLUMN     "duracionMinutos" INTEGER,
ADD COLUMN     "fechaDisponible" TIMESTAMP(3),
ADD COLUMN     "modo" "ModoExamen" NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE "Clase" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "profesorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InscripcionClase" (
    "id" TEXT NOT NULL,
    "claseId" TEXT NOT NULL,
    "alumnoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InscripcionClase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tema" (
    "id" TEXT NOT NULL,
    "examenId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "titulo" TEXT,
    "descripcion" TEXT,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "Tema_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Clase_profesorId_idx" ON "Clase"("profesorId");

-- CreateIndex
CREATE UNIQUE INDEX "Clase_profesorId_nombre_key" ON "Clase"("profesorId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "InscripcionClase_alumnoId_key" ON "InscripcionClase"("alumnoId");

-- CreateIndex
CREATE INDEX "InscripcionClase_claseId_idx" ON "InscripcionClase"("claseId");

-- CreateIndex
CREATE UNIQUE INDEX "Tema_id_examenId_key" ON "Tema"("id", "examenId");

-- CreateIndex
CREATE UNIQUE INDEX "Tema_examenId_orden_key" ON "Tema"("examenId", "orden");

-- CreateIndex
CREATE INDEX "Consigna_temaId_idx" ON "Consigna"("temaId");

-- CreateIndex
CREATE INDEX "Entrega_temaId_idx" ON "Entrega"("temaId");

-- CreateIndex
CREATE INDEX "Examen_claseId_idx" ON "Examen"("claseId");

-- AddForeignKey
ALTER TABLE "Clase" ADD CONSTRAINT "Clase_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscripcionClase" ADD CONSTRAINT "InscripcionClase_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "Clase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscripcionClase" ADD CONSTRAINT "InscripcionClase_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Examen" ADD CONSTRAINT "Examen_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "Clase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tema" ADD CONSTRAINT "Tema_examenId_fkey" FOREIGN KEY ("examenId") REFERENCES "Examen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consigna" ADD CONSTRAINT "Consigna_temaId_examenId_fkey" FOREIGN KEY ("temaId", "examenId") REFERENCES "Tema"("id", "examenId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_temaId_examenId_fkey" FOREIGN KEY ("temaId", "examenId") REFERENCES "Tema"("id", "examenId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Migración de datos: de asignaciones individuales (AsignacionExamen) a CLASES.
-- No se borra nada: AsignacionExamen se conserva como histórico.
-- ============================================================================

-- 1) Cada profesor con exámenes recibe una clase "Sin asignar".
INSERT INTO "Clase" ("id", "nombre", "descripcion", "profesorId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       'Sin asignar',
       'Creada automáticamente al migrar las asignaciones individuales. Podés renombrarla o mover a sus alumnos a otra clase.',
       p."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Usuario" p
WHERE p."rol" = 'PROFESOR' AND EXISTS (SELECT 1 FROM "Examen" e WHERE e."profesorId" = p."id");

-- 2) Cada alumno con asignaciones se inscribe en la clase "Sin asignar" del profesor
--    de su examen asignado más reciente (un alumno pertenece a una sola clase).
INSERT INTO "InscripcionClase" ("id", "claseId", "alumnoId", "createdAt")
SELECT gen_random_uuid()::text, c."id", x."alumnoId", CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (a."alumnoId") a."alumnoId", e."profesorId"
  FROM "AsignacionExamen" a
  JOIN "Examen" e ON e."id" = a."examenId"
  ORDER BY a."alumnoId", e."fechaCreacion" DESC
) x
JOIN "Clase" c ON c."profesorId" = x."profesorId" AND c."nombre" = 'Sin asignar';

-- 3) Si hay un único profesor, los alumnos que quedaron sin clase también se inscriben
--    en su clase "Sin asignar" (con varios profesores quedan sin clase y cualquier
--    profesor puede incorporarlos desde la sección Clases).
INSERT INTO "InscripcionClase" ("id", "claseId", "alumnoId", "createdAt")
SELECT gen_random_uuid()::text, c."id", u."id", CURRENT_TIMESTAMP
FROM "Usuario" u
CROSS JOIN "Clase" c
WHERE u."rol" = 'ALUMNO'
  AND c."nombre" = 'Sin asignar'
  AND (SELECT COUNT(*) FROM "Usuario" WHERE "rol" = 'PROFESOR') = 1
  AND NOT EXISTS (SELECT 1 FROM "InscripcionClase" i WHERE i."alumnoId" = u."id");

-- 4) Los exámenes existentes quedan asignados a la clase "Sin asignar" de su profesor.
UPDATE "Examen" e
SET "claseId" = c."id"
FROM "Clase" c
WHERE c."profesorId" = e."profesorId" AND c."nombre" = 'Sin asignar' AND e."claseId" IS NULL;

-- ============================================================================
-- Reglas de integridad a nivel de base de datos.
-- ============================================================================

-- Una entrega EN_CURSO todavía no tiene fecha de entrega; una entregada siempre la tiene.
-- (Se compara como texto porque el valor del enum se agregó en esta misma transacción.)
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_fechaEntrega_estado_check"
  CHECK (("estado"::text = 'EN_CURSO') = ("fechaEntrega" IS NULL));
ALTER TABLE "Examen" ADD CONSTRAINT "Examen_duracionMinutos_check"
  CHECK ("duracionMinutos" IS NULL OR ("duracionMinutos" >= 1 AND "duracionMinutos" <= 1440));
ALTER TABLE "Tema" ADD CONSTRAINT "Tema_orden_positivo_check" CHECK ("orden" >= 1);
